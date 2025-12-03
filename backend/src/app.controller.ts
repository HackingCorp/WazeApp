import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Public } from "./common/decorators/public.decorator";

@ApiTags("Root")
@Controller()
export class AppController {
  @Get()
  @Public()
  @ApiOperation({ summary: "Get API information and available endpoints" })
  @ApiResponse({
    status: 200,
    description: "API information returned successfully",
  })
  getApiInfo() {
    return {
      name: "WazeApp API",
      description: "Production-ready WhatsApp AI Agents SaaS Platform",
      version: "1.0.0",
      status: "running",
      timestamp: new Date().toISOString(),
      endpoints: {
        documentation: "/api/v1/docs",
        health: "/api/v1/health",
        auth: {
          login: "/api/v1/auth/login",
          register: "/api/v1/auth/register",
          profile: "/api/v1/auth/profile",
        },
        users: "/api/v1/users",
        organizations: "/api/v1/organizations",
        whatsapp: "/api/v1/whatsapp",
        aiAgents: "/api/v1/ai-agents",
        knowledgeBase: "/api/v1/knowledge-base",
        conversations: "/api/v1/conversations",
        media: "/api/v1/media",
        llmProviders: "/api/v1/llm-providers",
        vectorDatabase: "/api/v1/vector-database",
      },
      features: [
        "WhatsApp AI Agent Management",
        "Real-time Conversation Processing",
        "Multi-media Support & Search",
        "RAG-powered Response Generation",
        "WebSocket Real-time Communication",
        "Knowledge Base Management",
        "LLM Provider Integration",
        "Vector Database Search",
        "Subscription & Usage Tracking",
      ],
    };
  }

  @Get("status")
  @Public()
  @ApiOperation({ summary: "Get simple API status" })
  @ApiResponse({ status: 200, description: "Status returned successfully" })
  getStatus() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
