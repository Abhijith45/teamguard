import { Router } from "express";
import { switchPersona } from "../controllers/demo.controller.js";
import { authRateLimiter } from "../middleware/rate-limiter.middleware.js";

const router = Router();

router.post("/switch-persona", authRateLimiter, switchPersona);

export default router;
