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
