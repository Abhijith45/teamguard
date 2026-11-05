/**
 * Checks whether an actor possesses administrative privileges.
 */
function isAdministrator(accountType, userPermissions = [], userRoles = []) {
  if (accountType === "GUEST") return false;

  if (Array.isArray(userRoles)) {
    const hasAdminRole = userRoles.some((r) => {
      const slug = (r?.role?.slug || r?.slug || "").toLowerCase();
      const name = (r?.role?.name || r?.name || "").toLowerCase();
      return (
        slug === "super-admin" ||
        slug === "admin" ||
        slug === "owner" ||
        name === "super admin" ||
        name === "admin" ||
        name === "owner"
      );
    });
    if (hasAdminRole) return true;
  }

  if (userPermissions) {
    if (userPermissions instanceof Set) {
      if (
        userPermissions.has("roles:manage") ||
        userPermissions.has("members:manage") ||
        userPermissions.has("admin:access")
      ) {
        return true;
      }
    } else if (Array.isArray(userPermissions)) {
      if (
        userPermissions.includes("roles:manage") ||
        userPermissions.includes("members:manage") ||
        userPermissions.includes("admin:access")
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Sanitizes a single task entity according to field-level ABAC rules.
 */
function sanitizeTask(task, accountType, isAdmin) {
  if (!task || typeof task !== "object") return task;

  const isGuest = accountType === "GUEST";
  const sanitized = { ...task };

  // 1. Sanitize customFieldValues array (standard Prisma relation)
  if (Array.isArray(sanitized.customFieldValues)) {
    if (isAdmin) {
      // Admins see everything verbatim
      sanitized.customFieldValues = [...sanitized.customFieldValues];
    } else if (isGuest) {
      // Guests: strip hideFromGuests === true OR adminOnly === true
      sanitized.customFieldValues = sanitized.customFieldValues.filter((cfv) => {
        const cf = cfv.customField;
        if (!cf) return true;
        return !cf.hideFromGuests && !cf.adminOnly;
      });
    } else {
      // Regular members: strip adminOnly === true
      sanitized.customFieldValues = sanitized.customFieldValues.filter((cfv) => {
        const cf = cfv.customField;
        if (!cf) return true;
        return !cf.adminOnly;
      });
    }
  }

  // 2. Sanitize customFields array (if attached directly)
  if (Array.isArray(sanitized.customFields)) {
    if (isAdmin) {
      sanitized.customFields = [...sanitized.customFields];
    } else if (isGuest) {
      sanitized.customFields = sanitized.customFields.filter(
        (cf) => !cf.hideFromGuests && !cf.adminOnly
      );
    } else {
      sanitized.customFields = sanitized.customFields.filter((cf) => !cf.adminOnly);
    }
  }

  return sanitized;
}

/**
 * Master payload serializer for tasks returned to client endpoints.
 * Supports single task objects, arrays of tasks, and wrapped objects ({ task } or { tasks }).
 *
 * @param {object|Array} payload - Task object or list of tasks
 * @param {string} accountType - Requester accountType ('MEMBER' | 'LIMITED_MEMBER' | 'GUEST')
 * @param {Set|Array} userPermissions - Requester effective permissions
 * @param {Array} userRoles - Requester membership roles
 * @returns {object|Array} Sanitized payload
 */
export function maskTaskPayloadForGuest(
  payload,
  accountType = "MEMBER",
  userPermissions = [],
  userRoles = []
) {
  if (!payload) return payload;

  const isAdmin = isAdministrator(accountType, userPermissions, userRoles);

  // Array of tasks
  if (Array.isArray(payload)) {
    return payload.map((t) => sanitizeTask(t, accountType, isAdmin));
  }

  // Wrapped { task: ... }
  if (payload.task && typeof payload.task === "object") {
    return {
      ...payload,
      task: sanitizeTask(payload.task, accountType, isAdmin),
    };
  }

  // Wrapped { tasks: [...] }
  if (Array.isArray(payload.tasks)) {
    return {
      ...payload,
      tasks: payload.tasks.map((t) => sanitizeTask(t, accountType, isAdmin)),
    };
  }

  // Single task object
  return sanitizeTask(payload, accountType, isAdmin);
}

export const maskGuestFields = maskTaskPayloadForGuest;
