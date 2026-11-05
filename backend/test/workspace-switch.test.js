import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import http from "node:http";
import { prisma } from "../config/prisma.js";

let server;
let baseUrl;
let acmeOrg;
let novaOrg;
let acmeProject;
let novaProject;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  acmeOrg = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });
  novaOrg = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });
  acmeProject = await prisma.project.findFirst({ where: { organizationId: acmeOrg.id } });
  novaProject = await prisma.project.findFirst({ where: { organizationId: novaOrg.id } });
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
  const cookieHeader = res.headers.get("set-cookie");
  return {
    token: res.data.accessToken,
    orgId: res.data.activeOrganization.id,
    user: res.data.user,
    cookie: cookieHeader,
  };
}

test("TASK-003 [REQ 1]: Switching x-organization-id returns distinct projects per workspace", async () => {
  const { token } = await getAuthToken("super-admin", "acme-corp");

  // Query Acme Corp
  const resOrg1 = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(acmeOrg.id),
    },
  });
  assert.equal(resOrg1.status, 200);
  assert.ok(Array.isArray(resOrg1.data.projects));
  const org1ProjectIds = resOrg1.data.projects.map((p) => p.id);
  assert.ok(org1ProjectIds.includes(acmeProject.id), `Acme should include Project ${acmeProject.id}`);
  assert.ok(!org1ProjectIds.includes(novaProject.id), `Acme must NOT contain Nova Project ${novaProject.id}`);

  // Query Nova Labs with same user token
  const resOrg2 = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(novaOrg.id),
    },
  });
  assert.equal(resOrg2.status, 200);
  assert.ok(Array.isArray(resOrg2.data.projects));
  const org2ProjectIds = resOrg2.data.projects.map((p) => p.id);
  assert.ok(org2ProjectIds.includes(novaProject.id), `Nova should include Project ${novaProject.id}`);
  assert.ok(!org2ProjectIds.includes(acmeProject.id), `Nova must NOT contain Acme Project ${acmeProject.id}`);
});

test("TASK-003 [REQ 2]: Context switch resolves distinct permissions per organization", async () => {
  const { token } = await getAuthToken("super-admin", "acme-corp");

  // In Acme Corp, user is Super Admin -> can create project
  const createInOrg1 = await api("/api/projects", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(acmeOrg.id),
    },
    body: {
      name: `Context Switch Test Project ${Date.now()}`,
      description: "Testing Acme Corp Super Admin permission",
      priority: "LOW",
    },
  });
  assert.equal(createInOrg1.status, 201, "Super Admin in Acme Corp should create project successfully");

  // In Nova Labs, user is Stakeholder (read-only) -> project creation must be rejected with 403 Forbidden
  const createInOrg2 = await api("/api/projects", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(novaOrg.id),
    },
    body: {
      name: "Illicit Nova Project",
      description: "Should be forbidden for Stakeholder",
      priority: "HIGH",
    },
  });
  assert.equal(createInOrg2.status, 403, "Stakeholder in Nova Labs must be rejected with 403 Forbidden");
  assert.match(createInOrg2.data.error, /forbidden|permission/i);
});

test("TASK-003 [REQ 3]: Cross-tenant resource retrieval returns HTTP 404 Not Found", async () => {
  const { token } = await getAuthToken("super-admin", "acme-corp");

  // Project belongs strictly to Acme
  // Attempt to access Acme Project while scoped to Nova Labs header
  const crossTenantAccess = await api(`/api/projects/${acmeProject.id}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(novaOrg.id),
    },
  });

  assert.equal(
    crossTenantAccess.status,
    404,
    "Expected HTTP 404 Not Found to prevent tenant resource enumeration"
  );
});

test("TASK-003 [REQ 4]: Multi-tenant task query isolation across workspace switch", async () => {
  const { token } = await getAuthToken("super-admin", "acme-corp");

  // Query tasks for Acme
  const tasksOrg1 = await api("/api/tasks", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(acmeOrg.id),
    },
  });
  assert.equal(tasksOrg1.status, 200);
  for (const t of tasksOrg1.data.tasks || []) {
    assert.equal(t.organizationId, acmeOrg.id, "All returned tasks must belong strictly to Acme Org");
  }

  // Query tasks for Nova Labs
  const tasksOrg2 = await api("/api/tasks", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": String(novaOrg.id),
    },
  });
  assert.equal(tasksOrg2.status, 200);
  for (const t of tasksOrg2.data.tasks || []) {
    assert.equal(t.organizationId, novaOrg.id, "All returned tasks must belong strictly to Nova Org");
  }
});

test("TASK-003 [REQ 5]: Session logout revokes refresh token and clears cookie", async () => {
  const { token, cookie } = await getAuthToken("super-admin", "acme-corp");
  assert.ok(cookie, "Auth session must set a refresh cookie");

  // Extract raw refresh cookie string
  const cookieMatch = cookie.match(/refreshToken=([^;]+)/);
  assert.ok(cookieMatch, "Should have refreshToken cookie");
  const rawCookie = cookieMatch[0];

  // Perform logout
  const logoutRes = await api("/api/auth/logout", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      cookie: rawCookie,
    },
  });
  assert.equal(logoutRes.status, 204, "Logout should return 204 No Content");

  // Verify that the cookie was cleared with an expired date
  const logoutCookieHeader = logoutRes.headers.get("set-cookie");
  assert.ok(logoutCookieHeader, "Logout must return set-cookie header to clear cookie");
  assert.match(logoutCookieHeader, /refreshToken=;.*Expires=Thu, 01 Jan 1970/i);

  // Subsequent token refresh using the revoked cookie must return HTTP 401
  const refreshRes = await api("/api/auth/refresh", {
    method: "POST",
    headers: {
      cookie: rawCookie,
    },
  });
  assert.equal(refreshRes.status, 401, "Refresh with revoked session must fail with HTTP 401");
});
