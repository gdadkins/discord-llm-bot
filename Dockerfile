#  Stage 1: Build stage
FROM node:18-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy TypeScript config and source files
COPY tsconfig.json ./
COPY src/ ./src/

# Build the TypeScript project
RUN npm run build

# Stage 2: Production stage
FROM node:18-alpine

# Install runtime dependencies for native modules
RUN apk add --no-cache \
    sqlite-dev \
    tini

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy necessary files
COPY .env.example ./

# Copy entrypoint script (optional)
# COPY docker/entrypoint.sh /app/entrypoint.sh
# RUN chmod +x /app/entrypoint.sh

# Create necessary directories with correct permissions
RUN mkdir -p data logs temp && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose any ports if needed (Discord bots typically don't need ports exposed)
# EXPOSE 3000

# Health check (checks if the node process is running)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD pgrep -x node || exit 1

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start the bot
CMD ["node", "dist/index.js"]