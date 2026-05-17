# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL deps (including devDeps for build)
RUN npm ci

# Copy source
COPY . .

# Build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate 2>/dev/null || true
RUN npm run build

# Prune dev deps
RUN npm prune --production

# ---- Runtime Stage ----
FROM node:20-alpine AS runner

WORKDIR /app

# Runtime deps
RUN apk add --no-cache curl ca-certificates tzdata

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV WS_PORT=3001

# Create non-root user
RUN addgroup --system --gid 1001 haggl && \
    adduser --system --uid 1001 haggl

# Copy built assets from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy workers
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/cron ./cron
COPY --from=builder /app/scripts ./scripts

# Copy lib for standalone worker imports
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/types ./types
COPY --from=builder /app/node_modules ./node_modules

# Create data directory
RUN mkdir -p /data && chown -R haggl:haggl /data

USER haggl

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Next.js standalone server on 3000, WS bridge on 3001
ENV HAGGL_DATA_DIR=/data
CMD ["node", "server.js"]
