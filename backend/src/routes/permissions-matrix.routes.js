import { Router } from "express";
import {
  getMatrix,
  togglePermission,
} from "../controllers/permissions-matrix.controller.js";
import { bulkToggleModulePermissions } from "../controllers/roles.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", requirePermission("roles", "manage"), getMatrix);
router.post("/toggle", requirePermission("roles", "manage"), togglePermission);
router.post("/roles/:roleId/modules/:module/toggle", requirePermission("roles", "manage"), bulkToggleModulePermissions);
router.post("/bulk-toggle", requirePermission("roles", "manage"), (req, res, next) => {
  req.params.roleId = req.body.roleId;
  req.params.module = req.body.module;
  return bulkToggleModulePermissions(req, res, next);
});

export default router;
