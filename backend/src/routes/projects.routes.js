import { Router } from "express";
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  restoreProject,
  unarchiveProject,
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
router.post("/:projectId/restore", requirePermission("project", "update"), restoreProject);
router.post("/:projectId/archive", requirePermission("project", "update"), archiveProject);
router.post("/:projectId/unarchive", requirePermission("project", "update"), unarchiveProject);

export default router;
