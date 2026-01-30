# Multi-stage build optimized for speed
# Stage 1: Dependencies (cached separately)
FROM node:20-alpine AS deps

# Install build tools needed for native modules (SWC)
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Copy only package files for better caching
COPY package*.json ./

# Install ALL dependencies and ensure SWC binaries are built
RUN npm ci --legacy-peer-deps && npm rebuild @swc/core

# Stage 2: Builder
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy dependencies from deps stage (SWC already rebuilt)
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy source code
COPY src/ ./src/

# Build with SWC (should be fast now)
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache curl dumb-init ffmpeg

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy node_modules and prune dev dependencies (faster than fresh npm ci)
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --production --legacy-peer-deps && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Create directories and set permissions
RUN mkdir -p whatsapp-sessions uploads uploads/templates uploads/broadcasts temp logs models && \
    chown -R nestjs:nodejs /app

USER nestjs

# Health check with longer start period for slow starts
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:3100/api/v1/health || exit 1

ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
