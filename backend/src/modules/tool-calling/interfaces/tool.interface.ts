export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required?: string[];
  };
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ToolExecutionContext {
  organizationId: string;
  agentId: string;
  conversationId?: string;
  clientPhoneNumber?: string;
}

export interface ToolHandler {
  getToolDefinitions(context: ToolExecutionContext): ToolDefinition[];
  executeTool(name: string, args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult>;
}

export interface ExternalApiToolConfig {
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  timeout?: number;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}
