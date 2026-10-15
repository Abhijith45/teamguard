import { Router } from "express";
import {
  getMatrix,
  togglePermission,
} from "../controllers/permissions-matrix.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", requirePermission("roles", "manage"), getMatrix);
router.post("/toggle", requirePermission("roles", "manage"), togglePermission);

export default router;
