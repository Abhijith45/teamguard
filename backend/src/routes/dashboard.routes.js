import { Router } from "express";
import { getDashboardData } from "../controllers/dashboard.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", requirePermission("dashboard", "view"), getDashboardData);

export default router;
