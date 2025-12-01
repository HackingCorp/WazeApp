export enum UserRole {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member",
  VIEWER = "viewer",
}

export enum SubscriptionPlan {
  FREE = "free",
  STANDARD = "standard",
  PRO = "pro",
  ENTERPRISE = "enterprise",
}

export enum SubscriptionStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  CANCELLED = "cancelled",
  PAST_DUE = "past_due",
  TRIALING = "trialing",
}

export enum WhatsAppSessionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  LOGGED_OUT = "logged_out",
}

export enum AuditAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LOGIN = "login",
  LOGOUT = "logout",
  INVITE = "invite",
  JOIN = "join",
  LEAVE = "leave",
  REGISTER = "register",
  FORGOT_PASSWORD = "forgot_password",
  PASSWORD_RESET = "password_reset",
  EMAIL_VERIFIED = "email_verified",
  OAUTH_REGISTER = "oauth_register",
  OAUTH_LOGIN = "oauth_login",
}

export enum MediaType {
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  DOCUMENT = "document",
}

export enum UsageMetricType {
  API_REQUESTS = "api_requests",
  STORAGE_USED = "storage_used",
  KNOWLEDGE_CHARS = "knowledge_chars",
  WHATSAPP_MESSAGES = "whatsapp_messages",
  LLM_TOKENS = "llm_tokens",
  AI_CONVERSATIONS = "ai_conversations",
  VECTOR_SEARCHES = "vector_searches",
  WEBHOOK_EVENTS = "webhook_events",
}

// Knowledge Base Enums
export enum KnowledgeBaseStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  PROCESSING = "processing",
}

export enum DocumentType {
  PDF = "pdf",
  DOCX = "docx",
  TXT = "txt",
  MD = "md",
  RICH_TEXT = "rich_text",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  URL = "url",
}

export enum DocumentStatus {
  UPLOADED = "uploaded",
  PROCESSING = "processing",
  PROCESSED = "processed",
  FAILED = "failed",
  ARCHIVED = "archived",
}

// AI Agent Enums
export enum AgentStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  TRAINING = "training",
  MAINTENANCE = "maintenance",
}

export enum AgentLanguage {
  ENGLISH = "en",
  FRENCH = "fr",
  SPANISH = "es",
  GERMAN = "de",
  ITALIAN = "it",
  PORTUGUESE = "pt",
  CHINESE = "zh",
  JAPANESE = "ja",
  ARABIC = "ar",
}

export enum AgentTone {
  PROFESSIONAL = "professional",
  FRIENDLY = "friendly",
  CASUAL = "casual",
  FORMAL = "formal",
  EMPATHETIC = "empathetic",
  TECHNICAL = "technical",
}

// Conversation Enums
export enum ConversationStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  ABANDONED = "abandoned",
  ARCHIVED = "archived",
}

export enum ConversationChannel {
  WHATSAPP = "whatsapp",
  WEB_CHAT = "web_chat",
  API = "api",
  PHONE = "phone",
  EMAIL = "email",
}

export enum MessageRole {
  USER = "user",
  AGENT = "agent",
  SYSTEM = "system",
}

export enum MessageStatus {
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
  FAILED = "failed",
}

// LLM Provider Enums
export enum ProviderType {
  DEEPSEEK = "deepseek",
  MISTRAL = "mistral",
  LLAMA = "llama",
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  OLLAMA = "ollama",
  CUSTOM = "custom",
}

export enum ProviderStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  MAINTENANCE = "maintenance",
  ERROR = "error",
}

export enum DeploymentType {
  SELF_HOSTED = "self_hosted",
  CLOUD_API = "cloud_api",
  HYBRID = "hybrid",
}

// Re-export conversation enums
export * from "./conversation.enum";
