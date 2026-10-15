import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { createNotificationService } from "../src/services/notifications.service.js";

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
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

test("Notifications API - Security & Isolation Barriers", async (t) => {
  await t.test("1. Unauthenticated request to /api/notifications returns 401", async () => {
    const res = await api("/api/notifications");
    assert.equal(res.status, 401);
  });

  await t.test("2. Authenticated request without x-organization-id header returns 400", async () => {
    const session = await getAuthSession("super-admin");
    const res = await api("/api/notifications", {
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    assert.equal(res.status, 400);
  });

  await t.test("3. Accessing with non-existent or invalid organization ID returns 403 or 400", async () => {
    const session = await getAuthSession("super-admin");
    const res = await api("/api/notifications", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": "999999",
      },
    });
    assert.equal(res.status, 403);
  });
});

test("Notifications API - Lifecycle & Personal Inbox Operations", async (t) => {
  const adminSession = await getAuthSession("super-admin");
  const memberSession = await getAuthSession("team-member");

  // Clean previous notifications for test users in this org
  await prisma.notification.deleteMany({
    where: {
      organizationId: memberSession.orgId,
      userId: memberSession.user.id,
    },
  });

  let notif1;
  let notif2;

  await t.test("1. Direct notification creation and unread count", async () => {
    notif1 = await createNotificationService({
      organizationId: memberSession.orgId,
      userId: memberSession.user.id,
      actorId: adminSession.user.id,
      type: "TASK_ASSIGNED",
      title: "Task Assigned",
      message: "You were assigned to task 'Security Audit Alpha'",
      resourceType: "task",
      resourceId: "101",
      link: "/tasks?taskId=101",
    });
    assert.ok(notif1?.id);
    assert.equal(notif1.isRead, false);

    notif2 = await createNotificationService({
      organizationId: memberSession.orgId,
      userId: memberSession.user.id,
      actorId: adminSession.user.id,
      type: "COMMENT_ADDED",
      title: "New Comment",
      message: "Admin commented on task",
      resourceType: "task",
      resourceId: "101",
      link: "/tasks?taskId=101",
    });
    assert.ok(notif2?.id);

    const countRes = await api("/api/notifications/unread-count", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(countRes.status, 200);
    assert.equal(countRes.data.unreadCount, 2);
  });

  await t.test("2. List notifications with pagination", async () => {
    const listRes = await api("/api/notifications?page=1&limit=10", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.notifications.length, 2);
    assert.equal(listRes.data.total, 2);
    assert.equal(listRes.data.unreadCount, 2);
    assert.equal(listRes.data.notifications[0].actor.name, adminSession.user.name);
  });

  await t.test("3. Mark single notification as read", async () => {
    const readRes = await api(`/api/notifications/${notif1.id}/read`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(readRes.status, 200);
    assert.equal(readRes.data.notification.isRead, true);
    assert.ok(readRes.data.notification.readAt);

    const countRes = await api("/api/notifications/unread-count", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(countRes.status, 200);
    assert.equal(countRes.data.unreadCount, 1);
  });

  await t.test("4. Marking another user's notification returns 404 (zero leakage)", async () => {
    const otherRes = await api(`/api/notifications/${notif1.id}/read`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminSession.token}`,
        "x-organization-id": String(adminSession.orgId),
      },
    });
    assert.equal(otherRes.status, 404);
  });

  await t.test("5. Filter by unreadOnly=true", async () => {
    const unreadRes = await api("/api/notifications?unreadOnly=true", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(unreadRes.status, 200);
    assert.ok(unreadRes.data.notifications.some((n) => n.id === notif2.id));
  });

  await t.test("6. Mark all as read", async () => {
    // Ensure inbox is scoped strictly to our test fixture notifications
    await prisma.notification.deleteMany({
      where: {
        organizationId: memberSession.orgId,
        userId: memberSession.user.id,
        id: { notIn: [notif1.id, notif2.id] },
      },
    });

    const markAllRes = await api("/api/notifications/mark-all-read", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(markAllRes.status, 200);
    assert.equal(markAllRes.data.updatedCount, 1);

    const countRes = await api("/api/notifications/unread-count", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(countRes.status, 200);
    assert.equal(countRes.data.unreadCount, 0);
  });

  await t.test("7. Delete single notification", async () => {
    const delRes = await api(`/api/notifications/${notif1.id}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.success, true);

    const listRes = await api("/api/notifications", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.notifications.find((n) => n.id === notif1.id), undefined);
    assert.ok(listRes.data.notifications.some((n) => n.id === notif2.id));
  });

  await t.test("8. Clear all read notifications", async () => {
    const clearRes = await api("/api/notifications/clear-read", {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(clearRes.status, 200);
    assert.ok(clearRes.data.deletedCount >= 1);

    const listRes = await api("/api/notifications", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.notifications.find((n) => n.id === notif2.id), undefined);
  });
});

test("Notifications API - Event Dispatcher Pipeline & Invariants", async (t) => {
  const adminSession = await getAuthSession("super-admin");
  const memberSession = await getAuthSession("team-member");

  // Clean member notifications
  await prisma.notification.deleteMany({
    where: {
      organizationId: memberSession.orgId,
      userId: memberSession.user.id,
    },
  });

  let createdTaskId;

  await t.test("1. Self-notification prevention: Admin creating task does not notify self", async () => {
    // Admin creates task assigned to self
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminSession.token}`,
        "x-organization-id": String(adminSession.orgId),
      },
      body: {
        projectId: 1,
        title: "Self Assigned Notification Test",
        assigneeId: adminSession.user.id,
        status: "TODO",
        priority: "HIGH",
      },
    });
    assert.equal(createRes.status, 201);
    createdTaskId = createRes.data.task.id;

    // Small delay for async event dispatcher
    await new Promise((r) => setTimeout(r, 100));

    const adminNotifs = await api("/api/notifications", {
      headers: {
        authorization: `Bearer ${adminSession.token}`,
        "x-organization-id": String(adminSession.orgId),
      },
    });
    assert.equal(adminNotifs.status, 200);
    const selfNotif = adminNotifs.data.notifications.find(
      (n) => n.resourceId === String(createdTaskId) && n.actorId === adminSession.user.id
    );
    assert.equal(selfNotif, undefined, "Actor must NOT receive self notification");
  });

  await t.test("2. Task Assignment Event: Admin assigns task to Member -> Member is notified", async () => {
    const updateRes = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminSession.token}`,
        "x-organization-id": String(adminSession.orgId),
      },
      body: {
        assigneeId: memberSession.user.id,
      },
    });
    assert.equal(updateRes.status, 200);

    // Small delay for async event dispatcher
    await new Promise((r) => setTimeout(r, 100));

    const memberNotifs = await api("/api/notifications", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(memberNotifs.status, 200);
    const assignNotif = memberNotifs.data.notifications.find(
      (n) => n.resourceId === String(createdTaskId) && n.type === "TASK_ASSIGNED"
    );
    assert.ok(assignNotif, "Member should receive TASK_ASSIGNED notification");
    assert.equal(assignNotif.actorId, adminSession.user.id);
  });

  await t.test("3. Status Change Event: Member moves task to IN_PROGRESS -> Admin (creator) is notified", async () => {
    // Clean admin notifications for this task first
    await prisma.notification.deleteMany({
      where: {
        organizationId: adminSession.orgId,
        userId: adminSession.user.id,
        resourceId: String(createdTaskId),
      },
    });

    const statusRes = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
      body: {
        status: "IN_PROGRESS",
      },
    });
    assert.equal(statusRes.status, 200);

    await new Promise((r) => setTimeout(r, 100));

    const adminNotifs = await api("/api/notifications", {
      headers: {
        authorization: `Bearer ${adminSession.token}`,
        "x-organization-id": String(adminSession.orgId),
      },
    });
    assert.equal(adminNotifs.status, 200);
    const statusNotif = adminNotifs.data.notifications.find(
      (n) => n.resourceId === String(createdTaskId) && n.type === "TASK_STATUS_CHANGED"
    );
    assert.ok(statusNotif, "Admin (creator) should receive TASK_STATUS_CHANGED notification");
    assert.equal(statusNotif.actorId, memberSession.user.id);
  });

  await t.test("4. Comment Created Event: Admin comments on task -> Member (assignee) is notified", async () => {
    // Clean member notifications for comment
    await prisma.notification.deleteMany({
      where: {
        organizationId: memberSession.orgId,
        userId: memberSession.user.id,
        type: "COMMENT_ADDED",
      },
    });

    const commentRes = await api(`/api/tasks/${createdTaskId}/comments`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminSession.token}`,
        "x-organization-id": String(adminSession.orgId),
      },
      body: {
        content: "Please review the updated acceptance criteria as discussed.",
      },
    });
    assert.equal(commentRes.status, 201);

    await new Promise((r) => setTimeout(r, 100));

    const memberNotifs = await api("/api/notifications", {
      headers: {
        authorization: `Bearer ${memberSession.token}`,
        "x-organization-id": String(memberSession.orgId),
      },
    });
    assert.equal(memberNotifs.status, 200);
    const commentNotif = memberNotifs.data.notifications.find(
      (n) => n.resourceId === String(createdTaskId) && n.type === "COMMENT_ADDED"
    );
    assert.ok(commentNotif, "Member should receive COMMENT_ADDED notification");
    assert.ok(commentNotif.message.includes("Please review"));
  });
});
