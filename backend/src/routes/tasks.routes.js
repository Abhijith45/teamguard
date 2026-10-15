import { Router } from "express";
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "../controllers/tasks.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", requirePermission("task", "view"), listTasks);
router.post("/", requirePermission("task", "create"), createTask);

// Update task: allow if user has either task:update:any or task:update:own (ABAC verified in controller)
router.patch("/:taskId", (req, res, next) => {
  const p = req.userPermissions;
  if (!p || (!p.has("task:update:any") && !p.has("task:update:own") && !p.has("task:manage"))) {
    return res.status(403).json({ error: "Permission denied", requiredPermission: "task:update:own or task:update:any" });
  }
  next();
}, updateTask);

router.delete("/:taskId", requirePermission("task", "delete"), deleteTask);

export default router;
