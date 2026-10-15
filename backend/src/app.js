import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import authRoutes from "./routes/auth.routes.js";
import organizationsRoutes from "./routes/organizations.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import projectsRoutes from "./routes/projects.routes.js";
import tasksRoutes from "./routes/tasks.routes.js";
import filesRoutes from "./routes/files.routes.js";
import permissionsMatrixRoutes from "./routes/permissions-matrix.routes.js";
import demoRoutes from "./routes/demo.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

app.disable("x-powered-by");
app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "TeamGuard Backend API",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/permissions-matrix", permissionsMatrixRoutes);
app.use("/api/demo", demoRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

export default app;