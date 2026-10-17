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

test("TASK-401 [US-CMD-001 / Security]: Multi-Entity Search Tenant Isolation & Auth Barriers", async (t) => {
  await t.test("1. Unauthenticated request to /api/search returns HTTP 401 Unauthorized", async () => {
    const res = await api("/api/search?q=test");
    assert.equal(res.status, 401);
  });

  await t.test("2. Authenticated request without x-organization-id header returns HTTP 400 Bad Request", async () => {
    const session = await getAuthSession("super-admin");
    const res = await api("/api/search?q=test", {
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    assert.equal(res.status, 400);
  });

  await t.test("3. Accessing with non-member organization ID returns HTTP 403 Forbidden", async () => {
    const session = await getAuthSession("super-admin");
    const res = await api("/api/search?q=test", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": "999999",
      },
    });
    assert.equal(res.status, 403);
  });

  await t.test("4. Cross-tenant isolation: Searching from Org 1 never leaks Org 2 resources", async () => {
    const acmeSession = await getAuthSession("super-admin", "acme-corp");
    const novaSession = await getAuthSession("super-admin", "nova-labs");

    // Dynamically fetch a valid project in Nova Labs
    const novaProjectsRes = await api("/api/projects", {
      headers: {
        authorization: `Bearer ${novaSession.token}`,
        "x-organization-id": String(novaSession.orgId),
      },
    });
    assert.equal(novaProjectsRes.status, 200);
    assert.ok(novaProjectsRes.data.projects.length >= 1, "Nova Labs must have at least one project");
    const novaProjectId = novaProjectsRes.data.projects[0].id;

    // Create a uniquely identifiable task in Nova Labs (Org 2)
    const novaTaskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${novaSession.token}`,
        "x-organization-id": String(novaSession.orgId),
      },
      body: {
        projectId: novaProjectId,
        title: "UniqueNovaSecretResearchXYZ",
        description: "Confidential R&D data for Nova Labs only",
        priority: "HIGH",
        status: "TODO",
      },
    });
    assert.equal(novaTaskRes.status, 201);

    // Search for that unique term from Acme Corp (Org 1)
    const acmeSearchRes = await api("/api/search?q=UniqueNovaSecretResearchXYZ", {
      headers: {
        authorization: `Bearer ${acmeSession.token}`,
        "x-organization-id": String(acmeSession.orgId),
      },
    });
    assert.equal(acmeSearchRes.status, 200);
    assert.equal(acmeSearchRes.data.total, 0, "Org 1 search MUST NOT return Org 2 resources");
    assert.equal(acmeSearchRes.data.results.tasks.length, 0);

    // Verify it is found when searched from Nova Labs (Org 2)
    const novaSearchRes = await api("/api/search?q=UniqueNovaSecretResearchXYZ", {
      headers: {
        authorization: `Bearer ${novaSession.token}`,
        "x-organization-id": String(novaSession.orgId),
      },
    });
    assert.equal(novaSearchRes.status, 200);
    assert.ok(novaSearchRes.data.total >= 1);
    assert.ok(novaSearchRes.data.results.tasks.some((t) => t.title === "UniqueNovaSecretResearchXYZ"));
  });
});

test("TASK-401 [US-CMD-001 & US-CMD-002]: Multi-Entity Search Query Capabilities", async (t) => {
  const session = await getAuthSession("super-admin", "acme-corp");

  await t.test("1. Empty or whitespace query returns clean empty result structure", async () => {
    const res = await api("/api/search?q=", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.total, 0);
    assert.deepEqual(res.data.results.projects, []);
    assert.deepEqual(res.data.results.tasks, []);
    assert.deepEqual(res.data.results.members, []);
    assert.deepEqual(res.data.results.files, []);
  });

  await t.test("2. Search matches projects by name or key", async () => {
    const projRes = await api("/api/projects", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });
    assert.equal(projRes.status, 200);
    assert.ok(projRes.data.projects.length >= 1, "Acme Corp should have at least 1 project");
    const targetProject = projRes.data.projects[0];
    const searchTerm = targetProject.name.slice(0, 4);

    const res = await api(`/api/search?q=${encodeURIComponent(searchTerm)}`, {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.results.projects.length >= 1, "Should find matched project");
    const proj = res.data.results.projects[0];
    assert.ok(
      proj.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      proj.key?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  await t.test("3. Search matches tasks by title or numeric ID", async () => {
    // 3a. By title keyword
    const titleRes = await api("/api/search?q=Audit", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });
    assert.equal(titleRes.status, 200);
    assert.ok(titleRes.data.results.tasks.length >= 1);

    const firstTask = titleRes.data.results.tasks[0];
    assert.ok(firstTask.id);
    assert.ok(firstTask.title);

    // 3b. By numeric ID match (e.g. "TASK-1" or "1")
    const idRes = await api(`/api/search?q=TASK-${firstTask.id}`, {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });
    assert.equal(idRes.status, 200);
    assert.ok(idRes.data.results.tasks.some((t) => t.id === firstTask.id));
  });

  await t.test("4. Search matches members by name, email, or username with role metadata", async () => {
    const res = await api("/api/search?q=Admin", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.results.members.length >= 1);
    const member = res.data.results.members[0];
    assert.ok(member.name);
    assert.ok(member.email);
    assert.ok(Array.isArray(member.roles));
    assert.ok(member.primaryRole);
  });

  await t.test("5. Respects limit parameter for result slicing", async () => {
    const res = await api("/api/search?q=a&limit=2", {
      headers: {
        authorization: `Bearer ${session.token}`,
        "x-organization-id": String(session.orgId),
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.results.projects.length <= 2);
    assert.ok(res.data.results.tasks.length <= 2);
    assert.ok(res.data.results.members.length <= 2);
  });
});
