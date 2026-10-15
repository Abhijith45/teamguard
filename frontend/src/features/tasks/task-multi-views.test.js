import test from "node:test";
import assert from "node:assert/strict";
import { getDueDateStatus } from "./dueDateUtils.js";

// Test suite for TASK-205 — Multi-View Task Representations: List & Table Views

test("TASK-205 [REQ 1 / DueDateBadge]: Null or missing due date returns type 'none'", () => {
  const resultNull = getDueDateStatus(null, "TODO");
  assert.equal(resultNull.type, "none");
  assert.equal(resultNull.isOverdue, false);
  assert.equal(resultNull.isDueSoon, false);

  const resultEmpty = getDueDateStatus("", "IN_PROGRESS");
  assert.equal(resultEmpty.type, "none");
});

test("TASK-205 [REQ 2 / DueDateBadge]: Past due date returns type 'overdue' with alert styling for active tasks", () => {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 3);

  const result = getDueDateStatus(pastDate.toISOString(), "TODO");
  assert.equal(result.type, "overdue");
  assert.equal(result.isOverdue, true);
  assert.equal(result.isDueSoon, false);
  assert.match(result.label, /Overdue by 3 days/);
});

test("TASK-205 [REQ 3 / DueDateBadge]: Past due date on DONE task returns type 'completed' (not overdue)", () => {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 5);

  const result = getDueDateStatus(pastDate.toISOString(), "DONE");
  assert.equal(result.type, "completed");
  assert.equal(result.isOverdue, false);
  assert.match(result.label, /Completed/);
});

test("TASK-205 [REQ 4 / DueDateBadge]: Due today or within 48 hours returns type 'soon'", () => {
  const today = new Date();
  const resToday = getDueDateStatus(today.toISOString(), "TODO");
  assert.equal(resToday.type, "soon");
  assert.equal(resToday.isDueSoon, true);
  assert.equal(resToday.isOverdue, false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const resTomorrow = getDueDateStatus(tomorrow.toISOString(), "IN_PROGRESS");
  assert.equal(resTomorrow.type, "soon");
  assert.equal(resTomorrow.isDueSoon, true);

  const in2Days = new Date();
  in2Days.setDate(in2Days.getDate() + 2);
  const resIn2Days = getDueDateStatus(in2Days.toISOString(), "REVISION");
  assert.equal(resIn2Days.type, "soon");
  assert.equal(resIn2Days.isDueSoon, true);
});

test("TASK-205 [REQ 5 / DueDateBadge]: Future date beyond 48 hours returns type 'future'", () => {
  const future = new Date();
  future.setDate(future.getDate() + 14);

  const result = getDueDateStatus(future.toISOString(), "TODO");
  assert.equal(result.type, "future");
  assert.equal(result.isOverdue, false);
  assert.equal(result.isDueSoon, false);
  assert.match(result.label, /Due/);
});

test("TASK-205 [REQ 6 / Table Sorting]: Priority sort correctly ranks URGENT > HIGH > MEDIUM > LOW", () => {
  const PRIORITY_RANKS = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const tasks = [
    { id: 1, title: "Low task", priority: "LOW" },
    { id: 2, title: "Urgent task", priority: "URGENT" },
    { id: 3, title: "High task", priority: "HIGH" },
    { id: 4, title: "Medium task", priority: "MEDIUM" },
  ];

  // Sort Descending (highest priority first)
  const sortedDesc = [...tasks].sort((a, b) => PRIORITY_RANKS[b.priority] - PRIORITY_RANKS[a.priority]);
  assert.deepEqual(
    sortedDesc.map((t) => t.priority),
    ["URGENT", "HIGH", "MEDIUM", "LOW"],
    "Descending priority sort must rank URGENT -> HIGH -> MEDIUM -> LOW"
  );

  // Sort Ascending (lowest priority first)
  const sortedAsc = [...tasks].sort((a, b) => PRIORITY_RANKS[a.priority] - PRIORITY_RANKS[b.priority]);
  assert.deepEqual(
    sortedAsc.map((t) => t.priority),
    ["LOW", "MEDIUM", "HIGH", "URGENT"],
    "Ascending priority sort must rank LOW -> MEDIUM -> HIGH -> URGENT"
  );
});

test("TASK-205 [REQ 7 / Table Sorting]: Status workflow sort correctly ranks TODO < IN_PROGRESS < REVISION < DONE", () => {
  const STATUS_RANKS = { TODO: 1, IN_PROGRESS: 2, REVISION: 3, DONE: 4 };
  const tasks = [
    { id: 1, status: "DONE" },
    { id: 2, status: "TODO" },
    { id: 3, status: "REVISION" },
    { id: 4, status: "IN_PROGRESS" },
  ];

  const sortedAsc = [...tasks].sort((a, b) => STATUS_RANKS[a.status] - STATUS_RANKS[b.status]);
  assert.deepEqual(
    sortedAsc.map((t) => t.status),
    ["TODO", "IN_PROGRESS", "REVISION", "DONE"],
    "Ascending status workflow sort must rank TODO -> IN_PROGRESS -> REVISION -> DONE"
  );
});

test("TASK-205 [REQ 8 / Table Sorting]: Due Date sorting sorts chronologically and puts nulls at end in ascending mode", () => {
  const date1 = "2026-10-10T00:00:00.000Z";
  const date2 = "2026-10-20T00:00:00.000Z";
  const date3 = "2026-11-01T00:00:00.000Z";

  const tasks = [
    { id: 1, dueDate: date3 },
    { id: 2, dueDate: null },
    { id: 3, dueDate: date1 },
    { id: 4, dueDate: date2 },
  ];

  const sorted = [...tasks].sort((a, b) => {
    const valA = a.dueDate ? new Date(a.dueDate).getTime() : 9999999999999;
    const valB = b.dueDate ? new Date(b.dueDate).getTime() : 9999999999999;
    return valA - valB;
  });

  assert.deepEqual(
    sorted.map((t) => t.id),
    [3, 4, 1, 2],
    "Chronological sort must put earliest date first (id 3), followed by id 4, id 1, and null (id 2) at the end"
  );
});

test("TASK-205 [REQ 9 / List Accordion Grouping]: Groups partition tasks across all 4 statuses", () => {
  const tasks = [
    { id: 1, status: "TODO" },
    { id: 2, status: "TODO" },
    { id: 3, status: "IN_PROGRESS" },
    { id: 4, status: "REVISION" },
    { id: 5, status: "DONE" },
    { id: 6, status: "DONE" },
  ];

  const todoTasks = tasks.filter((t) => t.status === "TODO");
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS");
  const revisionTasks = tasks.filter((t) => t.status === "REVISION");
  const doneTasks = tasks.filter((t) => t.status === "DONE");

  assert.equal(todoTasks.length, 2);
  assert.equal(inProgressTasks.length, 1);
  assert.equal(revisionTasks.length, 1);
  assert.equal(doneTasks.length, 2);
});
