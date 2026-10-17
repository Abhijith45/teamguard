import { Router } from "express";
import {
  createInvitation,
  listInvitations,
  acceptInvitation,
  revokeInvitation,
  resendInvitation,
  verifyInvitation,
} from "../controllers/invitations.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

// Public / Unauthenticated token verification
router.get("/verify", verifyInvitation);

// Authenticated user invitation acceptance (user identity verified via JWT session)
router.post("/accept", authenticate, acceptInvitation);

// Tenant-scoped invitation management (requires active tenant context and members:manage permission)
router.post("/", authenticate, resolveTenant, requirePermission("members", "manage"), createInvitation);
router.get("/", authenticate, resolveTenant, requirePermission("members", "manage"), listInvitations);
router.post("/:id/revoke", authenticate, resolveTenant, requirePermission("members", "manage"), revokeInvitation);
router.post("/:id/resend", authenticate, resolveTenant, requirePermission("members", "manage"), resendInvitation);

export default router;
