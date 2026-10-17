import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSseChunk,
  applyRealtimeTaskCreate,
  applyRealtimeTaskUpdate,
  applyRealtimeTaskDelete,
  calculateReconnectionBackoff,
} from "./syncUtils.js";

test("TASK-503 [US-SYNC-002 / SSE Parsing]: parseSseChunk parses events, ids, comments and payloads", () => {
  // Standard event with JSON data
  const chunk1 = "id: evt_1_100_1\nevent: task:updated\ndata: {\"taskId\":10,\"status\":\"IN_PROGRESS\"}";
  const res1 = parseSseChunk(chunk1);
  assert.equal(res1.id, "evt_1_100_1");
  assert.equal(res1.event, "task:updated");
  assert.equal(res1.data.taskId, 10);
  assert.equal(res1.data.status, "IN_PROGRESS");
  assert.equal(res1.isComment, false);

  // Ping heartbeat comment
  const chunk2 = ": ping";
  const res2 = parseSseChunk(chunk2);
  assert.equal(res2.isComment, true);

  // Raw string payload
  const chunk3 = "event: message\ndata: Hello World";
  const res3 = parseSseChunk(chunk3);
  assert.equal(res3.event, "message");
  assert.equal(res3.data, "Hello World");

  // Null or empty handling
  assert.equal(parseSseChunk(""), null);
  assert.equal(parseSseChunk(null), null);
});

test("TASK-503 [US-SYNC-001 / State Sync]: applyRealtimeTaskCreate prepends and deduplicates tasks", () => {
  const existing = [
    { id: 1, title: "Existing 1", status: "TODO" },
    { id: 2, title: "Existing 2", status: "IN_PROGRESS" },
  ];

  // 1. New task
  const newTask = { id: 3, title: "New Task 3", status: "TODO" };
  const updatedList = applyRealtimeTaskCreate(existing, newTask);
  assert.equal(updatedList.length, 3);
  assert.equal(updatedList[0].id, 3);

  // 2. Duplicate task (already exists in array)
  const duplicate = { id: 1, title: "Existing 1 (Updated)", status: "IN_PROGRESS" };
  const dedupedList = applyRealtimeTaskCreate(existing, duplicate);
  assert.equal(dedupedList.length, 2);
  assert.equal(dedupedList[0].title, "Existing 1 (Updated)");
});

test("TASK-503 [US-SYNC-001 / State Sync]: applyRealtimeTaskUpdate handles status transitions and DONE timestamps", () => {
  const initial = [
    { id: 10, title: "Card 10", status: "TODO", completedAt: null },
    { id: 20, title: "Card 20", status: "IN_PROGRESS", completedAt: null },
  ];

  // Moving to DONE sets completedAt
  const movedToDone = applyRealtimeTaskUpdate(initial, {
    taskId: 10,
    newStatus: "DONE",
  });
  assert.equal(movedToDone[0].status, "DONE");
  assert.ok(movedToDone[0].completedAt);

  // Moving out of DONE clears completedAt
  const movedOutOfDone = applyRealtimeTaskUpdate(movedToDone, {
    taskId: 10,
    newStatus: "IN_PROGRESS",
  });
  assert.equal(movedOutOfDone[0].status, "IN_PROGRESS");
  assert.equal(movedOutOfDone[0].completedAt, null);

  // Merging task metadata changes
  const titleChanged = applyRealtimeTaskUpdate(initial, {
    taskId: 20,
    changes: { title: "Card 20 Renamed", priority: "URGENT" },
  });
  assert.equal(titleChanged[1].title, "Card 20 Renamed");
  assert.equal(titleChanged[1].priority, "URGENT");
});

test("TASK-503 [US-SYNC-001 / State Sync]: applyRealtimeTaskDelete removes deleted tasks", () => {
  const tasks = [
    { id: 1, title: "T1" },
    { id: 2, title: "T2" },
    { id: 3, title: "T3" },
  ];

  const result = applyRealtimeTaskDelete(tasks, 2);
  assert.equal(result.length, 2);
  assert.equal(result.find((t) => t.id === 2), undefined);
});

test("TASK-503 [US-SYNC-002 / Backoff]: calculateReconnectionBackoff computes bounded jittered backoff", () => {
  const delay0 = calculateReconnectionBackoff(0, 1000, 10000);
  assert.ok(delay0 >= 1000 && delay0 <= 1200);

  const delay1 = calculateReconnectionBackoff(1, 1000, 10000);
  assert.ok(delay1 >= 2000 && delay1 <= 2400);

  const delayMax = calculateReconnectionBackoff(10, 1000, 10000);
  assert.ok(delayMax <= 12000); // capped at maxMs + jitter
});
