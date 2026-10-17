import { Router } from "express";
import {
  bulkDeleteFiles,
  bulkDuplicateFiles,
  createFile,
  deleteFile,
  getFile,
  listFiles,
  updateFile,
} from "../controllers/files.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", requirePermission("files", "view"), listFiles);
router.post("/", requirePermission("files", "upload"), createFile);
router.post("/bulk-delete", requirePermission("files", "delete"), bulkDeleteFiles);
router.post("/bulk-duplicate", requirePermission("files", "update"), bulkDuplicateFiles);
router.get("/:fileId", requirePermission("files", "view"), getFile);
router.patch("/:fileId", requirePermission("files", "update"), updateFile);
router.delete("/:fileId", requirePermission("files", "delete"), deleteFile);

export default router;
