import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  requirePlatformAdmin,
  requireMfaStepUp,
} from "../middleware/platform.middleware.js";
import {
  getTenantsOverviewHandler,
  updateTenantStatusHandler,
  verifyMfaStepUpHandler,
  executeBreakGlassHandler,
  getPlatformAuditLogsHandler,
} from "../controllers/platform.controller.js";

const router = Router();

// All platform routes require authentication and platform administrator privileges
router.use(authenticate, requirePlatformAdmin);

// US-PLAT-001: Global tenant state overview (no customer tasks/files leaked)
router.get("/tenants", getTenantsOverviewHandler);

// Tenant suspension and activation
router.patch("/tenants/:id/status", updateTenantStatusHandler);

// Step-up MFA verification issuing single-use x-mfa-token (5m TTL)
router.post("/mfa/verify", verifyMfaStepUpHandler);

// US-PLAT-002: Audited emergency break-glass recovery (requires MFA token)
router.post("/break-glass", requireMfaStepUp, executeBreakGlassHandler);

// Immutable cryptographic audit log inspection
router.get("/audit-logs", getPlatformAuditLogsHandler);

export default router;
