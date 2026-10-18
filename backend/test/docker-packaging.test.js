import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const backendDir = path.resolve(__dirname, "..");
const frontendDir = path.resolve(rootDir, "frontend");

describe("TASK-602: Production Multi-Stage Dockerfile & Container Optimization", () => {
  it("REQ 1 [Backend Dockerfile]: Implements multi-stage build, non-root user, and health check", () => {
    const dockerfilePath = path.join(backendDir, "Dockerfile");
    assert.ok(fs.existsSync(dockerfilePath), "backend/Dockerfile must exist");

    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Multi-stage verification
    assert.match(content, /FROM node:22-alpine AS builder/i, "Must define node:22-alpine builder stage");
    assert.match(content, /FROM node:22-alpine AS production/i, "Must define node:22-alpine production stage");

    // Optimization & layer caching
    assert.match(content, /COPY package\*\.json/i, "Must copy package manifests before source for layer caching");
    assert.match(content, /prisma generate/i, "Must generate Prisma client during build stage");
    assert.match(content, /npm prune --omit=dev/i, "Must prune development dependencies");

    // Hardened non-root execution
    assert.match(content, /USER node/i, "Must enforce non-root execution via USER node");
    assert.match(content, /--chown=node:node/i, "Must set node:node ownership on copied files");

    // Robust process supervision & health monitoring
    assert.match(content, /dumb-init/i, "Must employ dumb-init for PID 1 signal forwarding");
    assert.match(content, /HEALTHCHECK/i, "Must declare HEALTHCHECK instruction");
    assert.match(content, /http:\/\/localhost:5000\/api\/health/i, "Health check must target /api/health");
  });

  it("REQ 2 [Backend .dockerignore]: Excludes development artifacts, environment secrets, and caches", () => {
    const dockerignorePath = path.join(backendDir, ".dockerignore");
    assert.ok(fs.existsSync(dockerignorePath), "backend/.dockerignore must exist");

    const content = fs.readFileSync(dockerignorePath, "utf-8");
    const rules = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    assert.ok(rules.includes("node_modules"), "Must ignore node_modules");
    assert.ok(rules.includes(".env"), "Must ignore .env credentials");
    assert.ok(rules.includes("test"), "Must ignore test directory");
    assert.ok(rules.includes(".git"), "Must ignore .git version control history");
  });

  it("REQ 3 [Frontend Dockerfile]: Multi-stage build with NGINX Alpine and non-root execution", () => {
    const dockerfilePath = path.join(frontendDir, "Dockerfile");
    assert.ok(fs.existsSync(dockerfilePath), "frontend/Dockerfile must exist");

    const content = fs.readFileSync(dockerfilePath, "utf-8");

    // Multi-stage verification
    assert.match(content, /FROM node:22-alpine AS builder/i, "Builder must use node:22-alpine");
    assert.match(content, /FROM nginx:1\.27-alpine AS production/i, "Production must use lightweight nginx:1.27-alpine");

    // Asset compilation & deployment
    assert.match(content, /npm run build/i, "Builder must compile frontend bundle via npm run build");
    assert.match(content, /COPY --from=builder \/app\/dist \/usr\/share\/nginx\/html/i, "Must copy compiled dist assets to NGINX html root");

    // Hardened security & non-root user
    assert.match(content, /USER nginx/i, "Must execute as non-root USER nginx");
    assert.match(content, /chown -R nginx:nginx/i, "Must assign nginx ownership to runtime directories");

    // Health monitoring
    assert.match(content, /HEALTHCHECK/i, "Must declare HEALTHCHECK instruction");
    assert.match(content, /http:\/\/localhost:80\/healthz/i, "Health check must target /healthz");
  });

  it("REQ 4 [Frontend NGINX Configuration]: Security headers, Gzip compression, and SPA routing", () => {
    const confPath = path.join(frontendDir, "nginx.conf");
    assert.ok(fs.existsSync(confPath), "frontend/nginx.conf must exist");

    const content = fs.readFileSync(confPath, "utf-8");

    // Security Response Headers
    assert.match(content, /X-Frame-Options "DENY"/i, "Must enforce X-Frame-Options DENY");
    assert.match(content, /X-Content-Type-Options "nosniff"/i, "Must enforce X-Content-Type-Options nosniff");
    assert.match(content, /X-XSS-Protection/i, "Must enforce X-XSS-Protection");
    assert.match(content, /Referrer-Policy/i, "Must enforce Referrer-Policy");

    // Gzip Compression Engine
    assert.match(content, /gzip on;/i, "Must enable gzip compression");
    assert.match(content, /gzip_types/i, "Must define gzip MIME types");
    assert.match(content, /application\/javascript/i, "Gzip must compress javascript");
    assert.match(content, /text\/css/i, "Gzip must compress css");

    // Single Page Application routing fallback
    assert.match(content, /try_files \$uri \$uri\/ \/index\.html;/i, "Must implement SPA fallback to /index.html");

    // Reverse Proxy Routing
    assert.match(content, /location \/api\//i, "Must configure reverse proxy for /api/");
    assert.match(content, /proxy_pass http:\/\/backend:5000\/api\//i, "Proxy must route to backend:5000");
    assert.match(content, /location \/api\/events\/stream/i, "Must configure SSE streaming proxy");
    assert.match(content, /proxy_buffering off;/i, "SSE proxy must disable response buffering");

    // Long-Term Immutable Caching for Fingerprinted Assets
    assert.match(content, /Cache-Control "public, max-age=31536000, immutable"/i, "Assets must have immutable cache headers");
  });

  it("REQ 5 [Production Compose Orchestration]: Coordinates postgres, backend, and frontend", () => {
    const composePath = path.join(rootDir, "docker-compose.prod.yml");
    assert.ok(fs.existsSync(composePath), "docker-compose.prod.yml must exist at repository root");

    const content = fs.readFileSync(composePath, "utf-8");

    // Core Services
    assert.match(content, /postgres:/, "Must declare postgres service");
    assert.match(content, /backend:/, "Must declare backend service");
    assert.match(content, /frontend:/, "Must declare frontend service");

    // Dependency health conditions
    assert.match(content, /condition: service_healthy/, "Services must wait for dependencies to be healthy");

    // Healthchecks across all tiers
    assert.match(content, /pg_isready/, "PostgreSQL must have pg_isready healthcheck");
    assert.match(content, /http:\/\/localhost:5000\/api\/health/, "Backend must have healthcheck");
    assert.match(content, /http:\/\/localhost:80\/healthz/, "Frontend must have healthcheck");

    // Isolation & Persistence
    assert.match(content, /teamguard-network:/, "Must declare custom bridge network");
    assert.match(content, /postgres_data:/, "Must declare persistent database volume");
    assert.match(content, /restart: unless-stopped/, "Must specify restart policies");
  });

  it("REQ 6 [Frontend Build Output Validation]: Production static bundle is present and valid", () => {
    const distIndex = path.join(frontendDir, "dist", "index.html");
    assert.ok(fs.existsSync(distIndex), "Compiled frontend dist/index.html must exist");

    const htmlContent = fs.readFileSync(distIndex, "utf-8");
    assert.match(htmlContent, /<div id="root">/i, "dist/index.html must contain root mount element");
    assert.match(htmlContent, /assets\/index-[a-zA-Z0-9_-]+\.js/i, "dist/index.html must reference hashed JS asset");
    assert.match(htmlContent, /assets\/index-[a-zA-Z0-9_-]+\.css/i, "dist/index.html must reference hashed CSS asset");
  });
});
