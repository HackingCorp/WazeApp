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
import { OnEvent, EventEmitter2 } from "@nestjs/event-emitter";
import { User } from "@/common/entities";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: User;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3002",
    credentials: true,
  },
  namespace: "/whatsapp",
})
export class WhatsAppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WhatsAppGateway.name);
  private readonly connectedUsers = new Map<string, Set<string>>(); // userId -> socketIds

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
  ) {
    // Log pour vérifier que les listeners sont enregistrés
    this.eventEmitter.on(
      "whatsapp.message.received",
      this.handleMessageReceived.bind(this),
    );
    console.log(
      "🔧 Gateway: Manually registered whatsapp.message.received listener",
    );
  }

  afterInit(server: Server) {
    this.logger.log("WhatsApp WebSocket Gateway initialized");
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate user
      const token = this.extractTokenFromSocket(client);
      if (!token) {
        this.logger.warn("Connection rejected: No token provided");
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET || "your-access-secret",
      });
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        this.logger.warn("Connection rejected: User not found");
        client.disconnect();
        return;
      }

      // Set user information
      client.userId = user.id;
      client.user = user;

      // Track connection
      if (!this.connectedUsers.has(user.id)) {
        this.connectedUsers.set(user.id, new Set());
      }
      this.connectedUsers.get(user.id)!.add(client.id);

      // Join user-specific room
      client.join(`user:${user.id}`);

      this.logger.log(`User ${user.email} connected (${client.id})`);

      // Send connection confirmation
      client.emit("connected", {
        userId: user.id,
        timestamp: new Date(),
      });
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

      // If no more connections, remove user
      if (userSockets.size === 0) {
        this.connectedUsers.delete(client.userId);
      }
    }

    this.logger.log(`User ${client.userId} disconnected (${client.id})`);
  }

  /**
   * Handle WhatsApp message events from backend (for UI updates)
   * Called manually from constructor for whatsapp.message.received events
   */
  async handleMessageReceived(data: {
    userId: string;
    conversationId: string;
    message: any;
    contact: any;
  }) {
    // Delegate to the common handler
    await this.broadcastMessageToUser(data);
  }

  /**
   * Handle UI-specific message update events
   * Used by simple-conversation service to avoid triggering AI responder
   */
  @OnEvent("whatsapp.ui.message.update")
  async handleUIMessageUpdate(data: {
    userId: string;
    conversationId: string;
    message: any;
    contact: any;
  }) {
    // Delegate to the common handler
    await this.broadcastMessageToUser(data);
  }

  /**
   * Common handler for broadcasting messages to WebSocket clients
   */
  private async broadcastMessageToUser(data: {
    userId: string;
    conversationId: string;
    message: any;
    contact: any;
  }) {
    this.logger.log(
      `📨 GATEWAY broadcasting message for user ${data.userId}`,
    );
    this.logger.log(
      `📨 Connected users: ${this.getConnectedUsers().length}, User online: ${this.isUserOnline(data.userId)}`,
    );

    // Check if user is connected
    if (!this.isUserOnline(data.userId)) {
      this.logger.warn(`📨 User ${data.userId} is not connected to WebSocket`);
    }

    // Emit to specific user
    this.server
      .to(`user:${data.userId}`)
      .emit("whatsapp:message", {
        contactId: data.conversationId,
        message: {
          id: data.message.id,
          content: data.message.content,
          timestamp: new Date(data.message.timestamp),
          sender: "user",
          type: data.message.type || "text",
          status: "delivered",
        },
        contact: data.contact,
      });

    this.logger.log(`📨 Message broadcast completed for user ${data.userId}`);
  }

  @OnEvent("whatsapp.message.sent")
  async handleMessageSent(data: {
    userId: string;
    conversationId: string;
    message: any;
  }) {
    this.logger.log(`Broadcasting sent message to user ${data.userId}`);

    // Emit to specific user
    this.server.to(`user:${data.userId}`).emit("whatsapp:message-sent", {
      contactId: data.conversationId,
      message: data.message,
    });
  }

  /**
   * Handle conversation message events (real-time and sync)
   * This is the primary handler for new messages with proper user context
   */
  @OnEvent("whatsapp.conversation.message")
  async handleConversationMessage(data: {
    sessionId: string;
    userId: string;
    organizationId: string;
    fromNumber: string;
    messageText: string;
    messageId: string;
    timestamp: Date;
    isGroup: boolean;
    isFromMe: boolean;
    isHistorical: boolean;
    messageType: string;
  }) {
    // Skip historical messages for real-time updates
    if (data.isHistorical) {
      return;
    }

    this.logger.log(
      `📨 GATEWAY: New conversation message for user ${data.userId} from ${data.fromNumber}`,
    );

    // Only broadcast incoming messages (not messages sent by us)
    if (data.isFromMe) {
      return;
    }

    // Check if user is connected
    if (!this.isUserOnline(data.userId)) {
      this.logger.warn(`📨 User ${data.userId} is not connected to WebSocket`);
      return;
    }

    // Clean phone number for display
    const cleanPhone = data.fromNumber
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@lid$/i, '')
      .replace(/@c\.us$/i, '')
      .replace(/@g\.us$/i, '');

    // Emit to specific user
    this.server.to(`user:${data.userId}`).emit("whatsapp:message", {
      contactId: data.fromNumber, // Use full JID as contact ID
      message: {
        id: data.messageId,
        content: data.messageText,
        timestamp: data.timestamp,
        sender: "contact",
        type: data.messageType || "text",
        status: "delivered",
      },
      contact: {
        id: data.fromNumber,
        phone: cleanPhone,
        name: cleanPhone,
        isGroup: data.isGroup,
      },
    });

    this.logger.log(`📨 Message broadcast completed for user ${data.userId}`);
  }

  @OnEvent("whatsapp.session.status")
  async handleSessionStatus(data: {
    userId: string;
    sessionId: string;
    status: string;
    qrCode?: string;
  }) {
    this.logger.log(
      `Broadcasting session status to user ${data.userId}: ${data.status}`,
    );

    // Emit to specific user
    this.server.to(`user:${data.userId}`).emit("whatsapp:session-status", {
      sessionId: data.sessionId,
      status: data.status,
      qrCode: data.qrCode,
      timestamp: new Date(),
    });
  }

  /**
   * Handle typing indicators
   */
  @SubscribeMessage("whatsapp:typing")
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { contactId: string; isTyping: boolean },
  ) {
    // Emit typing status back to user (for UI feedback)
    client.emit("whatsapp:typing", {
      contactId: data.contactId,
      isTyping: data.isTyping,
      userId: client.userId,
    });
  }

  /**
   * Handle online status updates
   */
  @OnEvent("whatsapp.contact.online-status")
  async handleOnlineStatus(data: {
    userId: string;
    contactId: string;
    isOnline: boolean;
  }) {
    this.server.to(`user:${data.userId}`).emit("whatsapp:online-status", {
      contactId: data.contactId,
      isOnline: data.isOnline,
      timestamp: new Date(),
    });
  }

  @OnEvent("whatsapp.session.sync")
  async handleSessionSync(data: {
    sessionId: string;
    status: "started" | "progress" | "completed" | "failed";
    totalChats?: number;
    syncedChats?: number;
    currentChat?: string;
    error?: string;
  }) {
    this.logger.log(
      `📡 Broadcasting sync event: ${data.status} for session ${data.sessionId}`,
    );

    // Find users for this session
    // For now, broadcast to all connected users (in production, you'd want to be more specific)
    this.server.emit("whatsapp:sync-status", {
      sessionId: data.sessionId,
      status: data.status,
      totalChats: data.totalChats,
      syncedChats: data.syncedChats,
      currentChat: data.currentChat,
      error: data.error,
      timestamp: new Date(),
    });
  }

  @OnEvent("broadcast.validation.progress")
  async handleValidationProgress(data: {
    userId: string;
    organizationId: string;
    total: number;
    validated: number;
    valid: number;
    invalid: number;
    currentPhone: string;
    status: "in_progress" | "completed";
  }) {
    this.logger.log(
      `📡 Validation progress: ${data.validated}/${data.total} for user ${data.userId}`,
    );

    // Emit to specific user
    this.server.to(`user:${data.userId}`).emit("broadcast:validation-progress", {
      total: data.total,
      validated: data.validated,
      valid: data.valid,
      invalid: data.invalid,
      status: data.status,
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

  /**
   * Public methods for external services to emit events
   */
  public emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  public isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}
