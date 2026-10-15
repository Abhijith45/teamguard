import test from "node:test";
import assert from "node:assert/strict";
import {
  filterActivities,
  formatRelativeTime,
  getActivityBadgeColor,
  groupActivitiesByDate,
} from "./activityUtils.js";

test("TASK-303 [FE REQ 1 / Relative Time]: Accurately calculates elapsed duration labels", () => {
  const baseNow = 1700000000000;

  assert.equal(formatRelativeTime(baseNow - 10000, baseNow), "just now");
  assert.equal(formatRelativeTime(baseNow - 5 * 60 * 1000, baseNow), "5m ago");
  assert.equal(formatRelativeTime(baseNow - 2 * 60 * 60 * 1000, baseNow), "2h ago");
  assert.equal(formatRelativeTime(baseNow - 24 * 60 * 60 * 1000, baseNow), "yesterday");
  assert.equal(formatRelativeTime(baseNow - 3 * 24 * 60 * 60 * 1000, baseNow), "3d ago");
  assert.equal(formatRelativeTime(baseNow - 14 * 24 * 60 * 60 * 1000, baseNow), "2w ago");
});

test("TASK-303 [FE REQ 2 / Category Badges]: Maps activity categories to distinct visual color tokens", () => {
  const creationBadge = getActivityBadgeColor("creation");
  assert.equal(creationBadge.label, "Created");
  assert.equal(creationBadge.text, "#10B981");

  const updateBadge = getActivityBadgeColor("update");
  assert.equal(updateBadge.label, "Updated");
  assert.equal(updateBadge.text, "#3B82F6");

  const checklistBadge = getActivityBadgeColor("checklist");
  assert.equal(checklistBadge.label, "Checklist");
  assert.equal(checklistBadge.text, "#A855F7");

  const commentBadge = getActivityBadgeColor("comment");
  assert.equal(commentBadge.label, "Comment");
  assert.equal(commentBadge.text, "#F59E0B");

  const deletionBadge = getActivityBadgeColor("deletion");
  assert.equal(deletionBadge.label, "Deleted");
  assert.equal(deletionBadge.text, "#EF4444");

  const governanceBadge = getActivityBadgeColor("governance");
  assert.equal(governanceBadge.label, "Security");

  const defaultBadge = getActivityBadgeColor("unknown");
  assert.equal(defaultBadge.label, "Event");
});

test("TASK-303 [FE REQ 3 / Tab Filtering]: Filters timeline events by category tab", () => {
  const sampleActivities = [
    { id: 1, action: "task:create", category: "creation", summary: "created this task" },
    { id: 2, action: "task:update", category: "update", summary: "changed status to IN_PROGRESS" },
    { id: 3, action: "subtask:create", category: "checklist", summary: "added checklist item" },
    { id: 4, action: "comment:create", category: "comment", summary: "posted a comment" },
  ];

  const all = filterActivities(sampleActivities, "all");
  assert.equal(all.length, 4);

  const updates = filterActivities(sampleActivities, "updates");
  assert.equal(updates.length, 2); // includes creation and update

  const checklist = filterActivities(sampleActivities, "checklist");
  assert.equal(checklist.length, 1);
  assert.equal(checklist[0].id, 3);

  const comments = filterActivities(sampleActivities, "comments");
  assert.equal(comments.length, 1);
  assert.equal(comments[0].id, 4);
});

test("TASK-303 [FE REQ 4 / Search Filtering]: Filters timeline items by text query across actor, summary, or details", () => {
  const sampleActivities = [
    {
      id: 1,
      actor: { name: "Alice Admin" },
      summary: "changed status to DONE",
      action: "task:update",
    },
    {
      id: 2,
      actor: { name: "Bob Builder" },
      summary: "added checklist item 'Write tests'",
      action: "subtask:create",
    },
    {
      id: 3,
      actor: { name: "Charlie Member" },
      summary: "posted a comment",
      action: "comment:create",
      details: { text: "Critical security fix applied" },
    },
  ];

  // Search by actor name
  const aliceResults = filterActivities(sampleActivities, "all", "Alice");
  assert.equal(aliceResults.length, 1);
  assert.equal(aliceResults[0].id, 1);

  // Search by summary keyword
  const testsResults = filterActivities(sampleActivities, "all", "tests");
  assert.equal(testsResults.length, 1);
  assert.equal(testsResults[0].id, 2);

  // Search inside details object
  const securityResults = filterActivities(sampleActivities, "all", "security");
  assert.equal(securityResults.length, 1);
  assert.equal(securityResults[0].id, 3);
});

test("TASK-303 [FE REQ 5 / Date Grouping]: Groups events into chronological sections", () => {
  const now = new Date("2026-10-15T12:00:00Z").getTime();

  const activities = [
    { id: 1, createdAt: new Date("2026-10-15T10:00:00Z").toISOString(), summary: "Today item" },
    { id: 2, createdAt: new Date("2026-10-14T10:00:00Z").toISOString(), summary: "Yesterday item" },
    { id: 3, createdAt: new Date("2026-10-11T10:00:00Z").toISOString(), summary: "This week item" },
    { id: 4, createdAt: new Date("2026-09-01T10:00:00Z").toISOString(), summary: "Older item" },
  ];

  const grouped = groupActivitiesByDate(activities, now);
  assert.equal(grouped.Today.length, 1);
  assert.equal(grouped.Yesterday.length, 1);
  assert.equal(grouped["This Week"].length, 1);
  assert.equal(grouped.Earlier.length, 1);
});
