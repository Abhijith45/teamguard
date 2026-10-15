/**
 * Calculates subtask progress metrics.
 * Returns { total, completed, progress (percentage 0-100) }.
 */
export function calculateSubtaskStats(items = []) {
  if (!items || items.length === 0) {
    return { total: 0, completed: 0, progress: 0 };
  }
  const total = items.length;
  const completed = items.filter((s) => Boolean(s.isCompleted)).length;
  const progress = Math.round((completed / total) * 100);
  return { total, completed, progress };
}

/**
 * Validates a subtask title.
 */
export function validateSubtaskTitle(title) {
  if (typeof title !== "string") {
    return { valid: false, error: "Title must be a string" };
  }
  const trimmed = title.trim();
  if (!trimmed) {
    return { valid: false, error: "Subtask title is required" };
  }
  if (trimmed.length > 200) {
    return { valid: false, error: "Subtask title cannot exceed 200 characters" };
  }
  return { valid: true, title: trimmed };
}

/**
 * Checks whether all subtasks are complete.
 */
export function isAllSubtasksComplete(subtasks = []) {
  return (
    Array.isArray(subtasks) &&
    subtasks.length > 0 &&
    subtasks.every((s) => Boolean(s.isCompleted))
  );
}
