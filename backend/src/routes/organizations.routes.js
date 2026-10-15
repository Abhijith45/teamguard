import { Router } from "express";
import {
  createOrganization,
  listMembers,
  listOrganizations,
} from "../controllers/organizations.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", listOrganizations);
router.post("/", createOrganization);
router.get("/members", resolveTenant, listMembers);

export default router;
