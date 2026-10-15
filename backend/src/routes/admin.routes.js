import { Router } from "express";
import {
  listUsers,
  replaceUserPermissions,
  replaceUserRoles,
  setUserActive,
} from "../controllers/users.controller.js";
import { createRole, deleteRole, listRoles, replaceRolePermissions, updateRole } from "../controllers/roles.controller.js";
import { createPermission, deletePermission, listPermissions } from "../controllers/permissions.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate);

router.get("/users", requirePermission("users", "read"), listUsers);
router.patch("/users/:userId/status", requirePermission("users", "manage"), setUserActive);
router.put("/users/:userId/roles", requirePermission("users", "manage"), replaceUserRoles);
router.put("/users/:userId/permissions", requirePermission("permissions", "manage"), replaceUserPermissions);

router.get("/roles", requirePermission("roles", "manage"), listRoles);
router.post("/roles", requirePermission("roles", "manage"), createRole);
router.patch("/roles/:roleId", requirePermission("roles", "manage"), updateRole);
router.delete("/roles/:roleId", requirePermission("roles", "manage"), deleteRole);
router.put("/roles/:roleId/permissions", requirePermission("roles", "manage"), replaceRolePermissions);

router.get("/permissions", requirePermission("permissions", "manage"), listPermissions);
router.post("/permissions", requirePermission("permissions", "manage"), createPermission);
router.delete("/permissions/:permissionId", requirePermission("permissions", "manage"), deletePermission);

export default router;