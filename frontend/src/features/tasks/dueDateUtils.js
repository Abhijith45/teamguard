/**
 * Due Date calculation and urgency determination utilities for TeamGuard tasks.
 * Follows US-TASK-005, TG-TASK-007, and TASK-205 specifications.
 */

export function getDueDateStatus(dueDateStr, status) {
  if (!dueDateStr) {
    return {
      type: "none",
      label: "No due date",
      shortLabel: "—",
      isOverdue: false,
      isDueSoon: false,
    };
  }

  const isCompleted = status === "DONE";
  const due = new Date(dueDateStr);

  if (isNaN(due.getTime())) {
    return {
      type: "none",
      label: "Invalid date",
      shortLabel: "—",
      isOverdue: false,
      isDueSoon: false,
    };
  }

  // Normalize to calendar date boundaries (midnight) for reliable daily comparisons
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs = dueDay.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formattedDate = `${monthNames[due.getMonth()]} ${due.getDate()}`;

  if (isCompleted) {
    return {
      type: "completed",
      label: `Completed (${formattedDate})`,
      shortLabel: formattedDate,
      days: diffDays,
      isOverdue: false,
      isDueSoon: false,
    };
  }

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays);
    return {
      type: "overdue",
      label: `Overdue by ${daysAgo} ${daysAgo === 1 ? "day" : "days"} (${formattedDate})`,
      shortLabel: `Overdue ${formattedDate}`,
      days: diffDays,
      isOverdue: true,
      isDueSoon: false,
    };
  }

  if (diffDays === 0) {
    return {
      type: "soon",
      label: "Due Today",
      shortLabel: "Due Today",
      days: 0,
      isOverdue: false,
      isDueSoon: true,
    };
  }

  if (diffDays <= 2) {
    const daysText = diffDays === 1 ? "Tomorrow" : "in 2 days";
    return {
      type: "soon",
      label: `Due ${daysText} (${formattedDate})`,
      shortLabel: `Due ${daysText}`,
      days: diffDays,
      isOverdue: false,
      isDueSoon: true,
    };
  }

  return {
    type: "future",
    label: `Due ${formattedDate}`,
    shortLabel: formattedDate,
    days: diffDays,
    isOverdue: false,
    isDueSoon: false,
  };
}
