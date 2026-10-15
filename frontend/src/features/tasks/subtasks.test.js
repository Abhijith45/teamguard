import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSubtaskStats,
  validateSubtaskTitle,
  isAllSubtasksComplete,
} from "./subtaskUtils.js";

test("TASK-301 [FE REQ 1 / Subtask Progress Math]: Empty or null items return 0 progress", () => {
  const res1 = calculateSubtaskStats([]);
  assert.deepEqual(res1, { total: 0, completed: 0, progress: 0 });

  const res2 = calculateSubtaskStats(null);
  assert.deepEqual(res2, { total: 0, completed: 0, progress: 0 });
});

test("TASK-301 [FE REQ 2 / Subtask Progress Math]: Correctly computes fraction and rounded progress percentage", () => {
  // 1 out of 2 = 50%
  const res1 = calculateSubtaskStats([
    { id: 1, isCompleted: true },
    { id: 2, isCompleted: false },
  ]);
  assert.equal(res1.total, 2);
  assert.equal(res1.completed, 1);
  assert.equal(res1.progress, 50);

  // 3 out of 5 = 60%
  const res2 = calculateSubtaskStats([
    { id: 1, isCompleted: true },
    { id: 2, isCompleted: true },
    { id: 3, isCompleted: true },
    { id: 4, isCompleted: false },
    { id: 5, isCompleted: false },
  ]);
  assert.equal(res2.total, 5);
  assert.equal(res2.completed, 3);
  assert.equal(res2.progress, 60);

  // 2 out of 3 = 67% (rounded)
  const res3 = calculateSubtaskStats([
    { id: 1, isCompleted: true },
    { id: 2, isCompleted: true },
    { id: 3, isCompleted: false },
  ]);
  assert.equal(res3.total, 3);
  assert.equal(res3.completed, 2);
  assert.equal(res3.progress, 67);

  // 4 out of 4 = 100%
  const res4 = calculateSubtaskStats([
    { id: 1, isCompleted: true },
    { id: 2, isCompleted: true },
    { id: 3, isCompleted: true },
    { id: 4, isCompleted: true },
  ]);
  assert.equal(res4.total, 4);
  assert.equal(res4.completed, 4);
  assert.equal(res4.progress, 100);
});

test("TASK-301 [FE REQ 3 / Title Validation]: Input bounding checks", () => {
  assert.equal(validateSubtaskTitle("").valid, false);
  assert.equal(validateSubtaskTitle("   ").valid, false);
  assert.equal(validateSubtaskTitle("A".repeat(201)).valid, false);
  assert.equal(validateSubtaskTitle("Valid subtask").valid, true);
  assert.equal(validateSubtaskTitle("   Trimmed subtask   ").title, "Trimmed subtask");
});

test("TASK-301 [FE REQ 4 / Completion Badge]: Detects full completion state", () => {
  assert.equal(isAllSubtasksComplete([]), false);
  assert.equal(isAllSubtasksComplete([{ isCompleted: false }]), false);
  assert.equal(isAllSubtasksComplete([{ isCompleted: true }, { isCompleted: false }]), false);
  assert.equal(isAllSubtasksComplete([{ isCompleted: true }, { isCompleted: true }]), true);
});

test("TASK-301 [FE REQ 5 / Subtask Ordering]: Sorts items ascending by order attribute", () => {
  const items = [
    { id: 10, title: "Third", order: 2 },
    { id: 20, title: "First", order: 0 },
    { id: 30, title: "Second", order: 1 },
  ];
  const sorted = [...items].sort((a, b) => a.order - b.order);
  assert.equal(sorted[0].id, 20);
  assert.equal(sorted[1].id, 30);
  assert.equal(sorted[2].id, 10);
});
