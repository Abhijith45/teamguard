import { Router } from "express";
import {
  exportTasksVelocityCsv,
  exportAuditComplianceCsv,
  getReportsSummary,
  getCompletionTrend,
  getWorkloadReport,
  getMemberActivity,
  getStorageReport,
  getOverdueTasks,
} from "../controllers/reports.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requireAnyPermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

// Summary overview metrics
router.get(
  "/summary",
  requireAnyPermission("report:export", "dashboard:view", "dashboard:export", "audit:read"),
  getReportsSummary
);

// Task Velocity & Completion Rate CSV Export
router.get(
  ["/tasks/csv", "/tasks", "/velocity/csv", "/velocity"],
  requireAnyPermission("report:export", "dashboard:export", "task:export"),
  exportTasksVelocityCsv
);

// Security & Compliance Audit Trail CSV Export
router.get(
  ["/audit/csv", "/audit", "/compliance/csv", "/compliance"],
  requireAnyPermission("report:export", "audit:read"),
  exportAuditComplianceCsv
);

// Completion trend data (last N days)
router.get(
  "/trend",
  requireAnyPermission("report:export", "dashboard:view", "audit:read"),
  getCompletionTrend
);

// Team workload distribution
router.get(
  "/workload",
  requireAnyPermission("members:manage", "members:read", "members:view", "member:read", "report:export", "audit:read"),
  getWorkloadReport
);

// Per-member activity stats
router.get(
  "/member-activity",
  requireAnyPermission("members:manage", "members:read", "members:view", "member:read", "report:export", "audit:read"),
  getMemberActivity
);

// File/storage breakdown
router.get(
  "/storage",
  requireAnyPermission("files:view", "files:read", "file:read", "file:view", "report:export", "audit:read"),
  getStorageReport
);

// Overdue tasks
router.get(
  "/overdue",
  requireAnyPermission("report:export", "dashboard:view", "audit:read"),
  getOverdueTasks
);

export default router;
