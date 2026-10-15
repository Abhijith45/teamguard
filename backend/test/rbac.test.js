import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import http from "node:http";

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

test("1. Demo Persona Switcher returns valid session for Super Admin", async () => {
  const res = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona: "super-admin", organizationSlug: "acme-corp" },
  });

  assert.equal(res.status, 200);
  assert.equal(res.data.user.email, "admin@teamguard.io");
  assert.ok(res.data.accessToken);
  assert.equal(res.data.activeOrganization.slug, "acme-corp");
});

test("2. Super Admin can access dashboard and projects in Acme Corp", async () => {
  const auth = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona: "super-admin", organizationSlug: "acme-corp" },
  });
  const token = auth.data.accessToken;
  const orgId = auth.data.activeOrganization.id;

  const dashboardRes = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId),
    },
  });
  assert.equal(dashboardRes.status, 200);
  assert.ok(dashboardRes.data.stats.totalProjects >= 1);
  assert.ok(dashboardRes.data.recentProjects.length >= 1);
});

test("3. Stakeholder (Viewer) cannot create projects (Negative Permission Test)", async () => {
  const auth = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona: "stakeholder", organizationSlug: "acme-corp" },
  });
  const token = auth.data.accessToken;
  const orgId = auth.data.activeOrganization.id;

  const createRes = await api("/api/projects", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId),
    },
    body: {
      name: "Unauthorized Project",
      description: "Should fail",
    },
  });

  assert.equal(createRes.status, 403);
  assert.equal(createRes.data.error, "Permission denied");
});

test("4. ABAC Test: Team Member can update own task, but CANNOT update another member's task", async () => {
  // Sarah Wijaya is a Team Member
  const auth = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona: "team-member", organizationSlug: "acme-corp" },
  });
  const token = auth.data.accessToken;
  const orgId = auth.data.activeOrganization.id;
  const sarahId = auth.data.user.id;

  // List tasks in Acme Corp
  const listRes = await api("/api/tasks", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId),
    },
  });
  assert.equal(listRes.status, 200);
  const tasks = listRes.data.tasks;

  const ownTask = tasks.find((t) => t.assigneeId === sarahId);
  const otherTask = tasks.find((t) => t.assigneeId && t.assigneeId !== sarahId);

  assert.ok(ownTask, "Should have a task assigned to Sarah");
  assert.ok(otherTask, "Should have a task assigned to another member");

  // Attempt to update own task -> Must succeed (200)
  const ownUpdateRes = await api(`/api/tasks/${ownTask.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId),
    },
    body: { status: "IN_PROGRESS" },
  });
  assert.equal(ownUpdateRes.status, 200);

  // Attempt to update other member's task -> Must be rejected with 403 (ABAC violation)
  const otherUpdateRes = await api(`/api/tasks/${otherTask.id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId),
    },
    body: { status: "DONE" },
  });
  assert.equal(otherUpdateRes.status, 403);
  assert.equal(otherUpdateRes.data.code, "CANNOT_UPDATE_OTHERS_TASK");
});

test("5. Tenant Isolation: Cannot access an organization without active membership", async () => {
  // Alex Chen (manager@teamguard.io) is only a member in Acme Corp, NOT in Nova Labs
  const auth = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona: "project-manager", organizationSlug: "acme-corp" },
  });
  const token = auth.data.accessToken;

  // Send request with Nova Labs org ID (id: 2)
  const fakeOrgRes = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": "2", // Nova Labs
    },
  });

  assert.equal(fakeOrgRes.status, 403);
  assert.match(fakeOrgRes.data.error, /Access denied/);
});

test("6. Privilege Escalation Guard: Cannot revoke permissions from Super Admin role", async () => {
  const auth = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona: "super-admin", organizationSlug: "acme-corp" },
  });
  const token = auth.data.accessToken;
  const orgId = auth.data.activeOrganization.id;

  // Get matrix to find Super Admin role and a permission ID
  const matrixRes = await api("/api/permissions-matrix", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId),
    },
  });
  assert.equal(matrixRes.status, 200);

  const superAdminRole = matrixRes.data.roles.find((r) => r.name === "Super Admin");
  const firstPerm = matrixRes.data.categories[0].permissions[0];

  // Try to revoke a permission from Super Admin
  const toggleRes = await api("/api/permissions-matrix/toggle", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId),
    },
    body: {
      roleId: superAdminRole.id,
      permissionId: firstPerm.id,
      enabled: false,
    },
  });

  assert.equal(toggleRes.status, 403);
  assert.match(toggleRes.data.error, /Privilege Guard/);
});
