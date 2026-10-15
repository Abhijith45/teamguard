import { Router } from "express";
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  bulkToggleModulePermissions,
  replaceRolePermissions,
} from "../controllers/roles.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", requirePermission("roles", "manage"), listRoles);
router.post("/", requirePermission("roles", "manage"), createRole);
router.patch("/:roleId", requirePermission("roles", "manage"), updateRole);
router.delete("/:roleId", requirePermission("roles", "manage"), deleteRole);
router.post("/:roleId/modules/:module/toggle", requirePermission("roles", "manage"), bulkToggleModulePermissions);
router.put("/:roleId/permissions", requirePermission("roles", "manage"), replaceRolePermissions);

export default router;
