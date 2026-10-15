/**
 * Permission guard middleware.
 * Verifies that the active organization membership holds the specified permission.
 * Fails closed if membership or permissions cannot be verified.
 */
export function requirePermission(resource, action) {
  const requiredGrant = `${resource}:${action}`;

  return (req, res, next) => {
    if (!req.userPermissions) {
      return res.status(403).json({ error: "Access denied: organization membership context missing" });
    }

    if (req.userPermissions.has(requiredGrant)) {
      return next();
    }

    // Special fallback for update operations: if checking "update:any", also allow if user has full "manage"
    if (action.startsWith("update") && req.userPermissions.has(`${resource}:manage`)) {
      return next();
    }

    return res.status(403).json({
      error: "Permission denied",
      requiredPermission: requiredGrant,
    });
  };
}