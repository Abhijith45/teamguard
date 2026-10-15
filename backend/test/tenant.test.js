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

test("TASK-001 [REQ 1]: Missing organization header returns HTTP 400 Bad Request", async () => {
  const { token } = await getAuthToken("super-admin", "acme-corp");

  // Send request with Bearer token but completely omitting x-organization-id
  const res = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(res.status, 400, "Expected HTTP 400 when x-organization-id is missing");
  assert.match(res.data.error, /x-organization-id/i, "Error message should mention x-organization-id");
  assert.match(res.data.error, /required/i, "Error message should indicate header is required");
});

test("TASK-001 [REQ 2]: Non-numeric organization header returns HTTP 400 Bad Request", async () => {
  const { token } = await getAuthToken("super-admin", "acme-corp");

  const invalidHeaders = ["abc", "acme-corp", "true", "null", "undefined", "12a"];
  for (const invalidHeader of invalidHeaders) {
    const res = await api("/api/dashboard", {
      headers: {
        authorization: `Bearer ${token}`,
        "x-organization-id": invalidHeader,
      },
    });

    assert.equal(res.status, 400, `Expected HTTP 400 for non-numeric header: '${invalidHeader}'`);
    assert.match(res.data.error, /x-organization-id/i);
  }
});

test("TASK-001 [REQ 3]: Zero, negative, decimal, or malformed ID returns HTTP 400 Bad Request", async () => {
  const { token } = await getAuthToken("super-admin", "acme-corp");

  const malformedHeaders = [
    "0",
    "-1",
    "-42",
    "1.5",
    "3.14159",
    "01",
    "1e3",
    "NaN",
    "",
    "   ",
    "99999999999999999999999999999999", // Unsafe integer overflow
  ];

  for (const malformed of malformedHeaders) {
    const res = await api("/api/dashboard", {
      headers: {
        authorization: `Bearer ${token}`,
        "x-organization-id": malformed,
      },
    });

    assert.equal(res.status, 400, `Expected HTTP 400 for malformed ID: '${malformed}'`);
    assert.match(res.data.error, /x-organization-id/i);
  }
});

test("TASK-001 [REQ 4]: Unknown organization or unjoined organization returns HTTP 403 Forbidden", async () => {
  // Case A: Unknown / non-existent organization ID
  const { token: adminToken } = await getAuthToken("super-admin", "acme-corp");
  const unknownOrgRes = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${adminToken}`,
      "x-organization-id": "999999",
    },
  });
  assert.equal(unknownOrgRes.status, 403, "Expected 403 for non-existent organization ID");
  assert.match(unknownOrgRes.data.error, /Access denied/i);

  // Case B: Known organization where user holds NO membership (Alex Chen is only in Acme Corp, org 1)
  const { token: managerToken } = await getAuthToken("project-manager", "acme-corp");
  const unjoinedOrgRes = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${managerToken}`,
      "x-organization-id": "2", // Nova Labs
    },
  });
  assert.equal(unjoinedOrgRes.status, 403, "Expected 403 when user is not a member of the organization");
  assert.match(unjoinedOrgRes.data.error, /Access denied/i);
});

test("TASK-001 [REQ 5]: Inactive or suspended membership returns HTTP 403 Forbidden", async () => {
  // Find or create a test user with an INACTIVE membership
  const testUserEmail = "suspended-member@teamguard.test";
  let testUser = await prisma.user.findUnique({ where: { email: testUserEmail } });
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        name: "Suspended Test User",
        username: "suspended_user",
        email: testUserEmail,
        passwordHash: "$2a$12$e8qH9vXq1G3Q0Q0Q0Q0Q0u",
      },
    });
  }

  // Ensure an INACTIVE membership in Acme Corp (id: 1)
  const acmeOrg = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });
  assert.ok(acmeOrg, "Acme Corp must exist");

  const membership = await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: testUser.id,
        organizationId: acmeOrg.id,
      },
    },
    update: { status: "INACTIVE" },
    create: {
      userId: testUser.id,
      organizationId: acmeOrg.id,
      status: "INACTIVE",
    },
  });
  assert.equal(membership.status, "INACTIVE");

  // Create token for this test user
  const { signAccessToken } = await import("../src/lib/tokens.js");
  const token = signAccessToken(testUser.id);

  // Attempt to access tenant route with INACTIVE membership
  const res = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(acmeOrg.id),
    },
  });

  assert.equal(res.status, 403, "Expected 403 when membership status is INACTIVE");
  assert.match(res.data.error, /Access denied: you are not an active member of this organization/i);

  // Clean up test membership
  await prisma.membership.delete({
    where: { id: membership.id },
  });
  await prisma.user.delete({
    where: { id: testUser.id },
  });
});

test("TASK-001 [REQ 6]: Active membership with valid header proceeds successfully (HTTP 200)", async () => {
  const { token, orgId } = await getAuthToken("super-admin", "acme-corp");

  const res = await api("/api/dashboard", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId),
    },
  });

  assert.equal(res.status, 200, "Active member with valid header must succeed");
  assert.ok(res.data.stats, "Dashboard data should be returned");
});

test("TASK-001 [REQ 7]: Attempted cross-tenant ID manipulation is rejected", async () => {
  const { token, orgId } = await getAuthToken("super-admin", "acme-corp");

  // Verify that passing a different organizationId in body/query does NOT override server-resolved req.organizationId
  // 1. Pass query parameter ?organizationId=2 to listTasks
  const listRes = await api("/api/tasks?organizationId=2", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId), // Acme Corp (org 1)
    },
  });
  assert.equal(listRes.status, 200);
  // All returned tasks must belong to Org 1 (Acme Corp), not Org 2
  for (const t of listRes.data.tasks) {
    assert.equal(t.organizationId, orgId, "Tasks must belong strictly to Acme Corp");
  }

  // 2. Cross-tenant project isolation:
  // Find a project belonging to Nova Labs (Org 2)
  const novaOrg = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  assert.ok(novaOrg, "Nova Labs org must exist");

  let novaProject = await prisma.project.findFirst({
    where: { organizationId: novaOrg.id },
  });
  if (!novaProject) {
    novaProject = await prisma.project.create({
      data: {
        name: "Nova Secret Project",
        description: "Confidential Nova Labs project",
        organizationId: novaOrg.id,
      },
    });
  }

  // Attempt to fetch Nova Labs project while scoped to Acme Corp header
  const getCrossProjRes = await api(`/api/projects/${novaProject.id}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId), // Org 1
    },
  });
  assert.equal(getCrossProjRes.status, 404, "Cross-tenant project access must return 404 Not Found");

  // Attempt to create a task targeting Nova Labs project while scoped to Acme Corp header
  const createCrossTaskRes = await api("/api/tasks", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(orgId), // Org 1
    },
    body: {
      projectId: novaProject.id,
      title: "Malicious Cross-Tenant Task Injection",
    },
  });
  assert.equal(createCrossTaskRes.status, 404, "Task creation targeting other tenant's project must be rejected with 404");
});

test("TASK-001 [REQ 8]: Existing authorization behavior remains intact", async () => {
  // Stakeholder (Viewer) cannot create projects even with valid tenant header
  const { token: viewerToken, orgId } = await getAuthToken("stakeholder", "acme-corp");

  const projCreateRes = await api("/api/projects", {
    method: "POST",
    headers: {
      authorization: `Bearer ${viewerToken}`,
      "x-organization-id": String(orgId),
    },
    body: {
      name: "Viewer Project Attempt",
      description: "Should fail authorization",
    },
  });

  assert.equal(projCreateRes.status, 403, "Stakeholder must still be denied project:create");
  assert.equal(projCreateRes.data.error, "Permission denied");

  // Super Admin can fetch permissions matrix
  const { token: adminToken } = await getAuthToken("super-admin", "acme-corp");
  const matrixRes = await api("/api/permissions-matrix", {
    headers: {
      authorization: `Bearer ${adminToken}`,
      "x-organization-id": String(orgId),
    },
  });
  assert.equal(matrixRes.status, 200, "Super Admin can still access permissions matrix");
  assert.ok(matrixRes.data.roles.length > 0);
});
