/**
 * Utility functions for notification presentation, formatting, and filtering.
 */

export function formatNotificationTime(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours}h ago`;
  }
  if (diffSec < 604800) {
    const days = Math.floor(diffSec / 86400);
    return `${days}d ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function getNotificationMeta(type) {
  switch (type) {
    case "TASK_ASSIGNED":
      return {
        label: "Assigned",
        color: "#6366f1",
        bg: "rgba(99, 102, 241, 0.15)",
        icon: "UserCheck",
      };
    case "TASK_STATUS_CHANGED":
      return {
        label: "Status",
        color: "#3b82f6",
        bg: "rgba(59, 130, 246, 0.15)",
        icon: "RefreshCw",
      };
    case "COMMENT_ADDED":
      return {
        label: "Comment",
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.15)",
        icon: "MessageSquare",
      };
    case "SUBTASK_COMPLETED":
      return {
        label: "Subtask",
        color: "#8b5cf6",
        bg: "rgba(139, 92, 246, 0.15)",
        icon: "CheckSquare",
      };
    default:
      return {
        label: "Update",
        color: "#94a3b8",
        bg: "rgba(148, 163, 184, 0.15)",
        icon: "Bell",
      };
  }
}

export function filterNotifications(notifications = [], filter = "all") {
  if (!Array.isArray(notifications)) return [];
  if (filter === "unread") {
    return notifications.filter((n) => !n.isRead);
  }
  return notifications;
}

export function calculateUnreadStats(notifications = []) {
  if (!Array.isArray(notifications)) {
    return { total: 0, unread: 0, read: 0 };
  }
  const unread = notifications.filter((n) => !n.isRead).length;
  return {
    total: notifications.length,
    unread,
    read: notifications.length - unread,
  };
}
