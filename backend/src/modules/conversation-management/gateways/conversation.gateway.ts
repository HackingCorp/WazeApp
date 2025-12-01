import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Logger, UseGuards } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import {
  User,
  Organization,
  AgentConversation,
  ConversationContext,
  WebhookEvent,
} from "../../../common/entities";
import {
  ConversationState,
  WebhookEventType,
  MessageRole,
} from "../../../common/enums";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  organizationId?: string;
  user?: User;
}

interface TypingIndicatorData {
  conversationId: string;
  isTyping: boolean;
}

interface PresenceData {
  status: "online" | "away" | "offline";
}

interface JoinRoomData {
  conversationId: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3100",
    credentials: true,
  },
  namespace: "/conversations",
})
export class ConversationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ConversationGateway.name);
  private readonly connectedUsers = new Map<string, Set<string>>(); // userId -> socketIds
  private readonly userPresence = new Map<
    string,
    "online" | "away" | "offline"
  >();
  private readonly typingUsers = new Map<string, Set<string>>(); // conversationId -> userIds

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(ConversationContext)
    private contextRepository: Repository<ConversationContext>,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
  ) {}

  afterInit(server: Server) {
    this.logger.log("WebSocket Gateway initialized");
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate user
      const token = this.extractTokenFromSocket(client);
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      // Set user information
      client.userId = user.id;
      client.organizationId = payload.organizationId;
      client.user = user;

      // Track connection
      if (!this.connectedUsers.has(user.id)) {
        this.connectedUsers.set(user.id, new Set());
      }
      this.connectedUsers.get(user.id)!.add(client.id);

      // Update presence
      this.userPresence.set(user.id, "online");

      // Join user to their organization room
      if (payload.organizationId) {
        client.join(`org:${payload.organizationId}`);
      }

      // Emit presence update
      this.emitPresenceUpdate(user.id, "online", payload.organizationId);

      this.logger.log(`User ${user.email} connected (${client.id})`);
    } catch (error) {
      this.logger.error(`Connection failed: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (!client.userId) return;

    // Remove from connected users
    const userSockets = this.connectedUsers.get(client.userId);
    if (userSockets) {
      userSockets.delete(client.id);

      // If no more connections, update presence
      if (userSockets.size === 0) {
        this.connectedUsers.delete(client.userId);
        this.userPresence.set(client.userId, "offline");

        // Emit presence update
        this.emitPresenceUpdate(
          client.userId,
          "offline",
          client.organizationId,
        );
      }
    }

    // Remove from typing indicators
    this.removeFromTypingIndicators(client.userId);

    this.logger.log(`User ${client.userId} disconnected (${client.id})`);
  }

  /**
   * Join conversation room
   */
  @SubscribeMessage("join_conversation")
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinRoomData,
  ) {
    try {
      // Verify user has access to conversation
      const conversation = await this.conversationRepository.findOne({
        where: {
          id: data.conversationId,
          agent: {
            organizationId: client.organizationId,
          },
        },
        relations: ["agent", "user"],
      });

      if (!conversation) {
        client.emit("error", { message: "Conversation not found" });
        return;
      }

      // Join conversation room
      client.join(`conversation:${data.conversationId}`);

      // Get conversation context
      const context = await this.contextRepository.findOne({
        where: { conversationId: data.conversationId },
      });

      // Emit join confirmation with conversation state
      client.emit("conversation_joined", {
        conversationId: data.conversationId,
        state: context?.currentState,
        participants: await this.getConversationParticipants(
          data.conversationId,
        ),
      });

      this.logger.log(
        `User ${client.userId} joined conversation ${data.conversationId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to join conversation: ${error.message}`);
      client.emit("error", { message: "Failed to join conversation" });
    }
  }

  /**
   * Leave conversation room
   */
  @SubscribeMessage("leave_conversation")
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinRoomData,
  ) {
    client.leave(`conversation:${data.conversationId}`);

    // Remove from typing indicators
    this.removeUserFromTyping(data.conversationId, client.userId!);

    client.emit("conversation_left", { conversationId: data.conversationId });

    this.logger.log(
      `User ${client.userId} left conversation ${data.conversationId}`,
    );
  }

  /**
   * Handle typing indicators
   */
  @SubscribeMessage("typing")
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: TypingIndicatorData,
  ) {
    const { conversationId, isTyping } = data;

    if (!this.typingUsers.has(conversationId)) {
      this.typingUsers.set(conversationId, new Set());
    }

    const typingInConversation = this.typingUsers.get(conversationId)!;

    if (isTyping) {
      typingInConversation.add(client.userId!);
    } else {
      typingInConversation.delete(client.userId!);
    }

    // Broadcast typing status to conversation room
    client.to(`conversation:${conversationId}`).emit("user_typing", {
      conversationId,
      userId: client.userId,
      userName: client.user?.fullName,
      isTyping,
      typingUsers: Array.from(typingInConversation),
    });
  }

  /**
   * Handle presence updates
   */
  @SubscribeMessage("presence")
  async handlePresence(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: PresenceData,
  ) {
    this.userPresence.set(client.userId!, data.status);

    // Broadcast presence update
    this.emitPresenceUpdate(client.userId!, data.status, client.organizationId);
  }

  /**
   * Handle message delivery confirmation
   */
  @SubscribeMessage("message_delivered")
  async handleMessageDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; conversationId: string },
  ) {
    // Emit delivery confirmation to conversation
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit("message_status_update", {
        messageId: data.messageId,
        status: "delivered",
        timestamp: new Date(),
      });
  }

  /**
   * Handle message read confirmation
   */
  @SubscribeMessage("message_read")
  async handleMessageRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; conversationId: string },
  ) {
    // Emit read confirmation to conversation
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit("message_status_update", {
        messageId: data.messageId,
        status: "read",
        readBy: client.userId,
        timestamp: new Date(),
      });
  }

  /**
   * Event handlers for internal events
   */

  @OnEvent("message.received")
  async handleMessageReceived(payload: {
    conversationId: string;
    message: any;
    organizationId: string;
  }) {
    // Broadcast new message to conversation room
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit("message_received", {
        conversationId: payload.conversationId,
        message: payload.message,
        timestamp: new Date(),
      });

    // Also broadcast to organization room for notifications
    this.server
      .to(`org:${payload.organizationId}`)
      .emit("conversation_activity", {
        type: "new_message",
        conversationId: payload.conversationId,
        preview: payload.message.content?.substring(0, 100),
      });
  }

  @OnEvent("message.sent")
  async handleMessageSent(payload: {
    conversationId: string;
    message: any;
    organizationId: string;
  }) {
    // Remove typing indicator when message is sent
    if (payload.message.role === MessageRole.USER) {
      this.removeUserFromTyping(payload.conversationId, payload.message.userId);
    }

    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit("message_sent", {
        conversationId: payload.conversationId,
        message: payload.message,
        timestamp: new Date(),
      });
  }

  @OnEvent("conversation.state.changed")
  async handleConversationStateChanged(payload: {
    conversationId: string;
    previousState: ConversationState;
    newState: ConversationState;
    reason?: string;
    context: ConversationContext;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit("conversation_state_changed", {
        conversationId: payload.conversationId,
        previousState: payload.previousState,
        newState: payload.newState,
        reason: payload.reason,
        timestamp: new Date(),
      });

    // Get conversation to access organizationId through agent
    const conversation = await this.conversationRepository.findOne({
      where: { id: payload.conversationId },
      relations: ["agent"],
    });

    if (conversation?.agent) {
      // Emit to organization for dashboard updates
      this.server
        .to(`org:${conversation.agent.organizationId}`)
        .emit("conversation_update", {
          conversationId: payload.conversationId,
          state: payload.newState,
          timestamp: new Date(),
        });
    }
  }

  @OnEvent("webhook.processed")
  async handleWebhookProcessed(payload: { event: WebhookEvent; result: any }) {
    const { event } = payload;

    // Broadcast WhatsApp events to organization
    this.server.to(`org:${event.organizationId}`).emit("whatsapp_event", {
      type: event.eventType,
      data: event.processedData,
      timestamp: new Date(),
    });

    // Handle specific event types
    switch (event.eventType) {
      case WebhookEventType.MESSAGE_RECEIVED:
        // Find conversation and broadcast
        // Implementation depends on webhook payload structure
        break;

      case WebhookEventType.TYPING_START:
      case WebhookEventType.TYPING_STOP:
        // Broadcast typing indicators from WhatsApp
        if (payload.result.conversationId) {
          this.server
            .to(`conversation:${payload.result.conversationId}`)
            .emit("whatsapp_typing", {
              conversationId: payload.result.conversationId,
              isTyping: event.eventType === WebhookEventType.TYPING_START,
              source: "whatsapp",
            });
        }
        break;
    }
  }

  @OnEvent("agent.processing.started")
  async handleAgentProcessingStarted(payload: {
    conversationId: string;
    agentId: string;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit("agent_processing", {
        conversationId: payload.conversationId,
        status: "started",
        timestamp: new Date(),
      });
  }

  @OnEvent("agent.processing.completed")
  async handleAgentProcessingCompleted(payload: {
    conversationId: string;
    agentId: string;
    response: any;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit("agent_processing", {
        conversationId: payload.conversationId,
        status: "completed",
        response: payload.response,
        timestamp: new Date(),
      });
  }

  /**
   * Utility methods
   */

  private extractTokenFromSocket(client: Socket): string | null {
    // Extract token from handshake auth or query
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace("Bearer ", "") ||
      client.handshake.query?.token;

    return (token as string) || null;
  }

  private emitPresenceUpdate(
    userId: string,
    status: "online" | "away" | "offline",
    organizationId?: string,
  ) {
    if (organizationId) {
      this.server.to(`org:${organizationId}`).emit("presence_update", {
        userId,
        status,
        timestamp: new Date(),
      });
    }
  }

  private removeFromTypingIndicators(userId: string) {
    for (const [conversationId, typingUsers] of this.typingUsers.entries()) {
      if (typingUsers.has(userId)) {
        typingUsers.delete(userId);

        // Broadcast typing stopped
        this.server.to(`conversation:${conversationId}`).emit("user_typing", {
          conversationId,
          userId,
          isTyping: false,
          typingUsers: Array.from(typingUsers),
        });
      }
    }
  }

  private removeUserFromTyping(conversationId: string, userId: string) {
    const typingUsers = this.typingUsers.get(conversationId);
    if (typingUsers?.has(userId)) {
      typingUsers.delete(userId);

      this.server.to(`conversation:${conversationId}`).emit("user_typing", {
        conversationId,
        userId,
        isTyping: false,
        typingUsers: Array.from(typingUsers),
      });
    }
  }

  private async getConversationParticipants(
    conversationId: string,
  ): Promise<any[]> {
    // Get users currently in conversation room
    const room = this.server.sockets.adapter.rooms.get(
      `conversation:${conversationId}`,
    );
    const participants = [];

    if (room) {
      for (const socketId of room) {
        const socket = this.server.sockets.sockets.get(
          socketId,
        ) as AuthenticatedSocket;
        if (socket?.user) {
          participants.push({
            userId: socket.userId,
            name: socket.user.fullName,
            email: socket.user.email,
            status: this.userPresence.get(socket.userId!) || "online",
          });
        }
      }
    }

    return participants;
  }

  /**
   * Public methods for external services to emit events
   */

  public emitToConversation(conversationId: string, event: string, data: any) {
    this.server.to(`conversation:${conversationId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  public emitToOrganization(organizationId: string, event: string, data: any) {
    this.server.to(`org:${organizationId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  public emitToUser(userId: string, event: string, data: any) {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      for (const socketId of userSockets) {
        this.server.to(socketId).emit(event, {
          ...data,
          timestamp: new Date(),
        });
      }
    }
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  public isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  public getUserPresence(userId: string): "online" | "away" | "offline" {
    return this.userPresence.get(userId) || "offline";
  }

  public getConversationParticipantCount(conversationId: string): number {
    const room = this.server.sockets.adapter.rooms.get(
      `conversation:${conversationId}`,
    );
    return room?.size || 0;
  }
}
