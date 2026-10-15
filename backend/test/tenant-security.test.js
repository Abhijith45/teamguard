import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

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

test.beforeEach(async () => {
  await resetAuthRateLimiter("127.0.0.1");
});

test.afterEach(async () => {
  await resetAuthRateLimiter("127.0.0.1");
});

async function api(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "content-type": "application/json",
    ...options.headers,
  };
  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
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
  assert.equal(res.status, 200, `Should switch to demo persona ${persona} in ${organizationSlug}`);
  return {
    token: res.data.accessToken,
    orgId: res.data.activeOrganization.id,
    user: res.data.user,
  };
}

// =========================================================================
// Category A: Strict Tenant Header & Header Tampering Invariants (RCG-1)
// =========================================================================

test("VECTOR-01 [RCG-1 / US-TENANT-001]: Missing x-organization-id header returns HTTP 400 Bad Request", async () => {
  const { token } = await getAuthSession("super-admin", "acme-corp");
  const res = await api("/api/projects", {
    headers: { authorization: `Bearer ${token}` }, // missing x-organization-id
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.error, "x-organization-id header is required");
});

test("VECTOR-02 [RCG-1 / US-TENANT-001]: Non-numeric string tenant header returns HTTP 400 Bad Request", async () => {
  const { token } = await getAuthSession("super-admin", "acme-corp");
  const res = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": "malicious_string_injection",
    },
  });
  assert.equal(res.status, 400);
  assert.ok(res.data.error.includes("must be a positive integer"));
});

test("VECTOR-03 [RCG-1 / US-TENANT-001]: Negative integer tenant header returns HTTP 400 Bad Request", async () => {
  const { token } = await getAuthSession("super-admin", "acme-corp");
  const res = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": "-5",
    },
  });
  assert.equal(res.status, 400);
  assert.ok(res.data.error.includes("must be a positive integer"));
});

test("VECTOR-04 [RCG-1 / US-TENANT-001]: Zero integer tenant header returns HTTP 400 Bad Request", async () => {
  const { token } = await getAuthSession("super-admin", "acme-corp");
  const res = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": "0",
    },
  });
  assert.equal(res.status, 400);
  assert.ok(res.data.error.includes("must be a positive integer"));
});

test("VECTOR-05 [RCG-1 / US-TENANT-001]: Decimal / float tenant header returns HTTP 400 Bad Request", async () => {
  const { token } = await getAuthSession("super-admin", "acme-corp");
  const res = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": "1.25",
    },
  });
  assert.equal(res.status, 400);
  assert.ok(res.data.error.includes("must be a positive integer"));
});

test("VECTOR-06 [RCG-1 / US-TENANT-001]: Non-existent organization ID returns HTTP 403 Forbidden", async () => {
  const { token } = await getAuthSession("super-admin", "acme-corp");
  const res = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": "9999999",
    },
  });
  assert.equal(res.status, 403);
  assert.ok(res.data.error.includes("Access denied"));
});

test("VECTOR-07 [RCG-1 / US-TENANT-005]: Unjoined organization ID returns HTTP 403 Forbidden", async () => {
  // Member Alex is in Acme Corp, but NOT a member of Nova Labs
  const { token } = await getAuthSession("team-member", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  assert.ok(nova, "Nova Labs org must exist");

  const res = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(nova.id),
    },
  });
  assert.equal(res.status, 403, "Caller without membership in target org must receive 403");
  assert.ok(res.data.error.includes("Access denied"));
});

test("VECTOR-08 [RCG-1 / US-TENANT-001]: Inactive or suspended membership returns HTTP 403 Forbidden", async () => {
  const { token, user, orgId } = await getAuthSession("team-member", "acme-corp");

  // Temporarily suspend membership in DB
  await prisma.membership.updateMany({
    where: { userId: user.id, organizationId: orgId },
    data: { status: "SUSPENDED" },
  });

  try {
    const res = await api("/api/projects", {
      headers: {
        authorization: `Bearer ${token}`,
        "x-organization-id": String(orgId),
      },
    });
    assert.equal(res.status, 403, "Suspended member must receive 403 Forbidden");
    assert.ok(res.data.error.includes("Access denied"));
  } finally {
    // Restore membership status
    await prisma.membership.updateMany({
      where: { userId: user.id, organizationId: orgId },
      data: { status: "ACTIVE" },
    });
  }
});

// =========================================================================
// Category B: Cross-Tenant Resource Access & Concealment Invariants (RCG-1)
// =========================================================================

test("VECTOR-09 [RCG-1 / US-TENANT-005]: Cross-tenant task retrieval by ID returns HTTP 404 Not Found", async () => {
  const acmeAdmin = await getAuthSession("super-admin", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  const novaTask = await prisma.task.findFirst({ where: { organizationId: nova.id } });
  assert.ok(novaTask, "Nova task must exist");

  // Acme Admin attempts to read Nova Labs task using Acme tenant header
  const res = await api(`/api/tasks/${novaTask.id}`, {
    headers: {
      authorization: `Bearer ${acmeAdmin.token}`,
      "x-organization-id": String(acmeAdmin.orgId),
    },
  });

  assert.equal(res.status, 404, "Cross-tenant task lookup must return 404 Not Found to conceal existence");
});

test("VECTOR-10 [RCG-1 / US-TENANT-005]: Cross-tenant task update mutation returns HTTP 404 Not Found", async () => {
  const acmeAdmin = await getAuthSession("super-admin", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  const novaTask = await prisma.task.findFirst({ where: { organizationId: nova.id } });

  const res = await api(`/api/tasks/${novaTask.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${acmeAdmin.token}`,
      "x-organization-id": String(acmeAdmin.orgId),
    },
    body: { title: "Attempted Cross-Tenant Hijack" },
  });

  assert.equal(res.status, 404, "Cross-tenant task update must return 404 Not Found");
});

test("VECTOR-11 [RCG-1 / US-TENANT-005]: Cross-tenant task deletion returns HTTP 404 Not Found", async () => {
  const acmeAdmin = await getAuthSession("super-admin", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  const novaTask = await prisma.task.findFirst({ where: { organizationId: nova.id } });

  const res = await api(`/api/tasks/${novaTask.id}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${acmeAdmin.token}`,
      "x-organization-id": String(acmeAdmin.orgId),
    },
  });

  assert.equal(res.status, 404, "Cross-tenant task deletion must return 404 Not Found");
});

test("VECTOR-12 [RCG-1 / US-TENANT-005]: Cross-tenant project retrieval returns HTTP 404 Not Found", async () => {
  const acmeAdmin = await getAuthSession("super-admin", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  const novaProject = await prisma.project.findFirst({ where: { organizationId: nova.id } });
  assert.ok(novaProject, "Nova project must exist");

  const res = await api(`/api/projects/${novaProject.id}`, {
    headers: {
      authorization: `Bearer ${acmeAdmin.token}`,
      "x-organization-id": String(acmeAdmin.orgId),
    },
  });

  assert.equal(res.status, 404, "Cross-tenant project lookup must return 404 Not Found");
});

test("VECTOR-13 [RCG-1 / US-TENANT-005]: Cross-tenant project mutation returns HTTP 404 Not Found", async () => {
  const acmeAdmin = await getAuthSession("super-admin", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  const novaProject = await prisma.project.findFirst({ where: { organizationId: nova.id } });

  const res = await api(`/api/projects/${novaProject.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${acmeAdmin.token}`,
      "x-organization-id": String(acmeAdmin.orgId),
    },
    body: { name: "Hijacked Project Name" },
  });

  assert.equal(res.status, 404, "Cross-tenant project update must return 404 Not Found");
});

test("VECTOR-14 [RCG-1 / US-TENANT-005]: Cross-tenant project deletion returns HTTP 404 Not Found", async () => {
  const acmeAdmin = await getAuthSession("super-admin", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  const novaProject = await prisma.project.findFirst({ where: { organizationId: nova.id } });

  const res = await api(`/api/projects/${novaProject.id}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${acmeAdmin.token}`,
      "x-organization-id": String(acmeAdmin.orgId),
    },
  });

  assert.equal(res.status, 404, "Cross-tenant project deletion must return 404 Not Found");
});

test("VECTOR-15 [RCG-1 / US-TENANT-005]: Cross-tenant task creation linking foreign project ID returns HTTP 404 Not Found", async () => {
  const acmeAdmin = await getAuthSession("super-admin", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  const novaProject = await prisma.project.findFirst({ where: { organizationId: nova.id } });

  const res = await api("/api/tasks", {
    method: "POST",
    headers: {
      authorization: `Bearer ${acmeAdmin.token}`,
      "x-organization-id": String(acmeAdmin.orgId),
    },
    body: {
      projectId: novaProject.id, // foreign project ID from Nova Labs
      title: "Task with Foreign Project ID",
      status: "TODO",
      priority: "MEDIUM",
    },
  });

  assert.equal(res.status, 404, "Creating task in foreign project must return 404");
  assert.ok(res.data.error.includes("Project not found in this organization"));
});

test("VECTOR-16 [RCG-1 / US-TENANT-005]: Cross-tenant file deletion returns HTTP 404 Not Found", async () => {
  const acmeAdmin = await getAuthSession("super-admin", "acme-corp");
  const nova = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  const novaFile = await prisma.fileAsset.findFirst({ where: { organizationId: nova.id } });
  assert.ok(novaFile, "Nova file must exist");

  const res = await api(`/api/files/${novaFile.id}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${acmeAdmin.token}`,
      "x-organization-id": String(acmeAdmin.orgId),
    },
  });

  assert.equal(res.status, 404, "Cross-tenant file deletion must return 404 Not Found");
});

// =========================================================================
// Category C: Server-Authoritative RBAC, ABAC & Escalation Guards (RCG-2, RCG-4)
// =========================================================================

test("VECTOR-17 [RCG-2 / TG-RBAC-001]: Stakeholder (Viewer) cannot create projects (Negative RBAC)", async () => {
  const viewer = await getAuthSession("stakeholder", "acme-corp");

  const res = await api("/api/projects", {
    method: "POST",
    headers: {
      authorization: `Bearer ${viewer.token}`,
      "x-organization-id": String(viewer.orgId),
    },
    body: {
      name: "Unauthorized Viewer Project",
      description: "Should be blocked by requirePermission",
    },
  });

  assert.equal(res.status, 403, "Viewer must be blocked from project creation");
  assert.equal(res.data.error, "Permission denied");
  assert.equal(res.data.requiredPermission, "project:create");
});

test("VECTOR-18 [RCG-2 / TG-RBAC-001]: Stakeholder (Viewer) cannot create tasks (Negative RBAC)", async () => {
  const viewer = await getAuthSession("stakeholder", "acme-corp");
  const project = await prisma.project.findFirst({ where: { organizationId: viewer.orgId } });

  const res = await api("/api/tasks", {
    method: "POST",
    headers: {
      authorization: `Bearer ${viewer.token}`,
      "x-organization-id": String(viewer.orgId),
    },
    body: {
      projectId: project.id,
      title: "Unauthorized Viewer Task",
    },
  });

  assert.equal(res.status, 403, "Viewer must be blocked from task creation");
  assert.equal(res.data.error, "Permission denied");
  assert.equal(res.data.requiredPermission, "task:create");
});

test("VECTOR-19 [RCG-2 / TG-ABAC-002]: Team Member cannot update tasks assigned to another member (Negative ABAC)", async () => {
  const member = await getAuthSession("team-member", "acme-corp");

  // Find a task in Acme where assigneeId != member.user.id and creatorId != member.user.id
  const unassignedTask = await prisma.task.findFirst({
    where: {
      organizationId: member.orgId,
      assigneeId: { not: member.user.id },
      creatorId: { not: member.user.id },
    },
  });
  assert.ok(unassignedTask, "Unassigned task must exist");

  const res = await api(`/api/tasks/${unassignedTask.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${member.token}`,
      "x-organization-id": String(member.orgId),
    },
    body: { title: "Attempted Unauthorized Title Mutation" },
  });

  assert.equal(res.status, 403, "Team member cannot modify other members' tasks");
  assert.equal(res.data.code, "CANNOT_UPDATE_OTHERS_TASK");
});

test("VECTOR-20 [RCG-2 / TASK-002]: Non-admin cannot modify protected task governance fields", async () => {
  const member = await getAuthSession("team-member", "acme-corp");

  // Find a task owned by this member
  const ownTask = await prisma.task.findFirst({
    where: {
      organizationId: member.orgId,
      assigneeId: member.user.id,
    },
  });
  assert.ok(ownTask, "Own task must exist");

  // Attempt to reassign assigneeId
  const res = await api(`/api/tasks/${ownTask.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${member.token}`,
      "x-organization-id": String(member.orgId),
    },
    body: { assigneeId: 9999 },
  });

  assert.equal(res.status, 403, "Modifying assigneeId must return 403 Forbidden");
  assert.equal(res.data.code, "PROTECTED_FIELD_MUTATION");
});

test("VECTOR-21 [RCG-4 / TG-RBAC-004]: Cannot revoke permissions from Super Admin role (Lockout Guard)", async () => {
  const admin = await getAuthSession("super-admin", "acme-corp");
  const superAdminRole = await prisma.role.findFirst({
    where: { organizationId: admin.orgId, name: "Super Admin" },
  });
  const projectPerm = await prisma.permission.findFirst({
    where: { resource: "project", action: "create" },
  });
  assert.ok(superAdminRole && projectPerm);

  // Attempt to toggle off project:create permission for Super Admin
  const res = await api("/api/permissions-matrix/toggle", {
    method: "POST",
    headers: {
      authorization: `Bearer ${admin.token}`,
      "x-organization-id": String(admin.orgId),
    },
    body: {
      roleId: superAdminRole.id,
      permissionId: projectPerm.id,
      enabled: false,
    },
  });

  assert.equal(res.status, 403, "Super Admin permissions must be immutable");
  assert.ok(res.data.error.includes("Cannot revoke permissions from Super Admin"));
});

// =========================================================================
// Category D: Authentication, Bearer Tampering & Injection Resistance (RCG-5)
// =========================================================================

test("VECTOR-22 [RCG-5 / TG-AUTH-002]: Unauthenticated request to protected API returns HTTP 401 Unauthorized", async () => {
  const acme = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });

  const res = await api("/api/projects", {
    headers: { "x-organization-id": String(acme.id) }, // No Authorization header
  });

  assert.equal(res.status, 401);
});

test("VECTOR-23 [RCG-5 / TG-AUTH-002]: Tampered / Invalid signature JWT Bearer token returns HTTP 401 Unauthorized", async () => {
  const acme = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });

  const res = await api("/api/projects", {
    headers: {
      authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature",
      "x-organization-id": String(acme.id),
    },
  });

  assert.equal(res.status, 401);
});

test("VECTOR-24 [RCG-5 / TG-AUTH-002]: Prototype pollution payload attempts return HTTP 403 Forbidden", async () => {
  const member = await getAuthSession("team-member", "acme-corp");
  const ownTask = await prisma.task.findFirst({
    where: { organizationId: member.orgId, assigneeId: member.user.id },
  });

  const res = await api(`/api/tasks/${ownTask.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${member.token}`,
      "x-organization-id": String(member.orgId),
    },
    body: {
      title: "Valid Title",
      __proto__: { isAdmin: true },
      constructor: { prototype: { isSuperUser: true } },
    },
  });

  assert.equal(res.status, 403, "Prototype pollution keys must be blocked");
  assert.equal(res.data.code, "PROTOTYPE_POLLUTION_DETECTED");
  assert.equal(Object.prototype.isAdmin, undefined, "Global prototype must not be polluted");
});

test("VECTOR-25 [US-DEV-001]: Multi-tenant seed idempotency verifies reproducible fixture generation", async () => {
  // Query organizations, projects, and users to confirm multi-tenant fixtures exist
  const acmeOrg = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });
  const novaOrg = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });

  assert.ok(acmeOrg, "Acme Corp fixture must exist");
  assert.ok(novaOrg, "Nova Labs fixture must exist");

  const acmeProjects = await prisma.project.count({ where: { organizationId: acmeOrg.id } });
  const novaProjects = await prisma.project.count({ where: { organizationId: novaOrg.id } });

  assert.ok(acmeProjects >= 4, "Acme Corp must have at least 4 projects");
  assert.ok(novaProjects >= 2, "Nova Labs must have at least 2 projects");

  const acmeTasks = await prisma.task.count({ where: { organizationId: acmeOrg.id } });
  const novaTasks = await prisma.task.count({ where: { organizationId: novaOrg.id } });

  assert.ok(acmeTasks >= 10, "Acme Corp must have at least 10 tasks");
  assert.ok(novaTasks >= 2, "Nova Labs must have at least 2 tasks");
});
