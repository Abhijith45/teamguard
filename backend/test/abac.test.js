import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import http from "node:http";
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

async function getAuthToken(persona = "super-admin", organizationSlug = "acme-corp") {
  const res = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona, organizationSlug },
  });
  assert.equal(res.status, 200, "Should authenticate demo persona");
  return {
    token: res.data.accessToken,
    orgId: res.data.activeOrganization.id,
    user: res.data.user,
  };
}

// Helper to create or find a task assigned to team-member
async function getTestTaskForMember(orgId, memberId) {
  let project = await prisma.project.findFirst({
    where: { organizationId: orgId },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        organizationId: orgId,
        name: "ABAC Test Project",
        description: "Project for testing ABAC rules",
      },
    });
  }

  let task = await prisma.task.findFirst({
    where: {
      organizationId: orgId,
      assigneeId: memberId,
      creatorId: memberId,
    },
  });

  if (!task) {
    task = await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        title: "Test Member Owned Task",
        description: "Assigned to team member for testing",
        status: "TODO",
        priority: "MEDIUM",
        assigneeId: memberId,
        creatorId: memberId,
      },
    });
  }

  return { task, project };
}

test("TASK-002 [REQ 1]: Non-admin (team-member) attempting to modify assigneeId returns HTTP 403 Forbidden", async () => {
  const { token: memberToken, orgId, user: memberUser } = await getAuthToken("team-member", "acme-corp");
  const { task } = await getTestTaskForMember(orgId, memberUser.id);

  // Attempt to reassign task to someone else
  const res = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      assigneeId: 999,
    },
  });

  assert.equal(res.status, 403, "Must return 403 when team-member attempts to mutate assigneeId");
  assert.equal(res.data.code, "PROTECTED_FIELD_MUTATION");
  assert.equal(res.data.field, "assigneeId");
  assert.match(res.data.error, /modifying assignee requires task:assign permission/i);
});

test("TASK-002 [REQ 2]: Non-admin (team-member) attempting to modify projectId returns HTTP 403 Forbidden", async () => {
  const { token: memberToken, orgId, user: memberUser } = await getAuthToken("team-member", "acme-corp");
  const { task } = await getTestTaskForMember(orgId, memberUser.id);

  // Attempt to move task to another project
  const res = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      projectId: 999,
    },
  });

  assert.equal(res.status, 403, "Must return 403 when team-member attempts to mutate projectId");
  assert.equal(res.data.code, "PROTECTED_FIELD_MUTATION");
  assert.equal(res.data.field, "projectId");
  assert.match(res.data.error, /projectId requires project management permissions/i);
});

test("TASK-002 [REQ 3]: Non-admin (team-member) attempting to modify creatorId returns HTTP 403 Forbidden", async () => {
  const { token: memberToken, orgId, user: memberUser } = await getAuthToken("team-member", "acme-corp");
  const { task } = await getTestTaskForMember(orgId, memberUser.id);

  // Attempt to change creator
  const res = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      creatorId: 1,
    },
  });

  assert.equal(res.status, 403, "Must return 403 when attempting to mutate creatorId");
  assert.equal(res.data.code, "PROTECTED_FIELD_MUTATION");
  assert.equal(res.data.field, "creatorId");
  assert.match(res.data.error, /creatorId is immutable/i);
});

test("TASK-002 [REQ 4]: Alternate payload casing (snake_case, PascalCase) returns HTTP 403 Forbidden", async () => {
  const { token: memberToken, orgId, user: memberUser } = await getAuthToken("team-member", "acme-corp");
  const { task } = await getTestTaskForMember(orgId, memberUser.id);

  // 1. assignee_id
  const res1 = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: { assignee_id: 123 },
  });
  assert.equal(res1.status, 403, "assignee_id must trigger 403");
  assert.equal(res1.data.code, "PROTECTED_FIELD_MUTATION");

  // 2. project_id
  const res2 = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: { project_id: 123 },
  });
  assert.equal(res2.status, 403, "project_id must trigger 403");
  assert.equal(res2.data.code, "PROTECTED_FIELD_MUTATION");

  // 3. creator_id
  const res3 = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: { creator_id: 123 },
  });
  assert.equal(res3.status, 403, "creator_id must trigger 403");
  assert.equal(res3.data.code, "PROTECTED_FIELD_MUTATION");

  // 4. PascalCase ProjectId
  const res4 = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: { ProjectId: 123 },
  });
  assert.equal(res4.status, 403, "ProjectId must trigger 403");
  assert.equal(res4.data.code, "PROTECTED_FIELD_MUTATION");
});

test("TASK-002 [REQ 5]: Prototype pollution payload attempts return HTTP 403 Forbidden", async () => {
  const { token: memberToken, orgId, user: memberUser } = await getAuthToken("team-member", "acme-corp");
  const { task } = await getTestTaskForMember(orgId, memberUser.id);

  // 1. __proto__ in JSON body
  const res1 = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: '{"__proto__": {"isAdmin": true}, "title": "Hacked"}',
  });
  assert.equal(res1.status, 403, "__proto__ must trigger 403");
  assert.equal(res1.data.code, "PROTOTYPE_POLLUTION_DETECTED");

  // 2. constructor in JSON body
  const res2 = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: '{"constructor": {"role": "admin"}}',
  });
  assert.equal(res2.status, 403, "constructor key must trigger 403");
  assert.equal(res2.data.code, "PROTOTYPE_POLLUTION_DETECTED");
});

test("TASK-002 [REQ 6]: Query parameter injection of protected fields returns HTTP 403 Forbidden", async () => {
  const { token: memberToken, orgId, user: memberUser } = await getAuthToken("team-member", "acme-corp");
  const { task } = await getTestTaskForMember(orgId, memberUser.id);

  // Attempt query injection: ?assigneeId=99
  const res1 = await api(`/api/tasks/${task.id}?assigneeId=99`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      status: "IN_PROGRESS",
    },
  });
  assert.equal(res1.status, 403, "Query parameter injection ?assigneeId=99 must trigger 403");
  assert.equal(res1.data.code, "PROTECTED_FIELD_MUTATION");

  // Attempt query injection: ?project_id=88
  const res2 = await api(`/api/tasks/${task.id}?project_id=88`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      status: "IN_PROGRESS",
    },
  });
  assert.equal(res2.status, 403, "Query parameter injection ?project_id=88 must trigger 403");
  assert.equal(res2.data.code, "PROTECTED_FIELD_MUTATION");
});

test("TASK-002 [REQ 7]: Legitimate task update under task:update:own succeeds (HTTP 200)", async () => {
  const { token: memberToken, orgId, user: memberUser } = await getAuthToken("team-member", "acme-corp");
  const { task } = await getTestTaskForMember(orgId, memberUser.id);

  // Legitimate update of title, description, status, priority
  const res = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      title: "Legitimate Title Update",
      description: "Updated description by member under task:update:own",
      status: "IN_PROGRESS",
      priority: "HIGH",
    },
  });

  assert.equal(res.status, 200, "Permitted fields update should return 200");
  assert.equal(res.data.task.title, "Legitimate Title Update");
  assert.equal(res.data.task.status, "IN_PROGRESS");
  assert.equal(res.data.task.priority, "HIGH");
});

test("TASK-002 [REQ 8]: Authorized actor (Super Admin) can update assignee and project", async () => {
  const { token: adminToken, orgId } = await getAuthToken("super-admin", "acme-corp");

  // Get project manager user to assign to
  const managerUser = await prisma.user.findUnique({
    where: { email: "manager@teamguard.io" },
  });
  assert.ok(managerUser);

  const { task, project } = await getTestTaskForMember(orgId, managerUser.id);

  // Super Admin re-assigns task
  const res = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      assigneeId: managerUser.id,
      title: "Admin Reassigned Task",
    },
  });

  assert.equal(res.status, 200, "Super admin with task:assign can update assignee");
  assert.equal(res.data.task.assigneeId, managerUser.id);

  // Super Admin invalid assignee (not member) returns 400
  const invalidAssigneeRes = await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      assigneeId: 999999, // non-existent user
    },
  });
  assert.equal(invalidAssigneeRes.status, 400, "Assigning to non-member must return 400");
  assert.match(invalidAssigneeRes.data.error, /must be an active member/i);
});
