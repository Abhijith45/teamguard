/**
 * Member Invitation Utilities & Helpers (TASK-505 / UD-005)
 */

/**
 * Validates whether an email string conforms to standard format.
 */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Normalizes email address to lowercase and trimmed.
 */
export function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

/**
 * Checks whether an authenticated user matches the invitation recipient email.
 */
export function isInvitationIdentityMatch(userEmail, invitationEmail) {
  if (!userEmail || !invitationEmail) return false;
  return normalizeEmail(userEmail) === normalizeEmail(invitationEmail);
}

/**
 * Computes remaining days/hours until invitation expires.
 */
export function getInvitationExpiryStatus(expiresAt) {
  if (!expiresAt) return { isExpired: true, label: "Expired", diffHours: 0 };
  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const diffMs = expiryTime - now;

  if (diffMs <= 0) {
    return { isExpired: true, label: "Expired", diffHours: 0 };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 1) {
    return { isExpired: false, label: `${diffDays}d remaining`, diffHours };
  }

  return { isExpired: false, label: `${diffHours}h remaining`, diffHours };
}

/**
 * Resolves visual status badge metadata for an invitation.
 */
export function getInvitationBadge(invitation) {
  if (!invitation) return { type: "unknown", label: "Unknown", color: "gray" };

  if (invitation.status === "REVOKED") {
    return { type: "revoked", label: "Revoked", color: "red" };
  }
  if (invitation.status === "ACCEPTED") {
    return { type: "accepted", label: "Accepted", color: "emerald" };
  }

  const { isExpired } = getInvitationExpiryStatus(invitation.expiresAt);
  if (isExpired || invitation.status === "EXPIRED") {
    return { type: "expired", label: "Expired", color: "gray" };
  }

  return { type: "pending", label: "Pending", color: "amber" };
}

/**
 * Extracts raw invitation token from a URL search query or pathname.
 */
export function extractInvitationToken(urlOrSearch) {
  if (!urlOrSearch || typeof urlOrSearch !== "string") return null;
  try {
    const searchPart = urlOrSearch.includes("?")
      ? urlOrSearch.split("?")[1]
      : urlOrSearch.startsWith("token=")
      ? urlOrSearch
      : "";

    if (searchPart) {
      const params = new URLSearchParams(searchPart);
      return params.get("token") || null;
    }
    return null;
  } catch {
    return null;
  }
}
