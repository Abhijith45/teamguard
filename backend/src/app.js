import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { prisma } from "../config/prisma.js";
import { authRateLimiter } from "./middleware/rate-limiter.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import organizationsRoutes from "./routes/organizations.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import projectsRoutes from "./routes/projects.routes.js";
import tasksRoutes from "./routes/tasks.routes.js";
import filesRoutes from "./routes/files.routes.js";
import permissionsMatrixRoutes from "./routes/permissions-matrix.routes.js";
import membersRoutes from "./routes/members.routes.js";
import rolesRoutes from "./routes/roles.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import searchRoutes from "./routes/search.routes.js";
import demoRoutes from "./routes/demo.routes.js";
import platformRoutes from "./routes/platform.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// 1. Baseline Helmet Security Headers (TASK-004 / OPS-04)
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
        connectSrc: ["'self'", ...allowedOrigins],
        frameAncestors: ["'self'"],
      },
    },
    frameguard: {
      action: "sameorigin",
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
    noSniff: true,
    xssFilter: true,
  })
);

// 2. Strict CORS Origin Whitelist (TASK-004 / OPS-02) - Wildcards Strictly Forbidden
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. server-to-server, curl, tests without origin header)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) && origin !== "*") {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-organization-id",
      "x-mfa-token",
      "X-Requested-With",
      "Accept",
    ],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());

// 3. Database Connectivity Health Check (TASK-004 / OPS-06)
app.get(["/health", "/api/health"], async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "healthy",
      database: "connected",
      service: "TeamGuard Backend API",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      service: "TeamGuard Backend API",
      timestamp: new Date().toISOString(),
    });
  }
});

// 4. Rate-Limited Auth Endpoints (TASK-004 / OPS-05)
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/v1/auth", authRateLimiter, authRoutes);

// Handle BigInt JSON serialization cleanly across Express
BigInt.prototype.toJSON = function () {
  return Number(this);
};

app.use("/api/organizations", organizationsRoutes);
app.use("/api/members", membersRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/v1/files", filesRoutes);
app.use("/api/permissions-matrix", permissionsMatrixRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/v1/platform", platformRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

export default app;