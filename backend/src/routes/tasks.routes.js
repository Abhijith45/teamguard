import { Router } from "express";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from "../controllers/tasks.controller.js";
import {
  createSubtask,
  deleteSubtask,
  listSubtasks,
  reorderSubtasks,
  updateSubtask,
} from "../controllers/subtasks.controller.js";
import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
} from "../controllers/comments.controller.js";
import { getTaskActivity } from "../controllers/audit.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";
import { requireTaskDeletePermission } from "../middleware/rbac.middleware.js";

const router = Router();

router.use(authenticate, resolveTenant);

const requireTaskViewPermission = (req, res, next) => {
  const isGuest = req.membership?.accountType === "GUEST" || req.user?.accountType === "GUEST";
  if (isGuest) {
    return next();
  }
  const p = req.userPermissions;
  if (!p || (!p.has("task:view") && !p.has("task:read") && !p.has("task:manage"))) {
    return res.status(403).json({
      error: "Permission denied",
      requiredPermission: "task:view",
    });
  }
  next();
};

router.get("/", requireTaskViewPermission, listTasks);
router.get("/:taskId", requireTaskViewPermission, getTask);
router.post("/", requirePermission("task", "create"), createTask);

// Middleware allowing update if user has task:update:any, task:update:own, or task:update:assigned (ABAC verified in service)
const requireTaskUpdatePermission = (req, res, next) => {
  const p = req.userPermissions;
  if (
    !p ||
    (!p.has("task:update:any") &&
      !p.has("task:update:own") &&
      !p.has("task:update:assigned") &&
      !p.has("task:manage"))
  ) {
    return res.status(403).json({
      error: "Permission denied",
      requiredPermission: "task:update:own, task:update:assigned, or task:update:any",
    });
  }
  next();
};

router.patch("/:taskId", requireTaskUpdatePermission, updateTask);
router.delete("/:taskId", requireTaskDeletePermission, deleteTask);

// Nested Subtask Routes (TASK-301 / TG-SUB-001 & TG-SUB-002)
router.get("/:taskId/subtasks", requirePermission("task", "view"), listSubtasks);
router.post("/:taskId/subtasks", requireTaskUpdatePermission, createSubtask);
router.patch("/:taskId/subtasks/:subtaskId", requireTaskUpdatePermission, updateSubtask);
router.delete("/:taskId/subtasks/:subtaskId", requireTaskUpdatePermission, deleteSubtask);
router.put("/:taskId/subtasks/reorder", requireTaskUpdatePermission, reorderSubtasks);

// Nested Comment Routes (TASK-302 / US-COLLAB-001, US-COLLAB-002, US-COLLAB-003)
router.get("/:taskId/comments", requirePermission("task", "view"), listComments);
router.post("/:taskId/comments", requirePermission("task", "view"), createComment);
router.patch("/:taskId/comments/:commentId", requirePermission("task", "view"), updateComment);
router.delete("/:taskId/comments/:commentId", requirePermission("task", "view"), deleteComment);

// Task Activity Stream Route (TASK-303 / US-ACT-001 & TG-ACT-001)
router.get("/:taskId/activity", requirePermission("task", "view"), getTaskActivity);

export default router;
