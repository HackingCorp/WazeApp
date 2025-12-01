export enum ConversationState {
  GREETING = "greeting",
  PROCESSING = "processing",
  WAITING_INPUT = "waiting_input",
  RESOLVED = "resolved",
  ESCALATED = "escalated",
  CLOSED = "closed",
}

export enum MessagePriority {
  LOW = "low",
  NORMAL = "normal",
  HIGH = "high",
  URGENT = "urgent",
}

export enum ProcessingStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  RETRYING = "retrying",
}

export enum MediaSearchProvider {
  GOOGLE = "google",
  YOUTUBE = "youtube",
  BING = "bing",
  PEXELS = "pexels",
  UNSPLASH = "unsplash",
}

export enum MediaQuality {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  ORIGINAL = "original",
}

export enum WebhookEventType {
  MESSAGE_RECEIVED = "message_received",
  MESSAGE_SENT = "message_sent",
  MESSAGE_DELIVERED = "message_delivered",
  MESSAGE_READ = "message_read",
  MESSAGE_STATUS = "message_status",
  TYPING_START = "typing_start",
  TYPING_STOP = "typing_stop",
  PRESENCE_UPDATE = "presence_update",
  GROUP_UPDATE = "group_update",
  CONNECTION_UPDATE = "connection_update",
  CONTACT_UPDATE = "contact_update",
}
