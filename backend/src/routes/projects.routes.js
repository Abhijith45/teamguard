import { Router } from "express";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "../controllers/projects.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", requirePermission("project", "view"), listProjects);
router.get("/:projectId", requirePermission("project", "view"), getProject);
router.post("/", requirePermission("project", "create"), createProject);
router.patch("/:projectId", requirePermission("project", "update"), updateProject);
router.delete("/:projectId", requirePermission("project", "delete"), deleteProject);

export default router;
