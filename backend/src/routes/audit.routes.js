import { Router } from "express";
import {
  getAuditActions,
  getAuditStats,
  listAuditLogs,
} from "../controllers/audit.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

// Both authentication and tenant boundary resolution are mandatory
router.use(authenticate, resolveTenant);

// Guarded by audit:read (US-AUDIT-001 / TG-AUD-001)
router.get("/", requirePermission("audit", "read"), listAuditLogs);
router.get("/actions", requirePermission("audit", "read"), getAuditActions);
router.get("/stats", requirePermission("audit", "read"), getAuditStats);

export default router;
