import { Router } from "express";
import {
  exportTasksVelocityCsv,
  exportAuditComplianceCsv,
  getReportsSummary,
} from "../controllers/reports.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requireAnyPermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

// Summary overview metrics for reporting dashboard
router.get(
  "/summary",
  requireAnyPermission("report:export", "dashboard:view", "dashboard:export", "audit:read"),
  getReportsSummary
);

// Task Velocity & Completion Rate CSV Export (US-REP-001 AC 1)
router.get(
  ["/tasks/csv", "/tasks", "/velocity/csv", "/velocity"],
  requireAnyPermission("report:export", "dashboard:export", "task:export"),
  exportTasksVelocityCsv
);

// Security & Compliance Audit Trail CSV Export (US-REP-001 AC 1)
router.get(
  ["/audit/csv", "/audit", "/compliance/csv", "/compliance"],
  requireAnyPermission("report:export", "audit:read"),
  exportAuditComplianceCsv
);

export default router;
