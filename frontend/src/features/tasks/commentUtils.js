export const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/**
 * Validates comment content input.
 */
export function validateCommentContent(content) {
  if (typeof content !== "string") {
    return { valid: false, error: "Comment content must be a string" };
  }
  const trimmed = content.trim();
  if (!trimmed) {
    return { valid: false, error: "Comment content is required" };
  }
  if (trimmed.length > 5000) {
    return { valid: false, error: "Comment cannot exceed 5000 characters" };
  }
  return { valid: true, content: trimmed };
}

/**
 * Checks whether a comment was created within the last 15 minutes.
 */
export function isWithin15MinWindow(createdAt, now = Date.now()) {
  if (!createdAt) return false;
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return false;
  const elapsed = Math.max(0, now - createdTime);
  return elapsed <= FIFTEEN_MINUTES_MS;
}

/**
 * Computes remaining minutes before the 15-minute edit/delete window expires.
 */
export function getRemainingEditMinutes(createdAt, now = Date.now()) {
  if (!createdAt) return 0;
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return 0;
  const elapsed = now - createdTime;
  const remainingMs = FIFTEEN_MINUTES_MS - elapsed;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 60000);
}

/**
 * Determines whether a user holds moderation privileges.
 */
export function canUserModerate({ permissions = [], roles = [] } = {}) {
  const permSet = Array.isArray(permissions)
    ? new Set(permissions)
    : permissions instanceof Set
    ? permissions
    : new Set();

  if (
    permSet.has("roles:manage") ||
    permSet.has("members:manage") ||
    permSet.has("task:delete") ||
    permSet.has("task:manage")
  ) {
    return true;
  }

  if (Array.isArray(roles)) {
    const modRoleIdentifiers = [
      "super admin",
      "super-admin",
      "admin",
      "project manager",
      "project-manager",
      "owner",
    ];
    return roles.some((r) => {
      const name = typeof r === "string" ? r : r?.name || r?.slug || "";
      return modRoleIdentifiers.includes(name.toLowerCase());
    });
  }

  return false;
}

/**
 * Checks whether an actor can edit a given comment.
 * Allowed strictly for the comment author within the 15-minute creation window.
 */
export function canEditComment({ comment, currentUserId, now = Date.now() }) {
  if (!comment || !currentUserId) return false;
  const authorId = comment.authorId ?? comment.author?.id;
  if (authorId !== currentUserId) return false;
  return isWithin15MinWindow(comment.createdAt, now);
}

/**
 * Checks whether an actor can delete a given comment.
 * Allowed if:
 * 1. Actor is a moderator (can delete any comment at any time), OR
 * 2. Actor is the comment author AND within the 15-minute creation window.
 */
export function canDeleteComment({
  comment,
  currentUserId,
  isModerator = false,
  now = Date.now(),
}) {
  if (!comment) return false;
  if (isModerator) return true;
  if (!currentUserId) return false;

  const authorId = comment.authorId ?? comment.author?.id;
  if (authorId !== currentUserId) return false;

  return isWithin15MinWindow(comment.createdAt, now);
}

/**
 * Formats a timestamp into a human-readable relative time string.
 */
export function formatRelativeTime(dateInput, now = Date.now()) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Math.max(0, now - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date(now).getFullYear() ? "numeric" : undefined,
  });
}
