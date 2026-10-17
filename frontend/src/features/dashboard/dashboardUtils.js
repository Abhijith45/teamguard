/**
 * Dashboard & Analytics Utilities (TASK-403 / US-DASH-001 through US-DASH-006)
 */

/**
 * Calculates proportions and percentages for priority distribution.
 */
export function calculatePriorityDistribution(dist = {}) {
  const urgent = Number(dist.urgent) || 0;
  const high = Number(dist.high) || 0;
  const medium = Number(dist.medium) || 0;
  const low = Number(dist.low) || 0;
  const total = urgent + high + medium + low || Number(dist.total) || 1;

  return {
    urgent,
    high,
    medium,
    low,
    total,
    urgentPct: Math.round((urgent / total) * 100),
    highPct: Math.round((high / total) * 100),
    medPct: Math.round((medium / total) * 100),
    lowPct: Math.round((low / total) * 100),
  };
}

/**
 * Formats due date urgency relative to current time.
 */
export function getDueTimeLabel(dueDateString, now = new Date()) {
  if (!dueDateString) return { label: "No due date", isOverdue: false, isUrgent: false };

  const due = new Date(dueDateString);
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffMs < 0) {
    const pastDays = Math.abs(Math.round(diffMs / (1000 * 60 * 60 * 24)));
    return {
      label: pastDays === 0 ? "Overdue today" : `${pastDays}d overdue`,
      isOverdue: true,
      isUrgent: true,
    };
  }

  if (diffHours <= 24) {
    return {
      label: diffHours <= 1 ? "Due in 1 hour" : `Due in ${diffHours}h`,
      isOverdue: false,
      isUrgent: true,
    };
  }

  if (diffHours <= 48) {
    return {
      label: "Due tomorrow",
      isOverdue: false,
      isUrgent: true,
    };
  }

  const days = Math.round(diffHours / 24);
  return {
    label: `Due in ${days}d`,
    isOverdue: false,
    isUrgent: false,
  };
}

/**
 * Formats readable descriptions for audit actions.
 */
export function formatAuditAction(action = "", resourceType = "") {
  const act = action.toUpperCase();
  const res = resourceType.toLowerCase();

  switch (act) {
    case "TASK_CREATED":
    case "CREATE":
      return `Created new ${res}`;
    case "TASK_UPDATED":
    case "UPDATE":
      return `Updated ${res}`;
    case "TASK_DELETED":
    case "DELETE":
      return `Deleted ${res}`;
    case "STATUS_CHANGED":
      return `Changed ${res} status`;
    case "PROJECT_ARCHIVED":
      return "Archived project";
    case "PROJECT_RESTORED":
      return "Restored project";
    case "MEMBER_INVITED":
      return "Invited new member";
    case "ROLE_CHANGED":
      return "Updated member role";
    default:
      return `${action.replace(/_/g, " ").toLowerCase()}`;
  }
}

/**
 * Formats relative elapsed time string (e.g., "5m ago", "2h ago", "3d ago").
 */
export function formatRelativeTime(dateInput, now = new Date()) {
  if (!dateInput) return "just now";
  const date = new Date(dateInput);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}
