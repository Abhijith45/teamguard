import { Router } from "express";
import {
  bulkDeleteFiles,
  bulkDuplicateFiles,
  confirmUpload,
  createFile,
  deleteFile,
  getDownloadUrl,
  getFile,
  getStorageQuota,
  listFiles,
  requestUploadUrl,
  updateFile,
} from "../controllers/files.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requirePermission } from "../middleware/require-permission.js";

const router = Router();

router.use(authenticate, resolveTenant);

// Static endpoints MUST precede parameterized routes (/:fileId)
router.get("/quota", requirePermission("files", "view"), getStorageQuota);
router.post("/upload-url", requirePermission("files", "upload"), requestUploadUrl);
router.post("/confirm", requirePermission("files", "upload"), confirmUpload);
router.post("/bulk-delete", requirePermission("files", "delete"), bulkDeleteFiles);
router.post("/bulk-duplicate", requirePermission("files", "update"), bulkDuplicateFiles);

router.get("/", requirePermission("files", "view"), listFiles);
router.post("/", requirePermission("files", "upload"), createFile);

// Parameterized file routes
router.get("/:fileId/download-url", (req, res, next) => {
  if (req.userPermissions && (req.userPermissions.has("files:download") || req.userPermissions.has("files:view"))) {
    return next();
  }
  return res.status(403).json({ error: "Permission denied", requiredPermission: "files:download" });
}, getDownloadUrl);

router.get("/:fileId", requirePermission("files", "view"), getFile);
router.patch("/:fileId", requirePermission("files", "update"), updateFile);
router.delete("/:fileId", requirePermission("files", "delete"), deleteFile);

export default router;

