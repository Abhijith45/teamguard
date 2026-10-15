import { Router } from "express";
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
} from "../controllers/notifications.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";

const router = Router();

// Strict Authentication and Tenant Isolation
router.use(authenticate, resolveTenant);

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
