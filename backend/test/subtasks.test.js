import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";

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

test("TASK-301: Subtask Relational Schema, Checklist CRUD & Progress Propagation", async (t) => {
  const admin = await getAuthSession("super-admin", "acme-corp");
  const member = await getAuthSession("team-member", "acme-corp");
  const viewer = await getAuthSession("stakeholder", "acme-corp");

  // Setup test project and tasks in Acme Corp
  const projectRes = await api("/api/projects", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${admin.token}`,
      "x-organization-id": String(admin.orgId),
    },
    body: {
      name: "Subtask Test Project " + Date.now(),
      priority: "HIGH",
    },
  });
  assert.equal(projectRes.status, 201);
  const projectId = projectRes.data.project.id;

  // Create an active task assigned to team-member
  const taskRes = await api("/api/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${admin.token}`,
      "x-organization-id": String(admin.orgId),
    },
    body: {
      projectId,
      title: "Core Task for Subtasks",
      assigneeId: member.user.id,
    },
  });
  assert.equal(taskRes.status, 201);
  const taskId = taskRes.data.task.id;

  // Create another task assigned to super-admin (not assigned to member)
  const otherTaskRes = await api("/api/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${admin.token}`,
      "x-organization-id": String(admin.orgId),
    },
    body: {
      projectId,
      title: "Admin Only Task",
      assigneeId: admin.user.id,
    },
  });
  assert.equal(otherTaskRes.status, 201);
  const otherTaskId = otherTaskRes.data.task.id;

  let createdSubtaskId1;
  let createdSubtaskId2;

  await t.test("REQ 1 [US-SUB-001 / TG-SUB-001]: Create a subtask under a task with title and default isCompleted: false", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        title: "Define DB schema",
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.subtask.title, "Define DB schema");
    assert.equal(res.data.subtask.isCompleted, false);
    assert.equal(res.data.subtask.taskId, taskId);
    assert.equal(res.data.stats.total, 1);
    assert.equal(res.data.stats.completed, 0);
    assert.equal(res.data.stats.progress, 0);
    createdSubtaskId1 = res.data.subtask.id;
  });

  await t.test("REQ 2 [US-SUB-001]: Reject subtask creation with empty title (HTTP 400 Bad Request)", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        title: "   ",
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /title is required/i);
  });

  await t.test("REQ 3 [US-SUB-001 / AC 2]: Reject subtask creation exceeding 200 characters (HTTP 400 Bad Request)", async () => {
    const longTitle = "A".repeat(201);
    const res = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        title: longTitle,
      },
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /cannot exceed 200 characters/i);
  });

  await t.test("REQ 4 [US-SUB-001]: Non-existent parent task returns HTTP 404 Not Found", async () => {
    const res = await api(`/api/tasks/999999/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        title: "Valid title",
      },
    });

    assert.equal(res.status, 404);
    assert.match(res.data.error, /Task not found/i);
  });

  await t.test("REQ 5 [US-TENANT-005]: Cross-tenant subtask creation returns HTTP 404 Not Found", async () => {
    // Tenant 2 session
    const tenant2Admin = await getAuthSession("super-admin", "nova-labs");
    const res = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenant2Admin.token}`,
        "x-organization-id": String(tenant2Admin.orgId),
      },
      body: {
        title: "Cross-tenant intrusion attempt",
      },
    });

    assert.equal(res.status, 404);
  });

  await t.test("REQ 6 [US-PROJ-005 / BR-009]: Reject subtask creation targeting a task in an archived project (HTTP 400 Bad Request)", async () => {
    // Archive project
    const archiveRes = await api(`/api/projects/${projectId}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
    });
    assert.equal(archiveRes.status, 200);

    const res = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        title: "Should be blocked by archival",
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.code, "PROJECT_ARCHIVED");

    // Unarchive project for subsequent tests
    const unarchiveRes = await api(`/api/projects/${projectId}/unarchive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
    });
    assert.equal(unarchiveRes.status, 200);
  });

  await t.test("REQ 7 [US-SUB-002 / Dynamic Rollup]: Append second subtask and verify 0% progress", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        title: "Implement service methods",
      },
    });

    assert.equal(res.status, 201);
    createdSubtaskId2 = res.data.subtask.id;
    assert.equal(res.data.stats.total, 2);
    assert.equal(res.data.stats.completed, 0);
    assert.equal(res.data.stats.progress, 0);
  });

  await t.test("REQ 8 [US-SUB-002 / TG-SUB-002]: Toggle subtask isCompleted and verify parent progress advances to 50%", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks/${createdSubtaskId1}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        isCompleted: true,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.subtask.isCompleted, true);
    assert.equal(res.data.stats.total, 2);
    assert.equal(res.data.stats.completed, 1);
    assert.equal(res.data.stats.progress, 50);
  });

  await t.test("REQ 9 [US-SUB-001 / Editing]: Update subtask title cleanly", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks/${createdSubtaskId1}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        title: "Define DB schema with indexes",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.subtask.title, "Define DB schema with indexes");
    assert.equal(res.data.subtask.isCompleted, true);
  });

  await t.test("REQ 10 [US-SUB-001 / Reordering]: Reorder subtasks by array of IDs", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks/reorder`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        subtaskIds: [createdSubtaskId2, createdSubtaskId1],
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.subtasks[0].id, createdSubtaskId2);
    assert.equal(res.data.subtasks[0].order, 0);
    assert.equal(res.data.subtasks[1].id, createdSubtaskId1);
    assert.equal(res.data.subtasks[1].order, 1);
  });

  await t.test("REQ 11 [US-SUB-002]: Toggle second subtask to complete and verify 100% progress", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks/${createdSubtaskId2}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
      body: {
        isCompleted: true,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.stats.total, 2);
    assert.equal(res.data.stats.completed, 2);
    assert.equal(res.data.stats.progress, 100);
  });

  await t.test("REQ 12 [US-SUB-001 / Deletion]: Delete a subtask and recalculate progress", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks/${createdSubtaskId2}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${admin.token}`,
        "x-organization-id": String(admin.orgId),
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.stats.total, 1);
    assert.equal(res.data.stats.completed, 1);
    assert.equal(res.data.stats.progress, 100);
  });

  await t.test("REQ 13 [US-ABAC-001 / BR-005]: Team Member can update subtasks on tasks assigned to them (task:update:own)", async () => {
    // Member adds a subtask to taskId (which is assigned to member)
    const res = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${member.token}`,
        "x-organization-id": String(member.orgId),
      },
      body: {
        title: "Member added subtask",
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.subtask.title, "Member added subtask");
  });

  await t.test("REQ 14 [US-ABAC-001 / BR-005]: Team Member is blocked from updating subtasks on tasks assigned to other members (HTTP 403 Forbidden)", async () => {
    // Member tries to add a subtask to otherTaskId (which is assigned to admin)
    const res = await api(`/api/tasks/${otherTaskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${member.token}`,
        "x-organization-id": String(member.orgId),
      },
      body: {
        title: "Unauthorized member subtask",
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.code, "CANNOT_UPDATE_OTHERS_TASK");
  });

  await t.test("REQ 15 [Negative RBAC]: Viewer lacking task:update cannot create subtasks (HTTP 403 Forbidden)", async () => {
    const res = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewer.token}`,
        "x-organization-id": String(viewer.orgId),
      },
      body: {
        title: "Viewer subtask attempt",
      },
    });

    assert.equal(res.status, 403);
  });

  await t.test("REQ 16 [Audit Trail]: Subtask mutations emit structured AuditLog records", async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId: admin.orgId,
        action: { in: ["subtask:create", "subtask:update", "subtask:delete"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    assert.ok(logs.length >= 3, "Expected at least 3 subtask audit logs");
    assert.ok(logs.some((l) => l.action === "subtask:create"));
    assert.ok(logs.some((l) => l.action === "subtask:update"));
    assert.ok(logs.some((l) => l.action === "subtask:delete"));
  });
});
