import { Router } from "express";
import {
  changePassword,
  cleanupSessions,
  currentUser,
  login,
  logout,
  refresh,
  register,
  updateProfile,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireTrustedOrigin } from "../middleware/trusted-origin.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", requireTrustedOrigin, refresh);
router.post("/logout", requireTrustedOrigin, logout);
router.get("/me", authenticate, currentUser);
router.patch("/profile", authenticate, requireTrustedOrigin, updateProfile);
router.post("/change-password", authenticate, requireTrustedOrigin, changePassword);
router.post("/sessions/cleanup", authenticate, requireTrustedOrigin, cleanupSessions);

export default router;