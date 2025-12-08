# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WazeApp is a production-ready WhatsApp AI Agents SaaS Platform that enables businesses to create and manage AI-powered WhatsApp bots. The platform includes:

- **Backend**: NestJS-based API server with TypeORM/PostgreSQL
- **Dashboard**: Next.js frontend for managing agents, conversations, and knowledge bases
- **Marketing**: Next.js marketing website
- **WhatsApp Integration**: Using Baileys library for WhatsApp Web connection
- **AI/ML**: Multiple LLM provider integrations (OpenAI, DeepSeek, Mistral, Ollama, RunPod)
- **Real-time Communication**: Socket.io for real-time updates
- **Knowledge Base**: Vector search and document processing capabilities

## Development Commands

### Backend Development
```bash
cd backend

# Development
npm run start:dev           # Start in development mode with hot reload
npm run start:simple        # Start with simplified configuration
npm run start:standalone    # Start in standalone mode
npm run start:debug         # Start with debugging enabled

# Production
npm run build              # Build the application
npm run start:prod         # Start in production mode

# Database
npm run migration:generate # Generate new migration
npm run migration:run      # Run pending migrations
npm run migration:revert   # Revert last migration
npm run schema:sync        # Sync database schema (dev only)
npm run schema:drop        # Drop database schema

# Testing & Quality
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage
npm run test:e2e           # Run end-to-end tests
npm run lint               # Run ESLint
npm run format             # Format code with Prettier

# AI/Vision Services
npm run ollama:install     # Install Ollama models
npm run ollama:serve       # Start Ollama server
npm run vision:test        # Test vision API endpoint
```

### Frontend Development
```bash
# Dashboard
cd frontend/dashboard
npm run dev                # Start development server
npm run build              # Build for production
npm run start              # Start production server
npm run lint               # Run linting
npm run type-check         # TypeScript type checking

# Marketing
cd frontend/marketing
npm run dev                # Start development server
npm run build              # Build for production
npm run start              # Start production server
npm run lint               # Run linting
```

### Docker & Deployment
```bash
# Development with Docker Compose
docker-compose up --build                      # Full stack (development)
docker-compose -f docker-compose.production.yml up --build  # Production

# Individual services
docker-compose up postgres redis  # Start databases only
docker-compose up backend         # Start backend only
docker-compose down               # Stop all services
docker-compose down -v            # Stop and remove volumes
```

## Architecture Overview

### Backend Structure (`backend/src/`)

**Core Modules:**
- `app.module.ts` - Main application module with global configuration
- `database/` - TypeORM configuration and migrations
- `common/` - Shared entities, DTOs, guards, decorators, and utilities

**Feature Modules (14 total):**
- `auth/` - Authentication (JWT, OAuth providers: Google, Facebook, Microsoft)
- `users/` - User management and profiles
- `organizations/` - Multi-tenant organization support
- `whatsapp/` - WhatsApp integration using Baileys
- `ai-agents/` - AI agent creation and management
- `knowledge-base/` - Document upload, processing, and vector search
- `conversation-management/` - Real-time conversation handling
- `llm-providers/` - Multiple LLM integrations with routing
- `subscriptions/` - Billing and quota management
- `analytics/` - Usage metrics and reporting
- `vector-search/` - Semantic search with embeddings
- `payments/` - Payment processing (S3P Maviance for Mobile Money)
- `audit/` - Audit logging
- `health/` - Health check endpoints

**WhatsApp Services:**
- `baileys.service.ts` - Core WhatsApp Web integration
- `audio-transcription.service.ts` - Voice message processing (Whisper)
- `vision.service.ts` - Image analysis (Google Cloud Vision)
- `open-source-vision.service.ts` - Local vision models (Ollama/Llava)
- `media-analysis.service.ts` - Media content analysis
- `web-search.service.ts` - Real-time web search for responses
- `simple-conversation.service.ts` - Basic conversation handling
- `whatsapp-ai-responder.service.ts` - AI response generation
- `web-scraping.service.ts` - URL content extraction (Puppeteer)

### Frontend Structure

**Dashboard (`frontend/dashboard/src/`):**
- `app/` - Next.js 14 App Router pages
  - `dashboard/whatsapp/` - WhatsApp session management
  - `knowledge-base/` - Document and KB management
  - `agents/` - AI agent configuration
  - `conversations/` - Real-time conversation interface
- `components/` - Reusable UI components
- `providers/` - React context providers (Auth, Socket.io, Theme, i18n)
- `lib/api.ts` - API client configuration

**Key Technologies:**
- Next.js 14 with App Router
- Tailwind CSS for styling
- Socket.io-client for real-time updates
- React Hook Form with Zod validation
- SWR for data fetching
- Zustand for state management

### Database Architecture

**Core Entities (`backend/src/common/entities/`) - 20 entities:**
- `user.entity.ts` - User accounts and authentication (email, OAuth)
- `organization.entity.ts` - Multi-tenant organizations
- `organization-member.entity.ts` - User-to-org memberships with roles
- `whatsapp-session.entity.ts` - WhatsApp connection sessions
- `ai-agent.entity.ts` - AI agent configurations
- `knowledge-base.entity.ts` - Knowledge base containers
- `knowledge-document.entity.ts` - Individual documents
- `document-chunk.entity.ts` - Chunked content for vector search
- `agent-conversation.entity.ts` - Conversation threads
- `agent-message.entity.ts` - Individual messages
- `llm-provider.entity.ts` - LLM provider credentials and configs
- `subscription.entity.ts` - Billing plans and quotas
- `usage-metric.entity.ts` - Analytics and usage tracking
- `audit-log.entity.ts` - Audit trail of actions
- `conversation-context.entity.ts` - Conversation state and context
- `message-queue.entity.ts` - Message queue for processing
- `webhook-event.entity.ts` - Webhook events for external integrations
- `media-asset.entity.ts` - Media files (images, audio, video)

## Key Configuration Files

- `backend/package.json` - Backend dependencies and scripts
- `backend/tsconfig.json` - TypeScript configuration with path aliases (`@/*`, `@/modules/*`, etc.)
- `backend/src/database/data-source.ts` - TypeORM database connection
- `docker-compose.yml` - Development Docker configuration
- `docker-compose.production.yml` - Production deployment configuration
- `frontend/dashboard/package.json` - Dashboard dependencies
- `frontend/marketing/package.json` - Marketing site dependencies

## Server Ports

- **Backend API**: 3100 (configurable via `PORT` env var)
- **Dashboard**: 3101 (development)
- **Marketing**: 3102 (development)
- **PostgreSQL**: 5433 (mapped from container 5432)
- **Redis**: 6379

## Development Patterns

### Path Aliases (Backend)
```typescript
import { SomeService } from '@/modules/some-module/some.service';
import { BaseEntity } from '@/common/entities/base.entity';
import { DatabaseModule } from '@/database/database.module';
```

### Environment Variables
Key environment variables are defined in the Docker Compose file and include:

**Database:**
- `DATABASE_URL`, `DATABASE_HOST`, `DATABASE_PORT`
- `DATABASE_NAME` (default: wazeapp)
- `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `DATABASE_SSL_ENABLED`

**Redis:**
- `REDIS_HOST`, `REDIS_PORT` (default: 6379)
- `REDIS_PASSWORD` (optional)

**JWT & Authentication:**
- `JWT_SECRET`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRATION_TIME` (default: 15m)
- `JWT_REFRESH_EXPIRATION_TIME` (default: 7d)

**Application URLs:**
- `FRONTEND_URL` (e.g., https://wazeapp.xyz)
- `DASHBOARD_URL` (e.g., https://app.wazeapp.xyz)
- `API_URL` (e.g., https://api.wazeapp.xyz)

**OAuth Providers (optional):**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`

**LLM/AI:**
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `MISTRAL_API_KEY`
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL` (default: qwen2.5:7b)

**Webhooks:**
- `BAILEYS_WEBHOOK_URL`

### Module Architecture
Each feature module follows NestJS patterns:
- Controller for HTTP endpoints
- Service for business logic
- Module for dependency injection
- DTOs for request/response validation
- Entities for database models

### Real-time Features
- Socket.io integration for live conversation updates
- WhatsApp message synchronization
- Real-time typing indicators and message status

## Multi-Entry Points

The backend supports multiple entry points:
- `main.ts` - Full application with all features
- `main-simple.ts` - Simplified version with core features only
- `main-standalone.ts` - Standalone deployment mode
- `main-minimal.ts` - Minimal feature set

Use the corresponding npm scripts to start different configurations.

## Testing Strategy

- Unit tests with Jest
- E2E tests for API endpoints
- Test coverage reporting
- Integration tests for WhatsApp functionality

## AI/LLM Integration

The platform supports multiple LLM providers through an adaptive routing system:
- OpenAI GPT models
- DeepSeek API
- Mistral AI
- Local Ollama models
- RunPod serverless endpoints

The `llm-router.service.ts` handles intelligent routing based on availability and performance.

## WhatsApp Integration Notes

- Uses `@whiskeysockets/baileys` v6.7 for WhatsApp Web protocol
- Session persistence in `whatsapp-sessions/` directory
- Media handling with local storage and CDN support
- Voice transcription using Whisper
- Image analysis with Google Cloud Vision and local Ollama/Llava models
- Message history synchronization
- Web scraping capability using Puppeteer for URL content extraction
- Real-time web search integration for up-to-date information
- Graceful shutdown handling to properly clean up WhatsApp sessions

## Global Infrastructure (app.module.ts)

**Core Infrastructure:**
- `ConfigModule` - Environment-based configuration (global)
- `DatabaseModule` - TypeORM PostgreSQL connection
- `CacheModule` - Redis-backed caching (cache-manager, default TTL: 3600s)
- `ThrottlerModule` - Rate limiting (300 req/min default, 500 req/min for WhatsApp)
- `EventEmitterModule` - Event-driven architecture
- `ScheduleModule` - Task scheduling
- `BullModule` - Redis-based job queues for async processing

**Global Guards:**
- `JwtAuthGuard` - JWT token validation
- `ThrottlerGuard` - Rate limiting enforcement

**Global Filters & Interceptors:**
- `AllExceptionsFilter` - Consistent error handling
- `LoggingInterceptor` - Request/response logging
- `TransformInterceptor` - Response transformation

## API Documentation

- **Swagger UI**: Available at `/api/v1/docs` when backend is running
- **Health Check**: Available at `/api/v1/health`
- **API Prefix**: `/api/v1` (configurable)

## Frontend API Client

The dashboard uses a centralized API client class (`frontend/dashboard/src/lib/api.ts`) with:
- Token management (localStorage)
- Automatic token refresh on 401 responses
- Typed responses with success/error handling
- Methods for all backend modules: auth, users, agents, WhatsApp, conversations, knowledge-base, analytics
- FormData and JSON support for file uploads

## Real-time Communication (Socket.io)

**Events:**
- `message:received` - New message received
- `whatsapp:message` - WhatsApp message updates
- `whatsapp:session-status` - Session status changes
- `agent:status` - Agent status updates
- `conversation:updated` - Conversation updates
- `analytics:updated` - Analytics updates

**Features:**
- JWT-based authentication
- Automatic reconnection with exponential backoff
- Token refresh triggers socket reconnection
- Room-based message broadcasting

## Payment Integration

- S3P Maviance payment gateway for Mobile Money
- Support for MTN, Orange, and other African mobile payment providers
- Webhook handling for payment notifications
- Integration in `payments/` module

## Deployment

**IMPORTANT: NE JAMAIS déployer manuellement sur le serveur !**

Le projet utilise **Coolify** pour le déploiement automatique. Quand du code est poussé sur GitHub (git push), Coolify détecte automatiquement les changements et redéploie les containers.

**Workflow de déploiement:**
1. Faire les modifications localement
2. `git add` et `git commit`
3. `git push` vers GitHub
4. Coolify détecte le push et redéploie automatiquement

**Ne jamais faire:**
- rsync vers le serveur
- ssh pour docker compose up
- Déploiement manuel de quelque nature que ce soit

**Production URLs:**
- API: https://api.wazeapp.xyz
- Dashboard: https://app.wazeapp.xyz
- Marketing: https://wazeapp.xyz

**Serveur:** 94.250.201.167 (géré par Coolify)
