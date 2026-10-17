import { workspaceEventEmitter } from "./event-dispatcher.service.js";

/**
 * TASK-503: Real-Time State Synchronization via SSE Streams (UD-003)
 *
 * Implements a high-performance, multi-tenant in-memory broker for Server-Sent Events (SSE).
 * - Enforces strict tenant boundary isolation (zero cross-tenant data leakage).
 * - Supports Last-Event-ID reconnection replay with per-tenant ring buffers.
 * - Emits periodic heartbeat pings (: ping\n\n) every 15s to keep connections alive through proxies.
 * - Handles client disconnection cleanly with zero memory leaks.
 */

const MAX_BUFFER_SIZE_PER_TENANT = 100;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;

// Map<organizationId (Number), Set<Subscriber>>
const tenantSubscribers = new Map();

// Map<organizationId (Number), Array<{ id: string, event: string, data: any, timestamp: number, projectId?: number }>>
const tenantEventBuffers = new Map();

let eventSequence = 1;

function generateEventId(organizationId) {
  const seq = eventSequence++;
  return `evt_${organizationId}_${Date.now()}_${seq}`;
}

export class Subscriber {
  constructor({ id, organizationId, userId, projectId, res, req, heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS }) {
    this.id = id;
    this.organizationId = Number(organizationId);
    this.userId = userId ? Number(userId) : null;
    this.projectId = projectId ? Number(projectId) : null;
    this.res = res;
    this.req = req;
    this.connectedAt = Date.now();
    this.heartbeatTimer = null;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.isClosed = false;
  }

  sendRaw(chunk) {
    if (this.isClosed) return;
    try {
      if (!this.res.writableEnded && !this.res.destroyed) {
        this.res.write(chunk);
        if (typeof this.res.flush === "function") {
          this.res.flush();
        }
      }
    } catch {
      this.close();
    }
  }

  sendEvent(event, data, eventId) {
    if (this.isClosed) return;
    const lines = [];
    if (eventId) {
      lines.push(`id: ${eventId}`);
    }
    if (event) {
      lines.push(`event: ${event}`);
    }
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    lines.push(`data: ${payload}`);
    this.sendRaw(lines.join("\n") + "\n\n");
  }

  sendPing() {
    this.sendRaw(": ping\n\n");
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isClosed) {
        this.stopHeartbeat();
        return;
      }
      this.sendPing();
    }, this.heartbeatIntervalMs);

    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  close() {
    if (this.isClosed) return;
    this.isClosed = true;
    this.stopHeartbeat();
    try {
      if (!this.res.writableEnded && !this.res.destroyed) {
        this.res.end();
      }
    } catch {
      // Ignore teardown errors
    }
  }
}

/**
 * Registers an active SSE subscriber for a specific organization context.
 */
export function addSubscriber({
  organizationId,
  userId,
  projectId = null,
  res,
  req,
  lastEventId = null,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
}) {
  const orgId = Number(organizationId);
  const subscriberId = `sub_${orgId}_${userId || "anon"}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const subscriber = new Subscriber({
    id: subscriberId,
    organizationId: orgId,
    userId,
    projectId,
    res,
    req,
    heartbeatIntervalMs,
  });

  if (!tenantSubscribers.has(orgId)) {
    tenantSubscribers.set(orgId, new Set());
  }
  tenantSubscribers.get(orgId).add(subscriber);

  // Send initial connected handshake event
  subscriber.sendEvent("connected", {
    status: "connected",
    organizationId: orgId,
    userId: subscriber.userId,
    projectId: subscriber.projectId,
    timestamp: new Date().toISOString(),
  });

  // Replay buffered events if Last-Event-ID was supplied
  if (lastEventId) {
    replayMissedEvents(subscriber, lastEventId);
  }

  // Start ping heartbeat
  subscriber.startHeartbeat();

  // Listen for client disconnect
  const cleanup = () => {
    removeSubscriber(subscriber);
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
  req.on("error", cleanup);
  res.on("error", cleanup);

  return subscriber;
}

/**
 * Unregisters and stops a subscriber.
 */
export function removeSubscriber(subscriber) {
  if (!subscriber) return;
  const orgId = subscriber.organizationId;
  const subs = tenantSubscribers.get(orgId);
  if (subs) {
    subs.delete(subscriber);
    if (subs.size === 0) {
      tenantSubscribers.delete(orgId);
    }
  }
  subscriber.close();
}

/**
 * Replays missed events for a reconnecting subscriber based on Last-Event-ID.
 * If the event ID is not found in the buffer (buffer expired or wiped), emits sync:reconcile.
 */
function replayMissedEvents(subscriber, lastEventId) {
  const orgId = subscriber.organizationId;
  const buffer = tenantEventBuffers.get(orgId) || [];

  const targetIndex = buffer.findIndex((e) => e.id === lastEventId);

  if (targetIndex === -1) {
    // Buffer overflow or unknown event ID: instruct client to do full state reconciliation
    subscriber.sendEvent("sync:reconcile", {
      reason: "buffer_overflow",
      message: "Last-Event-ID not found in replay buffer. Full state reload required.",
      lastEventId,
    });
    return;
  }

  // Replay subsequent events
  const missedEvents = buffer.slice(targetIndex + 1);
  for (const item of missedEvents) {
    // Check project filter if subscriber is scoped
    if (subscriber.projectId && item.projectId && item.projectId !== subscriber.projectId) {
      continue;
    }
    subscriber.sendEvent(item.event, item.data, item.id);
  }
}

/**
 * Broadcasts an event to all active subscribers within a specific organization.
 * Strictly enforces tenant boundary and optional project filtering.
 */
export function broadcastWorkspaceEvent(organizationId, eventType, data, options = {}) {
  const orgId = Number(organizationId);
  if (!orgId || isNaN(orgId)) return null;

  const { projectId = null, excludeUserId = null } = options;
  const resolvedProjectId = projectId ? Number(projectId) : (data?.projectId ? Number(data.projectId) : (data?.task?.projectId ? Number(data.task.projectId) : null));

  const eventId = generateEventId(orgId);

  // Record in tenant ring buffer
  if (!tenantEventBuffers.has(orgId)) {
    tenantEventBuffers.set(orgId, []);
  }
  const buffer = tenantEventBuffers.get(orgId);
  buffer.push({
    id: eventId,
    event: eventType,
    data,
    timestamp: Date.now(),
    projectId: resolvedProjectId,
  });

  if (buffer.length > MAX_BUFFER_SIZE_PER_TENANT) {
    buffer.shift();
  }

  // Dispatch to active subscribers in organization
  const subs = tenantSubscribers.get(orgId);
  if (!subs || subs.size === 0) {
    return eventId;
  }

  for (const subscriber of subs) {
    if (subscriber.isClosed) continue;

    // Filter out author if excluded
    if (excludeUserId && subscriber.userId && subscriber.userId === Number(excludeUserId)) {
      continue;
    }

    // Filter by project if subscriber is filtered
    if (subscriber.projectId && resolvedProjectId && subscriber.projectId !== resolvedProjectId) {
      continue;
    }

    subscriber.sendEvent(eventType, data, eventId);
  }

  return eventId;
}

/**
 * Returns total count of active subscribers, optionally scoped to an organization.
 */
export function getActiveSubscriberCount(organizationId = null) {
  if (organizationId !== null) {
    const subs = tenantSubscribers.get(Number(organizationId));
    return subs ? subs.size : 0;
  }

  let total = 0;
  for (const subs of tenantSubscribers.values()) {
    total += subs.size;
  }
  return total;
}

/**
 * Returns buffered events for an organization.
 */
export function getBufferedEvents(organizationId) {
  const buffer = tenantEventBuffers.get(Number(organizationId));
  return buffer ? [...buffer] : [];
}

/**
 * Resets all subscribers and event buffers (for testing environments).
 */
export function resetSyncState() {
  for (const subs of tenantSubscribers.values()) {
    for (const sub of subs) {
      sub.close();
    }
  }
  tenantSubscribers.clear();
  tenantEventBuffers.clear();
  eventSequence = 1;
}

// Wire domain events from workspaceEventEmitter to broadcastWorkspaceEvent
workspaceEventEmitter.on("task:created", (payload) => {
  if (!payload?.organizationId) return;
  broadcastWorkspaceEvent(payload.organizationId, "task:created", {
    task: payload.task,
    taskId: payload.taskId || payload.task?.id,
    projectId: payload.task?.projectId,
    actorId: payload.actorId,
  });
});

workspaceEventEmitter.on("task:updated", (payload) => {
  if (!payload?.organizationId) return;
  broadcastWorkspaceEvent(payload.organizationId, "task:updated", {
    task: payload.task,
    taskId: payload.taskId || payload.task?.id,
    projectId: payload.projectId || payload.task?.projectId,
    actorId: payload.actorId,
    changes: payload.changes,
  });
});

workspaceEventEmitter.on("task:status_changed", (payload) => {
  if (!payload?.organizationId) return;
  broadcastWorkspaceEvent(payload.organizationId, "task:updated", {
    task: payload.task,
    taskId: payload.taskId || payload.task?.id,
    projectId: payload.task?.projectId,
    actorId: payload.actorId,
    previousStatus: payload.previousStatus,
    newStatus: payload.newStatus,
  });
});

workspaceEventEmitter.on("task:assigned", (payload) => {
  if (!payload?.organizationId) return;
  broadcastWorkspaceEvent(payload.organizationId, "task:updated", {
    task: payload.task,
    taskId: payload.taskId || payload.task?.id,
    projectId: payload.task?.projectId,
    actorId: payload.actorId,
    previousAssigneeId: payload.previousAssigneeId,
    newAssigneeId: payload.newAssigneeId,
  });
});

workspaceEventEmitter.on("task:deleted", (payload) => {
  if (!payload?.organizationId) return;
  broadcastWorkspaceEvent(payload.organizationId, "task:deleted", {
    taskId: payload.taskId,
    projectId: payload.projectId,
    actorId: payload.actorId,
  });
});

workspaceEventEmitter.on("subtask:completed", (payload) => {
  if (!payload?.organizationId) return;
  broadcastWorkspaceEvent(payload.organizationId, "subtask:updated", {
    subtask: payload.subtask,
    taskId: payload.task?.id || payload.taskId,
    projectId: payload.task?.projectId,
    actorId: payload.actorId,
  });
});

workspaceEventEmitter.on("subtask:updated", (payload) => {
  if (!payload?.organizationId) return;
  broadcastWorkspaceEvent(payload.organizationId, "subtask:updated", {
    subtask: payload.subtask,
    taskId: payload.taskId,
    projectId: payload.projectId,
    actorId: payload.actorId,
  });
});

workspaceEventEmitter.on("comment:created", (payload) => {
  if (!payload?.organizationId) return;
  broadcastWorkspaceEvent(payload.organizationId, "comment:created", {
    comment: payload.comment,
    taskId: payload.task?.id || payload.taskId,
    projectId: payload.task?.projectId,
    actorId: payload.actorId,
  });
});
