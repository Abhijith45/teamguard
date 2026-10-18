# ==============================================================================
# Stage 1: Build Stage (compile dependencies, generate Prisma client)
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install native dependencies required for build & Prisma engine
RUN apk add --no-cache openssl libc6-compat

# Leverage Docker layer caching for dependency manifests
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

# Install all dependencies (including devDependencies for Prisma generation)
RUN npm ci --no-audit

# Generate Prisma Client
RUN npx prisma generate

# Prune development dependencies to minimize production runtime footprint
RUN npm prune --omit=dev

# ==============================================================================
# Stage 2: Production Stage (hardened, minimal, non-root execution)
# ==============================================================================
FROM node:22-alpine AS production

# Install dumb-init for robust PID 1 signal forwarding and openssl for Prisma
RUN apk add --no-cache dumb-init openssl wget

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

# Copy production dependencies and generated client with non-root ownership
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node --from=builder /app/prisma ./prisma

# Copy application source code with non-root ownership
COPY --chown=node:node src ./src
COPY --chown=node:node config ./config
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node server.js ./server.js

# Hardened security constraint: execute strictly as non-root user (UID 1000)
USER node

EXPOSE 5000

# Automated health check against hardened /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
