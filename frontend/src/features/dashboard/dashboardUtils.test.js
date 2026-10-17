import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePriorityDistribution,
  getDueTimeLabel,
  formatAuditAction,
  formatRelativeTime,
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
