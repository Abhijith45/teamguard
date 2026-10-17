import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { calculate90DayHeatmap, formatStorageBytes } from "../src/services/dashboard.service.js";

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

test("TASK-403 [US-DASH-001]: High-Level KPI Summary Metric Stat Cards", async () => {
  const session = await getAuthSession("super-admin", "acme-corp");

  const res = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${session.token}`,
      "x-organization-id": String(session.orgId),
    },
  });

  assert.equal(res.status, 200);
  assert.ok(res.data.stats, "Stats object must be returned");
  assert.equal(typeof res.data.stats.totalProjects, "number");
  assert.equal(typeof res.data.stats.totalTasks, "number");
  assert.equal(typeof res.data.stats.inProgress, "number");
  assert.equal(typeof res.data.stats.completed, "number");
  assert.equal(typeof res.data.stats.activeMembers, "number");
  assert.equal(typeof res.data.stats.storageBytes, "number");
  assert.ok(res.data.stats.storageFormatted, "Storage should be formatted");
  assert.ok(res.data.stats.totalProjects >= 1, "Must have at least 1 project in Acme Corp");
  assert.ok(res.data.stats.activeMembers >= 1, "Must have active members");
});

test("TASK-403 [US-DASH-002]: Urgent Tasks Due Within 48 Hours Feed", async () => {
  const session = await getAuthSession("super-admin", "acme-corp");

  // Create a task due in 24 hours (within 48h) and one due in 10 days
  const now = new Date();
  const dueTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dueFarFuture = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  const project = await prisma.project.findFirst({
    where: { organizationId: session.orgId },
  });

  const urgentTask = await prisma.task.create({
    data: {
      organizationId: session.orgId,
      projectId: project.id,
      creatorId: session.user.id,
      title: "Immediate Release Hotfix",
      status: "IN_PROGRESS",
      priority: "HIGH",
      dueDate: dueTomorrow,
    },
  });

  const farTask = await prisma.task.create({
    data: {
      organizationId: session.orgId,
      projectId: project.id,
      creatorId: session.user.id,
      title: "Future Backlog Milestone",
      status: "TODO",
      priority: "LOW",
      dueDate: dueFarFuture,
    },
  });

  try {
    const res = await api("/api/dashboard", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.urgent48hTasks), "urgent48hTasks must be an array");

    const foundUrgent = res.data.urgent48hTasks.some((t) => t.id === urgentTask.id);
    assert.ok(foundUrgent, "Task due in 24h must be included in urgent48hTasks feed");

    const foundFar = res.data.urgent48hTasks.some((t) => t.id === farTask.id);
    assert.equal(foundFar, false, "Task due in 10 days must NOT be included in urgent48hTasks feed");
  } finally {
    await prisma.task.deleteMany({
      where: { id: { in: [urgentTask.id, farTask.id] } },
    });
  }
});

test("TASK-403 [US-DASH-003]: Recent Projects with Live Progress Bars", async () => {
  const session = await getAuthSession("super-admin", "acme-corp");

  const res = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${session.token}`,
      "x-organization-id": String(session.orgId),
    },
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.recentProjects), "recentProjects must be an array");
  assert.ok(res.data.recentProjects.length > 0, "Must return active projects");

  const p = res.data.recentProjects[0];
  assert.ok(p.id);
  assert.ok(p.name);
  assert.equal(typeof p.progress, "number");
  assert.ok(Array.isArray(p.team), "Team avatars array should be present");
});

test("TASK-403 [US-DASH-004]: Today's Tasks Interactive Checklist", async () => {
  const session = await getAuthSession("team-member", "acme-corp");

  const res = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${session.token}`,
      "x-organization-id": String(session.orgId),
    },
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.todayTasks), "todayTasks must be an array");
});

test("TASK-403 [US-DASH-005]: Recent Workspace Activity Feed Stream", async () => {
  const session = await getAuthSession("super-admin", "acme-corp");

  // Create an audit log record
  await prisma.auditLog.create({
    data: {
      organizationId: session.orgId,
      actorId: session.user.id,
      action: "TASK_CREATED",
      resourceType: "task",
      resourceId: "123",
      details: "Created task for sprint release",
      outcome: "SUCCESS",
    },
  });

  const res = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${session.token}`,
      "x-organization-id": String(session.orgId),
    },
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.activityFeed), "activityFeed must be an array");
  assert.ok(res.data.activityFeed.length > 0, "Activity feed must have entries");
  const first = res.data.activityFeed[0];
  assert.ok(first.action);
  assert.ok(first.actor);
});

test("TASK-403 [US-DASH-006]: 90-Day Contribution Activity Heatmap Algorithm", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const tasks = [
    { completedAt: "2026-10-17T10:00:00Z" },
    { completedAt: "2026-10-17T11:00:00Z" },
    { completedAt: "2026-10-16T09:00:00Z" },
  ];
  const logs = [
    { createdAt: "2026-10-17T08:00:00Z" },
    { createdAt: "2026-10-15T14:00:00Z" },
  ];

  const heatmap = calculate90DayHeatmap(tasks, logs, now);

  assert.equal(heatmap.days.length, 91, "Must contain exactly 91 days (13 full weeks)");
  assert.equal(heatmap.weeks.length, 13, "Must contain exactly 13 week rows");
  assert.equal(heatmap.totalEvents, 5, "Total events count must be 5");

  const todayCell = heatmap.days.find((d) => d.date === "2026-10-17");
  assert.ok(todayCell, "Today cell must exist");
  assert.equal(todayCell.count, 3, "2 tasks + 1 log on 2026-10-17 = 3 events");
  assert.equal(todayCell.level, 2, "3 events maps to heat level 2");
});

test("TASK-403 [US-NOTIF-003]: User Alert Preferences CRUD & Persistence", async () => {
  const session = await getAuthSession("super-admin", "acme-corp");

  // Ensure clean state before testing default preferences
  await prisma.notificationPreference.deleteMany({
    where: {
      userId: session.user.id,
      organizationId: session.orgId,
    },
  });

  try {
    // 1. Get default preferences
    const getRes = await api("/api/notifications/preferences", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });

    assert.equal(getRes.status, 200);
    assert.ok(getRes.data.preferences);
    assert.equal(getRes.data.preferences.emailDigest, "DAILY");
    assert.equal(getRes.data.preferences.notifyTaskAssigned, true);

    // 2. Update preferences
    const patchRes = await api("/api/notifications/preferences", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
      body: {
        emailDigest: "WEEKLY",
        notifyDueSoon: false,
        notifyProjectArchived: false,
      },
    });

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.data.preferences.emailDigest, "WEEKLY");
    assert.equal(patchRes.data.preferences.notifyDueSoon, false);
    assert.equal(patchRes.data.preferences.notifyProjectArchived, false);
    assert.equal(patchRes.data.preferences.notifyTaskAssigned, true); // preserved

    // 3. Verify persistence
    const verifyRes = await api("/api/notifications/preferences", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.preferences.emailDigest, "WEEKLY");
    assert.equal(verifyRes.data.preferences.notifyDueSoon, false);

    // 4. Reject invalid payload
    const badRes = await api("/api/notifications/preferences", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
      body: {
        emailDigest: "HOURLY_INVALID",
      },
    });

    assert.equal(badRes.status, 400);
  } finally {
    await prisma.notificationPreference.deleteMany({
      where: {
        userId: session.user.id,
        organizationId: session.orgId,
      },
    });
  }
});
