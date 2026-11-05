import { Router } from "express";
import {
  listSpaces,
  getSpace,
  createSpace,
  updateSpace,
  deleteSpace,
  addOrUpdateSpaceMember,
  removeSpaceMember,
} from "../controllers/spaces.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { resolveTenant } from "../middleware/tenant.middleware.js";
import { requireSpaceAccess } from "../middleware/space.middleware.js";

const router = Router();

router.use(authenticate, resolveTenant);

const requireSpaceCreatePermission = (req, res, next) => {
  if (req.membership?.accountType === "GUEST" || req.user?.accountType === "GUEST") {
    return res.status(403).json({
      error: "Access Denied: Guests cannot access Spaces directly",
      code: "GUEST_SPACE_ACCESS_DENIED",
    });
  }
  const p = req.userPermissions;
  if (!p || (!p.has("space:create") && !p.has("space:manage") && !p.has("roles:manage"))) {
    return res.status(403).json({
      error: "Permission denied",
      requiredPermission: "space:create",
    });
  }
  next();
};

router.get("/", listSpaces);
router.post("/", requireSpaceCreatePermission, createSpace);

router.get("/:id", requireSpaceAccess("VIEW"), getSpace);
router.patch("/:id", requireSpaceAccess("EDIT"), updateSpace);
router.put("/:id", requireSpaceAccess("EDIT"), updateSpace);
router.delete("/:id", requireSpaceAccess("FULL"), deleteSpace);

router.post("/:id/members", requireSpaceAccess("FULL"), addOrUpdateSpaceMember);
router.delete("/:id/members/:membershipId", requireSpaceAccess("FULL"), removeSpaceMember);

export default router;
