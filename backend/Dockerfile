# Multi-stage build for production
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ cmake git curl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies and security updates
RUN apk add --no-cache curl dumb-init && \
    apk upgrade --no-cache

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create necessary directories and set permissions
RUN mkdir -p whatsapp-sessions uploads temp logs models && \
    chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3100/api/v1/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3100

# Expose port
EXPOSE 3100

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]
