import { Router } from "express";
import {
  createOrganization,
  listOrganizations,
  getOrganization,
  updateOrganization,
} from "../controllers/organizations.controller.js";
import { listMembers } from "../controllers/members.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate);

router.get("/", listOrganizations);
router.post("/", createOrganization);
router.get("/current", resolveTenant, getOrganization);
router.get("/members", resolveTenant, listMembers);
router.get("/:id", resolveTenant, getOrganization);
router.patch("/:id", resolveTenant, requirePermission("roles", "manage"), updateOrganization);

export default router;
