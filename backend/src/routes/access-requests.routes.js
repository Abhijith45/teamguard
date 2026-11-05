import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import {
  createAccessRequest,
  listAccessRequests,
  getAccessRequest,
  reviewAccessRequest,
} from "../controllers/access-requests.controller.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.post("/", createAccessRequest);
router.get("/", listAccessRequests);
router.get("/:id", getAccessRequest);
router.patch("/:id/review", reviewAccessRequest);

export default router;
