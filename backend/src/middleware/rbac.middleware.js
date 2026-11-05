/**
 * Universal Privilege Delegation Barrier & System Role Protection (TASK-104 / US-RBAC-006 / US-RBAC-007)
 */

/**
 * Checks whether a given role is an immutable built-in system role.
 * Built-in system roles cannot be deleted, renamed, or stripped of critical privileges.
 *
 * @param {object} role - The role object from Prisma
 * @returns {boolean}
 */
export function isSystemRole(role) {
  if (!role) return false;
  if (role.isSystem) return true;

  const protectedSlugs = [
    "super-admin",
    "admin",
    "owner",
    "project-manager",
    "manager",
    "team-member",
    "stakeholder",
    "viewer",
  ];
  if (role.slug && protectedSlugs.includes(role.slug.toLowerCase())) return true;

  const protectedNames = [
    "Super Admin",
    "Admin",
    "Project Manager",
    "Team Member",
    "Stakeholder",
    "Viewer",
    "Owner",
  ];
  if (role.name && protectedNames.includes(role.name)) return true;

  return false;
}

/**
 * Validates that an actor possessing `callerPermissions` is permitted to delegate/grant `targetPermissions`.
 * Enforces the Universal Privilege Delegation Barrier: An actor cannot delegate, assign,
 * or grant any permission that they do not personally hold in the active workspace.
 *
 * @param {Set<string>} callerPermissions - Set of "resource:action" strings held by caller
 * @param {Array<{resource: string, action: string} | string>} targetPermissions - Target permissions being granted/assigned
 * @returns {{ allowed: boolean, unauthorizedPermissions: string[] }}
 */
export function validateDelegationBarrier(callerPermissions, targetPermissions = []) {
  if (!callerPermissions || !(callerPermissions instanceof Set)) {
    return {
      allowed: false,
      unauthorizedPermissions: ["* (caller permissions unavailable)"],
    };
  }

  const unauthorized = [];

  for (const p of targetPermissions) {
    const grantKey = typeof p === "string" ? p : `${p.resource}:${p.action}`;
    if (!callerPermissions.has(grantKey)) {
      unauthorized.push(grantKey);
    }
  }

  return {
    allowed: unauthorized.length === 0,
    unauthorizedPermissions: unauthorized,
  };
}

/**
 * Universal Two-Key Action Authorization Gate (F-05 / F-06 / F-07)
 * Evaluates both Role Capability (Key 1) and Object Ownership/Spatial Tier (Key 2).
 *
 * @param {object} params
 * @param {Set<string>|string[]} params.userPermissions - Effective permissions held by caller
 * @param {string} params.action - Action being evaluated (e.g., "task:delete", "task:update")
 * @param {boolean} [params.isCreator] - Whether caller is the creator of the target resource
 * @param {string} [params.objectAccessLevel] - Spatial access level ("FULL", "EDIT", "COMMENT", "VIEW")
 * @returns {{ allowed: boolean, reason?: string, layer?: "RBAC" | "ABAC" | "ReBAC" }}
 */
export function evaluateTwoKeyAction({ userPermissions, action, isCreator = false, objectAccessLevel }) {
  const perms = userPermissions instanceof Set
    ? userPermissions
    : Array.isArray(userPermissions)
      ? new Set(userPermissions)
      : new Set();

  // Key 1: Role Capability Check (RBAC)
  let roleAllowed = false;
  if (action === "task:delete") {
    roleAllowed =
      perms.has("task:delete:any") ||
      perms.has("task:delete:own") ||
      perms.has("task:delete") ||
      perms.has("task:manage");
  } else if (action === "task:update") {
    roleAllowed =
      perms.has("task:update:any") ||
      perms.has("task:update:own") ||
      perms.has("task:update:assigned") ||
      perms.has("task:update") ||
      perms.has("task:manage");
  } else {
    roleAllowed = perms.has(action);
  }

  if (!roleAllowed) {
    return {
      allowed: false,
      reason: `Role lacks required capability for action: ${action}`,
      layer: "RBAC",
    };
  }

  // Key 2: Ownership & Spatial Tier Check (ABAC & ReBAC)
  if (action === "task:delete") {
    const hasAnyDelete = perms.has("task:delete:any") || perms.has("task:manage");
    if (!hasAnyDelete && !isCreator) {
      return {
        allowed: false,
        reason: "Forbidden: You cannot delete tasks created by other members",
        layer: "ABAC",
      };
    }

    if (objectAccessLevel && objectAccessLevel === "EDIT") {
      return {
        allowed: false,
        reason: "Object permission tier 'Edit' does not allow deletion (Requires Full Edit)",
        layer: "ReBAC",
      };
    }

    if (objectAccessLevel && ["COMMENT", "VIEW"].includes(objectAccessLevel)) {
      const tierName = objectAccessLevel.charAt(0).toUpperCase() + objectAccessLevel.slice(1).toLowerCase();
      return {
        allowed: false,
        reason: `Object permission tier '${tierName}' does not allow deletion (Requires Full Edit)`,
        layer: "ReBAC",
      };
    }
  }

  return { allowed: true };
}

/**
 * Route-level middleware to verify actor holds any task deletion role capability.
 * Supports both direct middleware signature (req, res, next) and factory call requireTaskDeletePermission().
 */
export function requireTaskDeletePermission(req, res, next) {
  const handle = (reqObj, resObj, nextFn) => {
    const p = reqObj.userPermissions;
    if (!p) {
      return resObj.status(403).json({ error: "Access denied: organization membership context missing" });
    }

    const hasDeleteCapability =
      p.has("task:delete:any") ||
      p.has("task:delete:own") ||
      p.has("task:delete") ||
      p.has("task:manage");

    if (!hasDeleteCapability) {
      return resObj.status(403).json({
        error: "Permission denied",
        requiredPermission: "task:delete:own or task:delete:any",
      });
    }

    return nextFn();
  };

  if (req && res && typeof next === "function") {
    return handle(req, res, next);
  }
  return (reqInner, resInner, nextInner) => handle(reqInner, resInner, nextInner);
}

