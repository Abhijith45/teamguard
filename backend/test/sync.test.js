import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import {
  broadcastWorkspaceEvent,
  getActiveSubscriberCount,
  getBufferedEvents,
  resetSyncState,
} from "../src/services/sync.service.js";

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  resetSyncState();
  await new Promise((resolve) => server.close(resolve));
});

async function api(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "content-type": "application/json",
    ...options.headers,
  };
  let bodyPayload;
  if (typeof options.body === "string") {
    bodyPayload = options.body;
  } else if (options.body !== undefined) {
    bodyPayload = JSON.stringify(options.body);
  }
  const response = await fetch(url, {
    ...options,
    headers,
    body: bodyPayload,
  });
  let data = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

async function getAuthSession(persona = "super-admin", organizationSlug = "acme-corp") {
  const res = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona, organizationSlug },
  });
  assert.equal(res.status, 200, `Failed to authenticate persona: ${persona}`);
  return {
    token: res.data.accessToken,
    orgId: res.data.activeOrganization.id,
    user: res.data.user,
  };
}

/**
 * Helper to parse SSE stream chunks into structured events
 */
function parseSseChunk(text) {
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

  return { event, id, data, isComment, raw: text };
}

class SseReader {
  constructor(reader, decoder) {
    this.reader = reader;
    this.decoder = decoder;
    this.buffer = "";
  }

  async nextEvent(timeoutMs = 4000) {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout waiting for SSE event (${timeoutMs}ms)`)), timeoutMs)
    );

    const readPromise = (async () => {
      while (true) {
        const doubleNewlineIndex = this.buffer.indexOf("\n\n");
        if (doubleNewlineIndex !== -1) {
          const chunk = this.buffer.slice(0, doubleNewlineIndex);
          this.buffer = this.buffer.slice(doubleNewlineIndex + 2);
          if (!chunk.trim() || chunk.startsWith(":")) {
            // ping comment or empty line, keep searching
            continue;
          }
          return parseSseChunk(chunk);
        }
        const { value, done } = await this.reader.read();
        if (done) return null;
        this.buffer += this.decoder.decode(value, { stream: true });
      }
    })();

    return Promise.race([readPromise, timeoutPromise]);
  }
}

test("TASK-503: Real-Time State Synchronization via SSE Streams (UD-003)", async (t) => {
  resetSyncState();

  const adminAcme = await getAuthSession("super-admin", "acme-corp");
  const memberAcme = await getAuthSession("team-member", "acme-corp");
  const adminNova = await getAuthSession("super-admin", "nova-labs");

  await t.test("1. Missing authentication token returns HTTP 401 Unauthorized", async () => {
    const res = await api("/api/events/stream", {
      headers: {
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(res.status, 401);
  });

  await t.test("2. Missing x-organization-id header returns HTTP 400 Bad Request", async () => {
    const res = await api("/api/events/stream", {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
      },
    });
    assert.equal(res.status, 400);
    assert.ok(res.data.error?.includes("x-organization-id"));
  });

  await t.test("3. Non-member tenant access returns HTTP 403 Forbidden", async () => {
    // Nova user attempting to access Acme stream
    const res = await api("/api/events/stream", {
      headers: {
        authorization: `Bearer ${adminNova.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(res.status, 403);
  });

  await t.test("4. Valid connection returns 200 with standard SSE headers and initial connected event", async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/events/stream`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      signal: controller.signal,
    });

    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type")?.includes("text/event-stream"));
    assert.ok(response.headers.get("cache-control")?.includes("no-cache"));
    assert.equal(response.headers.get("x-accel-buffering"), "no");

    const reader = new SseReader(response.body.getReader(), new TextDecoder());
    const firstEvent = await reader.nextEvent();
    assert.ok(firstEvent);
    assert.equal(firstEvent.event, "connected");
    assert.equal(firstEvent.data?.status, "connected");
    assert.equal(firstEvent.data?.organizationId, adminAcme.orgId);
    assert.equal(firstEvent.data?.userId, adminAcme.user.id);

    controller.abort();
  });

  await t.test("5. Dual route support: /api/v1/events/stream also connects successfully", async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/v1/events/stream`, {
      headers: {
        authorization: `Bearer ${memberAcme.token}`,
        "x-organization-id": String(memberAcme.orgId),
      },
      signal: controller.signal,
    });

    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type")?.includes("text/event-stream"));

    const reader = new SseReader(response.body.getReader(), new TextDecoder());
    const firstEvent = await reader.nextEvent();
    assert.equal(firstEvent.event, "connected");

    controller.abort();
  });

  await t.test("6. Cross-Tenant Isolation: Acme events are NEVER received by Nova subscriber", async () => {
    resetSyncState();

    const acmeController = new AbortController();
    const novaController = new AbortController();

    const acmeStream = await fetch(`${baseUrl}/api/events/stream`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      signal: acmeController.signal,
    });
    const acmeReader = new SseReader(acmeStream.body.getReader(), new TextDecoder());
    await acmeReader.nextEvent(); // consume "connected"

    const novaStream = await fetch(`${baseUrl}/api/events/stream`, {
      headers: {
        authorization: `Bearer ${adminNova.token}`,
        "x-organization-id": String(adminNova.orgId),
      },
      signal: novaController.signal,
    });
    const novaReader = new SseReader(novaStream.body.getReader(), new TextDecoder());
    await novaReader.nextEvent(); // consume "connected"

    // Broadcast an event strictly inside Acme Corp
    broadcastWorkspaceEvent(adminAcme.orgId, "task:updated", {
      taskId: 999,
      title: "Acme Confidential Task",
    });

    // Acme reader should receive it promptly
    const acmeEvent = await acmeReader.nextEvent();
    assert.equal(acmeEvent.event, "task:updated");
    assert.equal(acmeEvent.data?.taskId, 999);
    assert.equal(acmeEvent.data?.title, "Acme Confidential Task");

    // Nova reader should NOT receive any event (timeout confirms zero leakage)
    let novaReceived = false;
    try {
      await novaReader.nextEvent(400);
      novaReceived = true;
    } catch {
      // Expected timeout - no event leaked to Nova!
      novaReceived = false;
    }
    assert.equal(novaReceived, false, "Nova subscriber must NOT receive Acme event");

    acmeController.abort();
    novaController.abort();
  });

  await t.test("7. Project ID Filtering: subscriber only receives events matching requested project", async () => {
    resetSyncState();

    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/api/events/stream?projectId=42`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      signal: controller.signal,
    });
    const reader = new SseReader(stream.body.getReader(), new TextDecoder());
    await reader.nextEvent(); // connected

    // Broadcast event for Project 99 (different project)
    broadcastWorkspaceEvent(adminAcme.orgId, "task:updated", { taskId: 1 }, { projectId: 99 });

    // Broadcast event for Project 42 (matching project)
    broadcastWorkspaceEvent(adminAcme.orgId, "task:updated", { taskId: 2, title: "Matching Project 42" }, { projectId: 42 });

    const receivedEvent = await reader.nextEvent();
    assert.equal(receivedEvent.data?.taskId, 2);
    assert.equal(receivedEvent.data?.title, "Matching Project 42");

    controller.abort();
  });

  await t.test("8. Task CRUD Real-Time Broadcast: REST API mutations broadcast to active SSE subscribers", async () => {
    resetSyncState();

    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/api/events/stream`, {
      headers: {
        authorization: `Bearer ${memberAcme.token}`,
        "x-organization-id": String(memberAcme.orgId),
      },
      signal: controller.signal,
    });
    const reader = new SseReader(stream.body.getReader(), new TextDecoder());
    await reader.nextEvent(); // connected

    // 1. Admin creates task via REST
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        projectId: 1,
        title: "Real-Time Sync Validation Task",
        status: "TODO",
        priority: "HIGH",
      },
    });
    assert.equal(createRes.status, 201);
    const createdTaskId = createRes.data.task.id;

    // SSE subscriber should receive task:created
    const createEvent = await reader.nextEvent();
    assert.equal(createEvent.event, "task:created");
    assert.equal(createEvent.data?.task?.id, createdTaskId);
    assert.equal(createEvent.data?.task?.title, "Real-Time Sync Validation Task");

    // 2. Admin updates task status to IN_PROGRESS
    const updateRes = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        status: "IN_PROGRESS",
      },
    });
    assert.equal(updateRes.status, 200);

    // SSE subscriber should receive task:updated
    const updateEvent = await reader.nextEvent();
    assert.equal(updateEvent.event, "task:updated");
    assert.equal(updateEvent.data?.taskId, createdTaskId);

    controller.abort();
  });

  await t.test("9. Last-Event-ID reconnection replays missed buffered events", async () => {
    resetSyncState();

    // Broadcast 3 events into Acme Corp buffer
    const id1 = broadcastWorkspaceEvent(adminAcme.orgId, "task:created", { taskId: 101, title: "Event 1" });
    const id2 = broadcastWorkspaceEvent(adminAcme.orgId, "task:updated", { taskId: 102, title: "Event 2" });
    const id3 = broadcastWorkspaceEvent(adminAcme.orgId, "task:updated", { taskId: 103, title: "Event 3" });

    // Client reconnects supplying Last-Event-ID = id1
    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/api/events/stream`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
        "Last-Event-ID": id1,
      },
      signal: controller.signal,
    });
    const reader = new SseReader(stream.body.getReader(), new TextDecoder());

    // 1. Initial connected event
    const connEvent = await reader.nextEvent();
    assert.equal(connEvent.event, "connected");

    // 2. Replayed event 2
    const replay2 = await reader.nextEvent();
    assert.equal(replay2.id, id2);
    assert.equal(replay2.data?.taskId, 102);

    // 3. Replayed event 3
    const replay3 = await reader.nextEvent();
    assert.equal(replay3.id, id3);
    assert.equal(replay3.data?.taskId, 103);

    controller.abort();
  });

  await t.test("10. Last-Event-ID buffer overflow instructs client to reconcile full state", async () => {
    resetSyncState();

    // Reconnecting with non-existent or expired event ID
    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/api/events/stream?lastEventId=evt_expired_99999`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      signal: controller.signal,
    });
    const reader = new SseReader(stream.body.getReader(), new TextDecoder());

    await reader.nextEvent(); // connected

    const reconcileEvent = await reader.nextEvent();
    assert.equal(reconcileEvent.event, "sync:reconcile");
    assert.equal(reconcileEvent.data?.reason, "buffer_overflow");

    controller.abort();
  });

  await t.test("11. Client disconnection cleanly decrements active subscriber count (zero memory leaks)", async () => {
    resetSyncState();
    assert.equal(getActiveSubscriberCount(adminAcme.orgId), 0);

    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/api/events/stream`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      signal: controller.signal,
    });
    const reader = new SseReader(stream.body.getReader(), new TextDecoder());
    await reader.nextEvent(); // connected

    assert.equal(getActiveSubscriberCount(adminAcme.orgId), 1);

    // Abort connection
    controller.abort();

    // Wait a brief tick for req.on('close') event to fire
    await new Promise((r) => setTimeout(r, 80));

    assert.equal(getActiveSubscriberCount(adminAcme.orgId), 0);
  });

  await t.test("12. Diagnostic status endpoint returns active subscriber count and buffer metrics", async () => {
    const statusRes = await api("/api/events/status", {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });

    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.data.organizationId, adminAcme.orgId);
    assert.equal(typeof statusRes.data.activeSubscribers, "number");
    assert.equal(typeof statusRes.data.bufferedEventsCount, "number");
  });
});
