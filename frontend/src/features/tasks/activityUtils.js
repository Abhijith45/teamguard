/**
 * activityUtils.js
 * Pure JavaScript utility functions for task activity timeline formatting,
 * category badging, filtering, and date grouping.
 */

/**
 * Calculates human-readable relative time string.
 */
export function formatRelativeTime(dateString, now = Date.now()) {
  if (!dateString) return "just now";
  const date = new Date(dateString);
  const diffMs = now - date.getTime();

  if (isNaN(diffMs) || diffMs < 0) return "just now";

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Returns color token mapping for activity categories.
 */
export function getActivityBadgeColor(category) {
  const normalized = (category || "").toLowerCase();
  switch (normalized) {
    case "creation":
      return {
        bg: "rgba(16, 185, 129, 0.15)",
        text: "#10B981",
        border: "rgba(16, 185, 129, 0.3)",
        label: "Created",
      };
    case "update":
      return {
        bg: "rgba(59, 130, 246, 0.15)",
        text: "#3B82F6",
        border: "rgba(59, 130, 246, 0.3)",
        label: "Updated",
      };
    case "checklist":
      return {
        bg: "rgba(168, 85, 247, 0.15)",
        text: "#A855F7",
        border: "rgba(168, 85, 247, 0.3)",
        label: "Checklist",
      };
    case "comment":
      return {
        bg: "rgba(245, 158, 11, 0.15)",
        text: "#F59E0B",
        border: "rgba(245, 158, 11, 0.3)",
        label: "Comment",
      };
    case "deletion":
      return {
        bg: "rgba(239, 68, 68, 0.15)",
        text: "#EF4444",
        border: "rgba(239, 68, 68, 0.3)",
        label: "Deleted",
      };
    case "governance":
      return {
        bg: "rgba(99, 102, 241, 0.15)",
        text: "#6366F1",
        border: "rgba(99, 102, 241, 0.3)",
        label: "Security",
      };
    default:
      return {
        bg: "rgba(148, 163, 184, 0.15)",
        text: "#94A3B8",
        border: "rgba(148, 163, 184, 0.3)",
        label: "Event",
      };
  }
}

/**
 * Filters activity records based on active tab and search query.
 */
export function filterActivities(activities = [], filter = "all", search = "") {
  if (!Array.isArray(activities)) return [];

  const normalizedFilter = (filter || "all").toLowerCase();
  const searchLower = (search || "").trim().toLowerCase();

  return activities.filter((act) => {
    // 1. Tab category filter
    if (normalizedFilter !== "all") {
      const cat = (act.category || "").toLowerCase();
      if (normalizedFilter === "updates" && cat !== "update" && cat !== "creation") {
        return false;
      }
      if (normalizedFilter === "checklist" && cat !== "checklist") {
        return false;
      }
      if (normalizedFilter === "comments" && cat !== "comment") {
        return false;
      }
    }

    // 2. Search keyword filter
    if (searchLower) {
      const actorName = (act.actor?.name || "").toLowerCase();
      const summary = (act.summary || "").toLowerCase();
      const action = (act.action || "").toLowerCase();
      const detailsStr = typeof act.details === "object" ? JSON.stringify(act.details).toLowerCase() : "";

      const match =
        actorName.includes(searchLower) ||
        summary.includes(searchLower) ||
        action.includes(searchLower) ||
        detailsStr.includes(searchLower);

      if (!match) return false;
    }

    return true;
  });
}

/**
 * Groups activities chronologically into user-friendly date sections.
 */
export function groupActivitiesByDate(activities = [], now = Date.now()) {
  if (!Array.isArray(activities)) return {};

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const groups = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Earlier: [],
  };

  for (const act of activities) {
    const actDate = new Date(act.createdAt);
    if (actDate >= today) {
      groups.Today.push(act);
    } else if (actDate >= yesterday) {
      groups.Yesterday.push(act);
    } else if (actDate >= sevenDaysAgo) {
      groups["This Week"].push(act);
    } else {
      groups.Earlier.push(act);
    }
  }

  // Prune empty buckets
  const result = {};
  for (const [k, v] of Object.entries(groups)) {
    if (v.length > 0) {
      result[k] = v;
    }
  }
  return result;
}
