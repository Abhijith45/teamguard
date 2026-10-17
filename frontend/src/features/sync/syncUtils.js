/**
 * Utility functions for real-time state synchronization, SSE stream parsing,
 * and optimistic state reconciliation.
 */

/**
 * Parses a raw Server-Sent Event chunk into structured fields.
 */
export function parseSseChunk(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const lines = text.split("\n");
  let event = "message";
  let id = null;
  const dataLines = [];
  let isComment = false;

  for (const line of lines) {
    if (line.startsWith(":")) {
      isComment = true;
      continue;
    }
    if (line.startsWith("event: ")) {
      event = line.slice(7).trim();
    } else if (line.startsWith("id: ")) {
      id = line.slice(4).trim();
    } else if (line.startsWith("data: ")) {
      dataLines.push(line.slice(6));
    }
  }

  let data = null;
  if (dataLines.length > 0) {
    const rawData = dataLines.join("\n");
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }
  }

  return { event, id, data, isComment };
}

/**
 * Incorporates a newly created task from a real-time event into the current list.
 * Deduplicates to prevent phantom duplicates if the local user created it.
 */
export function applyRealtimeTaskCreate(currentTasks = [], incomingTask) {
  if (!incomingTask || !incomingTask.id) return currentTasks;

  const targetId = Number(incomingTask.id);
  const exists = currentTasks.some((t) => Number(t.id) === targetId);

  if (exists) {
    // If it already exists (e.g. from local optimistic insert), update it
    return currentTasks.map((t) => (Number(t.id) === targetId ? { ...t, ...incomingTask } : t));
  }

  // Prepend to top of list
  return [incomingTask, ...currentTasks];
}

/**
 * Applies a real-time task update event to the local task list.
 */
export function applyRealtimeTaskUpdate(currentTasks = [], eventPayload) {
  if (!eventPayload) return currentTasks;

  const targetId = Number(eventPayload.taskId || eventPayload.task?.id);
  if (!targetId) return currentTasks;

  const existingIndex = currentTasks.findIndex((t) => Number(t.id) === targetId);
  if (existingIndex === -1) {
    // If not found and a full task object is provided, add it
    if (eventPayload.task) {
      return [eventPayload.task, ...currentTasks];
    }
    return currentTasks;
  }

  return currentTasks.map((existing) => {
    if (Number(existing.id) !== targetId) return existing;

    const updatedTask = eventPayload.task ? { ...existing, ...eventPayload.task } : { ...existing };

    if (eventPayload.newStatus) {
      updatedTask.status = eventPayload.newStatus;
      if (eventPayload.newStatus === "DONE" && !updatedTask.completedAt) {
        updatedTask.completedAt = new Date().toISOString();
      } else if (eventPayload.newStatus !== "DONE") {
        updatedTask.completedAt = null;
      }
    }

    if (eventPayload.changes) {
      Object.assign(updatedTask, eventPayload.changes);
    }

    return updatedTask;
  });
}

/**
 * Removes a deleted task from the local task list.
 */
export function applyRealtimeTaskDelete(currentTasks = [], targetTaskId) {
  if (!targetTaskId) return currentTasks;
  const idToDelete = Number(targetTaskId);
  return currentTasks.filter((t) => Number(t.id) !== idToDelete);
}

/**
 * Computes exponential backoff delay with bounded jitter.
 */
export function calculateReconnectionBackoff(attempt = 0, baseMs = 1000, maxMs = 10000) {
  const exponent = Math.min(attempt, 6);
  const delay = Math.min(maxMs, baseMs * Math.pow(2, exponent));
  // Add small 0-20% jitter to prevent thundering herd
  const jitter = delay * 0.1 * Math.random();
  return Math.round(delay + jitter);
}
