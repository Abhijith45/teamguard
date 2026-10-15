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

test("TASK-303: Task Activity Stream & Centralized Audit Trail", async (t) => {
  const adminAcme = await getAuthSession("super-admin", "acme-corp");
  const memberAcme = await getAuthSession("team-member", "acme-corp");
  const pmAcme = await getAuthSession("project-manager", "acme-corp");
  const adminNova = await getAuthSession("super-admin", "nova-labs");

  // Helper to fetch a fresh project in Acme Corp
  const project = await prisma.project.findFirst({
    where: { organizationId: adminAcme.orgId, isArchived: false, deletedAt: null },
  });
  assert.ok(project, "Active project must exist in Acme Corp");

  // Create a dedicated task for activity verification
  const taskRes = await api("/api/tasks", {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminAcme.token}`,
      "x-organization-id": String(adminAcme.orgId),
    },
    body: {
      projectId: project.id,
      title: "Activity Stream Audit Target",
      description: "Verifying timeline propagation",
      status: "TODO",
      priority: "MEDIUM",
    },
  });
  assert.equal(taskRes.status, 201);
  const targetTask = taskRes.data.task;

  await t.test(
    "REQ 1 [US-ACT-001 / Security]: Unauthenticated request to /api/tasks/:id/activity returns HTTP 401",
    async () => {
      const res = await api(`/api/tasks/${targetTask.id}/activity`, {
        headers: { "x-organization-id": String(adminAcme.orgId) },
      });
      assert.equal(res.status, 401);
    }
  );

  await t.test(
    "REQ 2 [US-ACT-001 / Validation]: Invalid non-numeric or zero task ID returns HTTP 400 Bad Request",
    async () => {
      const res = await api("/api/tasks/not-a-number/activity", {
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error, /Invalid task ID/i);
    }
  );

  await t.test(
    "REQ 3 [US-ACT-001 / Error Handling]: Non-existent task returns HTTP 404 Not Found",
    async () => {
      const res = await api("/api/tasks/999999/activity", {
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 404);
      assert.match(res.data.error, /Task not found/i);
    }
  );

  await t.test(
    "REQ 4 [US-TENANT-005 / IDOR Defense]: Cross-tenant task activity request returns HTTP 404 Not Found",
    async () => {
      // Nova Labs admin attempting to read Acme Corp task activity
      const res = await api(`/api/tasks/${targetTask.id}/activity`, {
        headers: {
          authorization: `Bearer ${adminNova.token}`,
          "x-organization-id": String(adminNova.orgId),
        },
      });
      assert.equal(res.status, 404);
      assert.match(res.data.error, /Task not found/i);
    }
  );

  await t.test(
    "REQ 5 [US-ACT-001 / TG-ACT-001]: Retrieve initial task activity containing creation event",
    async () => {
      const res = await api(`/api/tasks/${targetTask.id}/activity`, {
        headers: {
          authorization: `Bearer ${memberAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.taskId, targetTask.id);
      assert.ok(Array.isArray(res.data.data));
      assert.ok(res.data.total >= 1);

      const creationEvent = res.data.data.find((e) => e.action === "task:create");
      assert.ok(creationEvent, "Must contain task:create event");
      assert.equal(creationEvent.resourceType, "Task");
      assert.equal(creationEvent.actor.id, adminAcme.user.id);
      assert.ok(creationEvent.summary.includes("created"));
      assert.equal(creationEvent.category, "creation");
    }
  );

  await t.test(
    "REQ 6 [US-ACT-001 / Event Correlation]: Task mutations (status & priority) record formatted activity entries",
    async () => {
      // Update status to IN_PROGRESS and priority to HIGH
      const updateRes = await api(`/api/tasks/${targetTask.id}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${pmAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
        body: {
          status: "IN_PROGRESS",
          priority: "HIGH",
        },
      });
      assert.equal(updateRes.status, 200);

      const actRes = await api(`/api/tasks/${targetTask.id}/activity`, {
        headers: {
          authorization: `Bearer ${memberAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(actRes.status, 200);

      const updateEvent = actRes.data.data.find((e) => e.action === "task:update");
      assert.ok(updateEvent, "Must record task:update event");
      assert.equal(updateEvent.actor.id, pmAcme.user.id);
      assert.ok(
        updateEvent.summary.includes("IN_PROGRESS") || updateEvent.summary.includes("status"),
        `Expected status in summary: ${updateEvent.summary}`
      );
      assert.equal(updateEvent.category, "update");
    }
  );

  await t.test(
    "REQ 7 [US-ACT-001 / Subtask Correlation]: Subtask lifecycle events appear in parent task activity stream",
    async () => {
      // 1. Create a subtask
      const subRes = await api(`/api/tasks/${targetTask.id}/subtasks`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${pmAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
        body: { title: "Draft security report" },
      });
      assert.equal(subRes.status, 201);
      const subtask = subRes.data.subtask || subRes.data;

      // 2. Toggle completion
      const patchSubRes = await api(`/api/tasks/${targetTask.id}/subtasks/${subtask.id}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${pmAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
        body: { isCompleted: true },
      });
      assert.equal(patchSubRes.status, 200);

      // Verify activity feed includes both subtask events
      const actRes = await api(`/api/tasks/${targetTask.id}/activity`, {
        headers: {
          authorization: `Bearer ${memberAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(actRes.status, 200);

      const createSubEvent = actRes.data.data.find((e) => e.action.toLowerCase() === "subtask:create");
      assert.ok(createSubEvent, "Must record subtask:create event");
      assert.ok(createSubEvent.summary.includes("Draft security report"));
      assert.equal(createSubEvent.category, "checklist");

      const updateSubEvent = actRes.data.data.find((e) => e.action.toLowerCase() === "subtask:update");
      assert.ok(updateSubEvent, "Must record subtask:update event");
      assert.equal(updateSubEvent.category, "checklist");
    }
  );

  await t.test(
    "REQ 8 [US-ACT-001 / Comment Correlation]: Comment events appear in parent task activity stream",
    async () => {
      const commentRes = await api(`/api/tasks/${targetTask.id}/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${memberAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
        body: { content: "Timeline verification note" },
      });
      assert.equal(commentRes.status, 201);

      const actRes = await api(`/api/tasks/${targetTask.id}/activity`, {
        headers: {
          authorization: `Bearer ${memberAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(actRes.status, 200);

      const commentEvent = actRes.data.data.find(
        (e) => e.action === "comment:create" || e.action === "COMMENT_CREATE"
      );
      assert.ok(commentEvent, "Must record comment:create event");
      assert.equal(commentEvent.actor.id, memberAcme.user.id);
      assert.equal(commentEvent.category, "comment");
    }
  );

  await t.test(
    "REQ 9 [US-AUDIT-001 / Negative RBAC]: Non-admin actor lacking audit:read cannot access /api/audit",
    async () => {
      const res = await api("/api/audit", {
        headers: {
          authorization: `Bearer ${memberAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 403);
      assert.equal(res.data.requiredPermission, "audit:read");
    }
  );

  await t.test(
    "REQ 10 [US-AUDIT-001 / TG-AUD-001]: Super Admin can query paginated organization audit logs",
    async () => {
      const res = await api("/api/audit?page=1&limit=10", {
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      assert.ok(res.data.pagination);
      assert.equal(res.data.pagination.page, 1);
      assert.equal(res.data.pagination.limit, 10);
      assert.ok(res.data.pagination.total >= 1);

      // Verify each log contains actor attribution and sanitized details
      for (const log of res.data.data) {
        assert.equal(log.organizationId, adminAcme.orgId);
        assert.ok(log.action);
        assert.ok(log.createdAt);
        assert.ok(log.actor);
      }
    }
  );

  await t.test(
    "REQ 11 [US-AUDIT-001 / Filtering]: Filter audit logs by action and resourceType",
    async () => {
      const res = await api("/api/audit?action=task:update&resourceType=Task", {
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));

      for (const log of res.data.data) {
        assert.equal(log.action, "task:update");
        assert.equal(log.resourceType, "Task");
      }
    }
  );

  await t.test(
    "REQ 12 [US-AUDIT-001 / Filtering]: Search audit logs by keyword",
    async () => {
      const res = await api("/api/audit?search=security", {
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      // Must return filtered logs without crashing
    }
  );

  await t.test(
    "REQ 13 [US-AUDIT-001 / Dropdown Controls]: GET /api/audit/actions returns distinct action list",
    async () => {
      const res = await api("/api/audit/actions", {
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.actions));
      assert.ok(res.data.actions.includes("task:create"));
    }
  );

  await t.test(
    "REQ 14 [US-AUDIT-001 / Compliance Metrics]: GET /api/audit/stats returns aggregate activity metrics",
    async () => {
      const res = await api("/api/audit/stats", {
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(res.status, 200);
      assert.ok(typeof res.data.totalEvents === "number");
      assert.ok(typeof res.data.todayEvents === "number");
      assert.ok(typeof res.data.last7DaysEvents === "number");
      assert.ok(typeof res.data.uniqueActionTypes === "number");
      assert.ok(res.data.totalEvents >= 1);
    }
  );

  await t.test(
    "REQ 15 [US-TENANT-005 / Data Boundary]: Audit logs strictly isolate tenant boundaries",
    async () => {
      // Acme Corp logs
      const acmeLogsRes = await api("/api/audit?limit=50", {
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
      });
      assert.equal(acmeLogsRes.status, 200);

      // Nova Labs logs
      const novaLogsRes = await api("/api/audit?limit=50", {
        headers: {
          authorization: `Bearer ${adminNova.token}`,
          "x-organization-id": String(adminNova.orgId),
        },
      });
      assert.equal(novaLogsRes.status, 200);

      // Ensure zero overlap in log IDs between organizations
      const acmeIds = new Set(acmeLogsRes.data.data.map((l) => l.id));
      for (const novaLog of novaLogsRes.data.data) {
        assert.ok(
          !acmeIds.has(novaLog.id),
          `Tenant leakage detected: Nova Labs log ${novaLog.id} found in Acme Corp`
        );
        assert.equal(novaLog.organizationId, adminNova.orgId);
      }
    }
  );
});
