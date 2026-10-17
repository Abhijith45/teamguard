import { Router } from "express";
import { streamEvents, getSyncStatus } from "../controllers/sync.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";

const router = Router();

// Enforce authentication and active tenant resolution for all real-time event endpoints
router.use(authenticate, resolveTenant);

router.get("/stream", streamEvents);
router.get("/status", getSyncStatus);

export default router;
