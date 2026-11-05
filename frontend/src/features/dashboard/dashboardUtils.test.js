import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePriorityDistribution,
  getDueTimeLabel,
  formatAuditAction,
  formatRelativeTime,
  groupTasksByHorizon,
  calculateProjectHealth,
} from "./dashboardUtils.js";

test("TASK-403 [US-DASH-003 / Priorities]: calculatePriorityDistribution computes percentages", () => {
  const dist = { urgent: 2, high: 3, medium: 3, low: 2 };
  const res = calculatePriorityDistribution(dist);

  assert.equal(res.total, 10);
  assert.equal(res.urgentPct, 20);
  assert.equal(res.highPct, 30);
  assert.equal(res.medPct, 30);
  assert.equal(res.lowPct, 20);
});

test("TASK-403 [US-DASH-002 / Due Window]: getDueTimeLabel identifies overdue vs imminent tasks", () => {
  const now = new Date("2026-10-17T12:00:00Z");

  // Past
  const past = new Date("2026-10-16T12:00:00Z");
  const overdueRes = getDueTimeLabel(past.toISOString(), now);
  assert.equal(overdueRes.isOverdue, true);
  assert.equal(overdueRes.isUrgent, true);

  // In 5 hours
  const in5h = new Date("2026-10-17T17:00:00Z");
  const soonRes = getDueTimeLabel(in5h.toISOString(), now);
  assert.equal(soonRes.isOverdue, false);
  assert.equal(soonRes.isUrgent, true);
  assert.equal(soonRes.label, "Due in 5h");

  // In 5 days
  const in5d = new Date("2026-10-22T12:00:00Z");
  const futureRes = getDueTimeLabel(in5d.toISOString(), now);
  assert.equal(futureRes.isOverdue, false);
  assert.equal(futureRes.isUrgent, false);
});

test("TASK-403 [US-DASH-005 / Activity]: formatAuditAction and formatRelativeTime format cleanly", () => {
  assert.equal(formatAuditAction("TASK_CREATED", "task"), "Created new task");
  assert.equal(formatAuditAction("PROJECT_ARCHIVED", "project"), "Archived project");

  const now = new Date("2026-10-17T12:00:00Z");
  const tenMinsAgo = new Date("2026-10-17T11:50:00Z");
  assert.equal(formatRelativeTime(tenMinsAgo.toISOString(), now), "10m ago");
});

test("TASK-403 [Redesign / Horizon Grouping]: groupTasksByHorizon groups tasks by time window", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const tasks = [
    { id: 1, title: "Past Task", dueDate: "2026-11-02T10:00:00Z", status: "TODO" },
    { id: 2, title: "Today Task", dueDate: "2026-11-04T18:00:00Z", status: "IN_PROGRESS" },
    { id: 3, title: "Upcoming Task", dueDate: "2026-11-07T12:00:00Z", status: "TODO" },
    { id: 4, title: "Review Task", dueDate: "2026-11-04T12:00:00Z", status: "REVISION" },
    { id: 5, title: "Completed Task", dueDate: "2026-11-01T12:00:00Z", status: "DONE" },
    { id: 6, title: "Unscheduled Task", dueDate: null, status: "TODO" },
  ];

  const grouped = groupTasksByHorizon(tasks, now);
  assert.equal(grouped.overdue.length, 1);
  assert.equal(grouped.overdue[0].id, 1);
  assert.equal(grouped.today.length, 2); // includes id 2 and id 4
  assert.equal(grouped.upcoming.length, 1);
  assert.equal(grouped.inReview.length, 1);
  assert.equal(grouped.later.length, 1);
});

test("TASK-403 [Redesign / Project Health]: calculateProjectHealth determines health tone", () => {
  assert.equal(calculateProjectHealth({ isArchived: true }).tone, "archived");
  assert.equal(calculateProjectHealth({ progress: 90 }).tone, "healthy");
  assert.equal(calculateProjectHealth({ progress: 50 }).tone, "active");
  assert.equal(calculateProjectHealth({ progress: 20 }).tone, "warning");
});
