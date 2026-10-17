/**
 * Notification Preferences Utilities & Constants (TASK-403 / US-NOTIF-003 & TG-NOTIF-003)
 */

export const DEFAULT_PREFERENCES = {
  emailDigest: "DAILY",
  notifyTaskAssigned: true,
  notifyTaskStatusChanged: true,
  notifyCommentAdded: true,
  notifyProjectArchived: true,
  notifyDueSoon: true,
};

export const DIGEST_OPTIONS = [
  {
    id: "INSTANT",
    label: "Instant Alerts",
    description: "Immediate dispatch per event",
  },
  {
    id: "DAILY",
    label: "Daily Digest",
    description: "Morning batch summary (Recommended)",
  },
  {
    id: "WEEKLY",
    label: "Weekly Briefing",
    description: "Consolidated Monday morning report",
  },
  {
    id: "OFF",
    label: "Mute Email",
    description: "In-app alerts only, no emails",
  },
];

export const ALERT_SUBSCRIPTION_ITEMS = [
  {
    key: "notifyTaskAssigned",
    title: "Task Assignments",
    description: "Notify immediately when you are assigned to a task or work item",
  },
  {
    key: "notifyDueSoon",
    title: "48-Hour Due Date Alerts",
    description: "Notify when assigned tasks are due within the next 48 hours",
  },
  {
    key: "notifyTaskStatusChanged",
    title: "Task Status Transitions",
    description: "Notify when tasks you created or own move between TODO, IN_PROGRESS, REVISION, or DONE",
  },
  {
    key: "notifyCommentAdded",
    title: "Comments & Activity",
    description: "Notify when teammates comment on tasks you are participating in",
  },
  {
    key: "notifyProjectArchived",
    title: "Project Lifecycle Governance",
    description: "Notify when projects in the workspace are created, archived, or restored",
  },
];

/**
 * Validates and sanitizes a notification preference object.
 */
export function sanitizePreferences(prefs = {}) {
  const emailDigest = ["INSTANT", "DAILY", "WEEKLY", "OFF"].includes(prefs.emailDigest)
    ? prefs.emailDigest
    : "DAILY";

  return {
    emailDigest,
    notifyTaskAssigned: Boolean(prefs.notifyTaskAssigned ?? DEFAULT_PREFERENCES.notifyTaskAssigned),
    notifyTaskStatusChanged: Boolean(
      prefs.notifyTaskStatusChanged ?? DEFAULT_PREFERENCES.notifyTaskStatusChanged
    ),
    notifyCommentAdded: Boolean(prefs.notifyCommentAdded ?? DEFAULT_PREFERENCES.notifyCommentAdded),
    notifyProjectArchived: Boolean(
      prefs.notifyProjectArchived ?? DEFAULT_PREFERENCES.notifyProjectArchived
    ),
    notifyDueSoon: Boolean(prefs.notifyDueSoon ?? DEFAULT_PREFERENCES.notifyDueSoon),
  };
}

/**
 * Compares two preference objects to check if unsaved changes exist.
 */
export function isPreferencesDirty(original, current) {
  if (!original || !current) return false;
  return (
    original.emailDigest !== current.emailDigest ||
    original.notifyTaskAssigned !== current.notifyTaskAssigned ||
    original.notifyTaskStatusChanged !== current.notifyTaskStatusChanged ||
    original.notifyCommentAdded !== current.notifyCommentAdded ||
    original.notifyProjectArchived !== current.notifyProjectArchived ||
    original.notifyDueSoon !== current.notifyDueSoon
  );
}

/**
 * Calculates summary metrics for active alert subscriptions.
 */
export function getSubscriptionSummary(prefs) {
  const clean = sanitizePreferences(prefs);
  let activeCount = 0;
  if (clean.notifyTaskAssigned) activeCount++;
  if (clean.notifyTaskStatusChanged) activeCount++;
  if (clean.notifyCommentAdded) activeCount++;
  if (clean.notifyProjectArchived) activeCount++;
  if (clean.notifyDueSoon) activeCount++;

  return {
    activeCount,
    totalChannels: 5,
    emailStatus: clean.emailDigest,
    isEmailMuted: clean.emailDigest === "OFF",
  };
}
