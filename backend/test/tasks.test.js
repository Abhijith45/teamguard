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

test("TASK-203: Task Core CRUD, Validation, Status Workflow & Priority Engine", async (t) => {
  // 1. Authenticate Personas across tenants
  const superAdmin = await getAuthSession("super-admin", "acme-corp");
  const manager = await getAuthSession("project-manager", "acme-corp");
  const teamMember = await getAuthSession("team-member", "acme-corp");
  const viewer = await getAuthSession("stakeholder", "acme-corp");
  const novaElena = await getAuthSession("super-admin", "nova-labs");

  // Get active projects in Acme Corp
  const projectsRes = await api("/api/projects", {
    headers: {
      Authorization: `Bearer ${superAdmin.token}`,
      "x-organization-id": String(superAdmin.orgId),
    },
  });
  assert.equal(projectsRes.status, 200);
  const activeProject = projectsRes.data.projects.find((p) => !p.isArchived);
  assert.ok(activeProject, "Must have an active project in Acme Corp");

  let createdTaskId;

  await t.test("REQ 1 [US-TASK-001 / TG-TASK-001]: List tasks scoped to active tenant", async () => {
    const res = await api("/api/tasks", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.tasks));
    assert.ok(res.data.tasks.length > 0);

    // Verify all returned tasks belong to active tenant and include project key
    for (const task of res.data.tasks) {
      assert.equal(task.organizationId, superAdmin.orgId);
      assert.ok(task.project, "Task must include project object");
      assert.ok(task.project.key, "Project must include key badge");
    }
  });

  await t.test("REQ 2 [TASK-203 / US-TASK-001]: Retrieve single task by ID (GET /api/tasks/:id)", async () => {
    // Get existing task ID from list
    const listRes = await api("/api/tasks", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    const firstTask = listRes.data.tasks[0];

    const res = await api(`/api/tasks/${firstTask.id}`, {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.task.id, firstTask.id);
    assert.equal(res.data.task.organizationId, superAdmin.orgId);
    assert.ok(res.data.task.project);
    assert.ok(res.data.task.creator);
  });

  await t.test("REQ 3 [TASK-203]: Cross-tenant task retrieval returns HTTP 404 Not Found (zero-leak IDOR)", async () => {
    // Retrieve a task belonging to Nova Labs
    const novaTasksRes = await api("/api/tasks", {
      headers: {
        Authorization: `Bearer ${novaElena.token}`,
        "x-organization-id": String(novaElena.orgId),
      },
    });
    assert.equal(novaTasksRes.status, 200);
    const novaTaskId = novaTasksRes.data.tasks[0].id;

    // Super Admin from Acme Corp queries Nova Labs task
    const res = await api(`/api/tasks/${novaTaskId}`, {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });

    assert.equal(res.status, 404, "Cross-tenant task lookup must return HTTP 404");
  });

  await t.test("REQ 4 [US-TASK-001 / US-TASK-002]: Create task with valid title, description, priority, and due date", async () => {
    const payload = {
      projectId: activeProject.id,
      title: "Implement Core Security Policy Check",
      description: "Ensure status workflows stamp completedAt timestamp appropriately.",
      status: "TODO",
      priority: "HIGH",
      assigneeId: teamMember.user.id,
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
    };

    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: payload,
    });

    assert.equal(res.status, 201);
    assert.ok(res.data.task.id);
    assert.equal(res.data.task.title, payload.title);
    assert.equal(res.data.task.priority, "HIGH");
    assert.equal(res.data.task.status, "TODO");
    assert.equal(res.data.task.completedAt, null);
    assert.equal(res.data.task.assigneeId, teamMember.user.id);
    assert.equal(res.data.task.creatorId, superAdmin.user.id);

    createdTaskId = res.data.task.id;
  });

  await t.test("REQ 5 [TASK-203]: Reject task creation with invalid priority", async () => {
    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: {
        projectId: activeProject.id,
        title: "Invalid Priority Task",
        priority: "CRITICAL_SUPER_HIGH",
      },
    });

    assert.equal(res.status, 400);
  });

  await t.test("REQ 6 [TASK-203]: Reject task creation with invalid status", async () => {
    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: {
        projectId: activeProject.id,
        title: "Invalid Status Task",
        status: "NON_EXISTENT_STATUS",
      },
    });

    assert.equal(res.status, 400);
  });

  await t.test("REQ 7 [TASK-203]: Reject task creation with title less than 2 characters", async () => {
    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: {
        projectId: activeProject.id,
        title: "A",
      },
    });

    assert.equal(res.status, 400);
  });

  await t.test("REQ 8 [TASK-203]: Reject task creation if project does not exist in tenant", async () => {
    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: {
        projectId: 999999,
        title: "Nonexistent Project Task",
      },
    });

    assert.equal(res.status, 404);
  });

  await t.test("REQ 9 [US-PROJ-005 / BR-009]: Reject task creation targeting an archived project", async () => {
    // Create and archive a temporary project
    const pRes = await api("/api/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { name: "Archival Test Project Alpha" },
    });
    assert.equal(pRes.status, 201);
    const archProjId = pRes.data.project.id;

    const archRes = await api(`/api/projects/${archProjId}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(archRes.status, 200);

    // Attempt to create a task in the archived project
    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: {
        projectId: archProjId,
        title: "Attempted Task in Archived Project",
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.code, "PROJECT_ARCHIVED");
  });

  await t.test("REQ 10 [US-TASK-003 / Status Workflow]: Transition TODO to IN_PROGRESS maintains completedAt = null", async () => {
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { status: "IN_PROGRESS" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.task.status, "IN_PROGRESS");
    assert.equal(res.data.task.completedAt, null);
  });

  await t.test("REQ 11 [US-TASK-003 / Status Workflow]: Transition IN_PROGRESS to DONE stamps completedAt timestamp", async () => {
    const beforeTime = new Date(Date.now() - 1000);
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { status: "DONE" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.task.status, "DONE");
    assert.ok(res.data.task.completedAt, "completedAt must be populated when task is marked DONE");
    const completedDate = new Date(res.data.task.completedAt);
    assert.ok(completedDate >= beforeTime, "completedAt must be contemporary with transition");
  });

  await t.test("REQ 12 [US-TASK-003 / Status Workflow]: Transition away from DONE resets completedAt to null", async () => {
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { status: "REVISION" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.task.status, "REVISION");
    assert.equal(res.data.task.completedAt, null, "completedAt must reset to null when leaving DONE status");
  });

  await t.test("REQ 13 [US-TASK-003 / Status Workflow]: Accepts REVIEW as alias and normalizes to REVISION", async () => {
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { status: "REVIEW" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.task.status, "REVISION");
  });

  await t.test("REQ 14 [US-TASK-002 / Priority Engine]: Allows updating priority to URGENT", async () => {
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { priority: "URGENT" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.task.priority, "URGENT");
  });

  await t.test("REQ 15 [US-TASK-001 / Due Date Engine]: Updates and clears dueDate cleanly", async () => {
    const newDate = new Date(Date.now() + 86400000 * 7).toISOString();
    const updateRes = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { dueDate: newDate },
    });
    assert.equal(updateRes.status, 200);
    assert.ok(updateRes.data.task.dueDate);

    // Clear dueDate with null
    const clearRes = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { dueDate: null },
    });
    assert.equal(clearRes.status, 200);
    assert.equal(clearRes.data.task.dueDate, null);
  });

  await t.test("REQ 16 [US-ABAC-001 / BR-005]: Team Member can update a task assigned to them", async () => {
    // Assign createdTaskId to teamMember
    const assignRes = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { assigneeId: teamMember.user.id },
    });
    assert.equal(assignRes.status, 200);

    // Team Member updates status to IN_PROGRESS
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${teamMember.token}`,
        "x-organization-id": String(teamMember.orgId),
      },
      body: { status: "IN_PROGRESS", description: "Updated by assignee" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.task.status, "IN_PROGRESS");
    assert.equal(res.data.task.description, "Updated by assignee");
  });

  await t.test("REQ 17 [US-ABAC-001 / BR-005]: Team Member is blocked from updating task assigned to another member", async () => {
    // Create a task assigned to Alex Rivera (Manager) and created by Super Admin
    const otherTaskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: {
        projectId: activeProject.id,
        title: "Manager Exclusive Task",
        assigneeId: manager.user.id,
      },
    });
    assert.equal(otherTaskRes.status, 201);
    const otherTaskId = otherTaskRes.data.task.id;

    // Team Member (Annisa) attempts to update Manager's task
    const res = await api(`/api/tasks/${otherTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${teamMember.token}`,
        "x-organization-id": String(teamMember.orgId),
      },
      body: { status: "DONE" },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.code, "CANNOT_UPDATE_OTHERS_TASK");
  });

  await t.test("REQ 18 [US-ABAC-001]: Project Manager (task:update:any) can update any task in organization", async () => {
    // Manager updates createdTaskId (assigned to teamMember)
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${manager.token}`,
        "x-organization-id": String(manager.orgId),
      },
      body: { status: "DONE" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.task.status, "DONE");
  });

  await t.test("REQ 19 [TASK-002 / US-ABAC-001]: Non-admin cannot modify protected governance fields under task:update:own", async () => {
    // Team Member attempts to reassign assigneeId
    const res1 = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${teamMember.token}`,
        "x-organization-id": String(teamMember.orgId),
      },
      body: { assigneeId: superAdmin.user.id },
    });
    assert.equal(res1.status, 403);
    assert.equal(res1.data.code, "PROTECTED_FIELD_MUTATION");

    // Team Member attempts to modify creatorId
    const res2 = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${teamMember.token}`,
        "x-organization-id": String(teamMember.orgId),
      },
      body: { creatorId: teamMember.user.id },
    });
    assert.equal(res2.status, 403);
    assert.equal(res2.data.code, "PROTECTED_FIELD_MUTATION");
  });

  await t.test("REQ 20 [TASK-002 / Prototype Pollution]: Reject prototype pollution attempts on task update", async () => {
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: '{"__proto__": {"admin": true}, "status": "DONE"}',
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.code, "PROTOTYPE_POLLUTION_DETECTED");
  });

  await t.test("REQ 21 [TASK-203 / Assignee Validation]: Reject assigning a task to a non-member of the organization", async () => {
    // Elena belongs to Nova Labs, not Acme Corp
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { assigneeId: novaElena.user.id },
    });

    assert.equal(res.status, 400);
    assert.ok(res.data.error.includes("active member"));
  });

  await t.test("REQ 22 [US-PROJ-005 / BR-009]: Reject task updates on an archived project", async () => {
    // Create project, task, then archive project
    const projRes = await api("/api/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { name: "Archival Freeze Task Target" },
    });
    const projId = projRes.data.project.id;

    const taskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { projectId: projId, title: "Pre-Archival Task" },
    });
    const frozenTaskId = taskRes.data.task.id;

    // Archive project
    await api(`/api/projects/${projId}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });

    // Attempt to update task
    const res = await api(`/api/tasks/${frozenTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { status: "DONE" },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.code, "PROJECT_ARCHIVED");
  });

  await t.test("REQ 23 [TASK-203 / Cross-Tenant Mutation]: Cross-tenant task update returns HTTP 404", async () => {
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${novaElena.token}`,
        "x-organization-id": String(novaElena.orgId),
      },
      body: { title: "Attempt Cross Tenant Name Change" },
    });

    assert.equal(res.status, 404);
  });

  await t.test("REQ 24 [TASK-203 / Task Deletion]: Authorized actor can delete task returning HTTP 204", async () => {
    const toDeleteRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { projectId: activeProject.id, title: "Task for Deletion Test" },
    });
    const delId = toDeleteRes.data.task.id;

    const delRes = await api(`/api/tasks/${delId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });

    assert.equal(delRes.status, 204);

    // Verify task is gone
    const checkRes = await api(`/api/tasks/${delId}`, {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(checkRes.status, 404);
  });

  await t.test("REQ 25 [US-PROJ-005 / BR-009]: Reject task deletion on an archived project", async () => {
    // Create project, task, then archive project
    const projRes = await api("/api/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { name: "Archival Deletion Project" },
    });
    const projId = projRes.data.project.id;

    const taskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
      body: { projectId: projId, title: "Task Cannot Delete In Archived" },
    });
    const lockedTaskId = taskRes.data.task.id;

    // Archive project
    await api(`/api/projects/${projId}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });

    const res = await api(`/api/tasks/${lockedTaskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.code, "PROJECT_ARCHIVED");
  });

  await t.test("REQ 26 [TASK-203 / Negative Authorization]: Viewer lacking task:create receives HTTP 403", async () => {
    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewer.token}`,
        "x-organization-id": String(viewer.orgId),
      },
      body: { projectId: activeProject.id, title: "Viewer Unauthorized Task" },
    });

    assert.equal(res.status, 403);
  });

  await t.test("REQ 27 [TASK-203 / Negative Authorization]: Viewer lacking task:delete receives HTTP 403", async () => {
    const res = await api(`/api/tasks/${createdTaskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${viewer.token}`,
        "x-organization-id": String(viewer.orgId),
      },
    });

    assert.equal(res.status, 403);
  });

  await t.test("REQ 28 [TASK-203 / Audit Trail]: Emits structured AuditLog entries for task lifecycle events", async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: superAdmin.orgId,
        resourceType: "Task",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    assert.ok(auditLogs.length > 0, "Must have recorded Task audit logs");
    const actions = auditLogs.map((l) => l.action);
    assert.ok(actions.includes("task:create"), "Must have audited task:create");
    assert.ok(actions.includes("task:update"), "Must have audited task:update");
  });
});

test("TASK-206: Task Search, Filtering, Sorting & Pagination Engine", async (t) => {
  const superAdmin = await getAuthSession("super-admin", "acme-corp");
  const novaElena = await getAuthSession("super-admin", "nova-labs");

  // Fetch active project
  const projectsRes = await api("/api/projects", {
    headers: {
      Authorization: `Bearer ${superAdmin.token}`,
      "x-organization-id": String(superAdmin.orgId),
    },
  });
  const activeProject = projectsRes.data.projects.find((p) => !p.isArchived);
  assert.ok(activeProject);

  // Seed 4 distinct tasks for predictable search and filter assertions
  const seed1 = await api("/api/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${superAdmin.token}`,
      "x-organization-id": String(superAdmin.orgId),
    },
    body: {
      projectId: activeProject.id,
      title: "Alpha Searchable Task Optimization",
      description: "Critical algorithm for checkout latency",
      status: "TODO",
      priority: "URGENT",
      dueDate: "2026-11-01T10:00:00.000Z",
    },
  });
  assert.equal(seed1.status, 201);

  const seed2 = await api("/api/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${superAdmin.token}`,
      "x-organization-id": String(superAdmin.orgId),
    },
    body: {
      projectId: activeProject.id,
      title: "Beta Documentation Review",
      description: "Review API contracts and guidelines",
      status: "IN_PROGRESS",
      priority: "HIGH",
      dueDate: "2026-11-10T10:00:00.000Z",
    },
  });
  assert.equal(seed2.status, 201);

  const seed3 = await api("/api/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${superAdmin.token}`,
      "x-organization-id": String(superAdmin.orgId),
    },
    body: {
      projectId: activeProject.id,
      title: "Gamma Searchable Payment Gateway",
      description: "Integrate stripe tokenization",
      status: "TODO",
      priority: "LOW",
      dueDate: "2026-11-20T10:00:00.000Z",
    },
  });
  assert.equal(seed3.status, 201);

  const seed4 = await api("/api/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${superAdmin.token}`,
      "x-organization-id": String(superAdmin.orgId),
    },
    body: {
      projectId: activeProject.id,
      title: "Delta Infrastructure Tuning",
      description: "Tune redis connection pool and worker memory",
      status: "DONE",
      priority: "MEDIUM",
      dueDate: "2026-10-25T10:00:00.000Z",
    },
  });
  assert.equal(seed4.status, 201);

  await t.test("REQ 1 [TASK-206 / Search]: Case-insensitive search on title and description", async () => {
    // 1. Search title "alpha searchable" in lowercase
    const resTitle = await api("/api/tasks?search=alpha%20searchable", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resTitle.status, 200);
    assert.ok(resTitle.data.tasks.length >= 1);
    assert.ok(resTitle.data.tasks.some((t) => t.id === seed1.data.task.id));

    // 2. Search description "checkout latency"
    const resDesc = await api("/api/tasks?search=checkout%20latency", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resDesc.status, 200);
    assert.ok(resDesc.data.tasks.some((t) => t.id === seed1.data.task.id));
    assert.ok(!resDesc.data.tasks.some((t) => t.id === seed2.data.task.id));
  });

  await t.test("REQ 2 [TASK-206 / Filtering]: Status and Priority discrete filtering", async () => {
    // 1. Filter by status TODO
    const resStatus = await api("/api/tasks?status=TODO", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resStatus.status, 200);
    assert.ok(resStatus.data.tasks.length > 0);
    for (const t of resStatus.data.tasks) {
      assert.equal(t.status, "TODO");
    }

    // 2. Filter by priority URGENT
    const resPriority = await api("/api/tasks?priority=URGENT", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resPriority.status, 200);
    for (const t of resPriority.data.tasks) {
      assert.equal(t.priority, "URGENT");
    }

    // 3. Combined Filter: status=TODO & priority=LOW
    const resCombined = await api("/api/tasks?status=TODO&priority=LOW", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resCombined.status, 200);
    assert.ok(resCombined.data.tasks.some((t) => t.id === seed3.data.task.id));
    for (const t of resCombined.data.tasks) {
      assert.equal(t.status, "TODO");
      assert.equal(t.priority, "LOW");
    }
  });

  await t.test("REQ 3 [TASK-206 / Project & Assignee Filter]: Filter by project and unassigned status", async () => {
    const resProj = await api(`/api/tasks?projectId=${activeProject.id}`, {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resProj.status, 200);
    for (const t of resProj.data.tasks) {
      assert.equal(t.projectId, activeProject.id);
    }

    // Filter unassigned
    const resUnassigned = await api("/api/tasks?assigneeId=unassigned", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resUnassigned.status, 200);
    for (const t of resUnassigned.data.tasks) {
      assert.equal(t.assigneeId, null);
    }
  });

  await t.test("REQ 4 [TASK-206 / Sorting]: Sort tasks by dueDate and title", async () => {
    // Sort dueDate ascending
    const resDueAsc = await api("/api/tasks?sortBy=dueDate&order=asc", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resDueAsc.status, 200);
    const withDueDate = resDueAsc.data.tasks.filter((t) => t.dueDate);
    for (let i = 0; i < withDueDate.length - 1; i++) {
      const d1 = new Date(withDueDate[i].dueDate).getTime();
      const d2 = new Date(withDueDate[i + 1].dueDate).getTime();
      assert.ok(d1 <= d2, "Tasks with due dates must be sorted ascending");
    }

    // Sort title descending
    const resTitleDesc = await api("/api/tasks?sortBy=title&order=desc", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(resTitleDesc.status, 200);
    for (let i = 0; i < resTitleDesc.data.tasks.length - 1; i++) {
      const t1 = resTitleDesc.data.tasks[i].title.toLowerCase();
      const t2 = resTitleDesc.data.tasks[i + 1].title.toLowerCase();
      assert.ok(t1 >= t2, "Tasks must be sorted by title descending");
    }
  });

  await t.test("REQ 5 [TASK-206 / Pagination]: Returns page, limit, total, and totalPages slices", async () => {
    const page1Res = await api("/api/tasks?page=1&limit=2", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(page1Res.status, 200);
    assert.equal(page1Res.data.page, 1);
    assert.equal(page1Res.data.limit, 2);
    assert.ok(page1Res.data.total >= 4);
    assert.equal(page1Res.data.tasks.length, 2);
    assert.ok(page1Res.data.totalPages >= 2);

    const page2Res = await api("/api/tasks?page=2&limit=2", {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        "x-organization-id": String(superAdmin.orgId),
      },
    });
    assert.equal(page2Res.status, 200);
    assert.equal(page2Res.data.page, 2);
    assert.equal(page2Res.data.limit, 2);
    assert.equal(page2Res.data.tasks.length, 2);

    // Assert disjoint sets between page 1 and page 2
    const page1Ids = new Set(page1Res.data.tasks.map((t) => t.id));
    for (const t of page2Res.data.tasks) {
      assert.ok(!page1Ids.has(t.id), `Task ${t.id} must not appear on both page 1 and page 2`);
    }
  });

  await t.test("REQ 6 [TASK-206 / Tenant Isolation]: Search and pagination strictly isolate tenant boundaries", async () => {
    // Nova Elena searches for "Alpha Searchable" belonging to Acme Corp
    const resNova = await api("/api/tasks?search=Alpha%20Searchable", {
      headers: {
        Authorization: `Bearer ${novaElena.token}`,
        "x-organization-id": String(novaElena.orgId),
      },
    });
    assert.equal(resNova.status, 200);
    assert.equal(resNova.data.tasks.length, 0, "Foreign tenant search must yield 0 results (strict isolation)");
    assert.equal(resNova.data.total, 0);
  });
});

