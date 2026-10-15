import { Router } from "express";
import {
  currentUser,
  login,
  logout,
  refresh,
  register,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireTrustedOrigin } from "../middleware/trusted-origin.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", requireTrustedOrigin, refresh);
router.post("/logout", requireTrustedOrigin, logout);
router.get("/me", authenticate, currentUser);

export default router;