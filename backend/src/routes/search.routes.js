import { Router } from "express";
import { globalSearch } from "../controllers/search.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";

const router = Router();

// Strict tenant-scoped authentication and isolation
router.use(authenticate, resolveTenant);

// GET /api/search?q=:term
router.get("/", globalSearch);

export default router;
