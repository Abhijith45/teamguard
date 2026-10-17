import { Router } from "express";
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  getPreferences,
  updatePreferences,
} from "../controllers/notifications.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";

const router = Router();

// Strict Authentication and Tenant Isolation
router.use(authenticate, resolveTenant);

// Preferences (TASK-403 / US-NOTIF-003 & TG-NOTIF-003)
router.get("/preferences", getPreferences);
router.patch("/preferences", updatePreferences);

// Queries
router.get("/unread-count", getUnreadCount);
router.get("/", listNotifications);

// Mutations
router.patch("/mark-all-read", markAllAsRead);
router.patch("/:id/read", markAsRead);
router.delete("/clear-read", clearReadNotifications);
router.delete("/:id", deleteNotification);
router.delete("/", clearReadNotifications);

export default router;
