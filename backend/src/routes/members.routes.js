import { Router } from "express";
import {
  getAvailableRoles,
  listMembers,
  reassignMemberRole,
  removeMember,
  updateMemberDepartment,
  updateMemberStatus,
} from "../controllers/members.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

// All member endpoints require authentication and active tenant context
router.use(authenticate, resolveTenant);

// 1. Member Directory & Role Options (US-TENANT-004)
router.get("/", listMembers);
router.get("/roles", getAvailableRoles);

// 2. Member Management Actions (US-INV-004 / US-INV-005) - Guarded by members:manage
router.patch("/:membershipId/role", requirePermission("members", "manage"), reassignMemberRole);
router.patch("/:membershipId/department", requirePermission("members", "manage"), updateMemberDepartment);
router.patch("/:membershipId/status", requirePermission("members", "manage"), updateMemberStatus);
router.delete("/:membershipId", requirePermission("members", "manage"), removeMember);

export default router;
