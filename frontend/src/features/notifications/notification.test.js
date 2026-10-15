import test from "node:test";
import assert from "node:assert/strict";
import {
  formatNotificationTime,
  getNotificationMeta,
  filterNotifications,
  calculateUnreadStats,
} from "./notificationUtils.js";

test("TASK-304 [FE REQ 1 / Relative Time]: Formats notification timestamps cleanly", () => {
  const now = new Date();

  // Just now (< 45s)
  const justNow = new Date(now.getTime() - 10 * 1000).toISOString();
  assert.equal(formatNotificationTime(justNow), "Just now");

  // Minutes ago (< 1h)
  const fiveMins = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  assert.equal(formatNotificationTime(fiveMins), "5m ago");

  // Hours ago (< 24h)
  const threeHours = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
  assert.equal(formatNotificationTime(threeHours), "3h ago");

  // Days ago (< 7d)
  const twoDays = new Date(now.getTime() - 2 * 86400 * 1000).toISOString();
  assert.equal(formatNotificationTime(twoDays), "2d ago");

  // Edge cases
  assert.equal(formatNotificationTime(null), "");
  assert.equal(formatNotificationTime("invalid-date"), "");
});

test("TASK-304 [FE REQ 2 / Notification Metadata]: Returns matching visual badges for notification event types", () => {
  const assigned = getNotificationMeta("TASK_ASSIGNED");
  assert.equal(assigned.label, "Assigned");
  assert.equal(assigned.color, "#6366f1");

  const status = getNotificationMeta("TASK_STATUS_CHANGED");
  assert.equal(status.label, "Status");
  assert.equal(status.color, "#3b82f6");

  const comment = getNotificationMeta("COMMENT_ADDED");
  assert.equal(comment.label, "Comment");
  assert.equal(comment.color, "#10b981");

  const subtask = getNotificationMeta("SUBTASK_COMPLETED");
  assert.equal(subtask.label, "Subtask");
  assert.equal(subtask.color, "#8b5cf6");

  const unknown = getNotificationMeta("CUSTOM_EVENT");
  assert.equal(unknown.label, "Update");
  assert.equal(unknown.color, "#94a3b8");
});

test("TASK-304 [FE REQ 3 / Notification Filtering]: Correctly filters between all and unread notifications", () => {
  const sampleNotifications = [
    { id: 1, title: "Task 1", isRead: false },
    { id: 2, title: "Task 2", isRead: true },
    { id: 3, title: "Task 3", isRead: false },
    { id: 4, title: "Task 4", isRead: true },
  ];

  const all = filterNotifications(sampleNotifications, "all");
  assert.equal(all.length, 4);

  const unreadOnly = filterNotifications(sampleNotifications, "unread");
  assert.equal(unreadOnly.length, 2);
  assert.equal(unreadOnly[0].id, 1);
  assert.equal(unreadOnly[1].id, 3);

  // Fallbacks
  assert.deepEqual(filterNotifications(null), []);
  assert.deepEqual(filterNotifications([]), []);
});

test("TASK-304 [FE REQ 4 / Unread Stats Calculation]: Calculates summary metrics for active drawer header", () => {
  const sampleNotifications = [
    { id: 1, isRead: false },
    { id: 2, isRead: true },
    { id: 3, isRead: false },
  ];

  const stats = calculateUnreadStats(sampleNotifications);
  assert.equal(stats.total, 3);
  assert.equal(stats.unread, 2);
  assert.equal(stats.read, 1);

  const emptyStats = calculateUnreadStats([]);
  assert.equal(emptyStats.total, 0);
  assert.equal(emptyStats.unread, 0);
  assert.equal(emptyStats.read, 0);
});
