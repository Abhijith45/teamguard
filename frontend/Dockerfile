# ==============================================================================
# Stage 1: Build Stage (compile frontend static bundle via Vite)
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Leverage Docker layer caching for dependencies
COPY package*.json ./

RUN npm ci --no-audit

# Copy application source code
COPY . .

# Compile optimized static bundle into /app/dist
RUN npm run build

# ==============================================================================
# Stage 2: Production Stage (ultra-lightweight, hardened NGINX Alpine)
# ==============================================================================
FROM nginx:1.27-alpine AS production

# Remove default server definition
RUN rm /etc/nginx/conf.d/default.conf

# Deploy hardened NGINX configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Deploy compiled static bundle from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Establish non-root ownership on runtime state and document root
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html

# Hardened security constraint: execute strictly as non-root user
USER nginx

EXPOSE 80

# Automated health check against lightweight /healthz endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
