import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";

describe("TASK-507: Compliance & Velocity Reporting CSV Export (DP-REP-001 / US-REP-001)", () => {
  let server;
  let baseUrl;
  let acmeOrg;
  let novaOrg;
  let activeProject;

  let superAdminUser;
  let managerUser;
  let stakeholderUser;

  let superAdminToken;
  let managerToken;
  let stakeholderToken;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    acmeOrg = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });
    novaOrg = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });

    superAdminUser = await prisma.user.findUnique({ where: { email: "admin@teamguard.io" } });
    managerUser = await prisma.user.findUnique({ where: { email: "manager@teamguard.io" } });
    stakeholderUser = await prisma.user.findUnique({ where: { email: "viewer@teamguard.io" } });

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    stakeholderToken = signAccessToken(stakeholderUser.id);

    activeProject = await prisma.project.findFirst({
      where: { organizationId: acmeOrg.id, deletedAt: null },
    });

    // Ensure test tasks and audit log entries exist for Acme Corp
    const existingTask = await prisma.task.findFirst({
      where: { organizationId: acmeOrg.id },
    });

    if (!existingTask) {
      await prisma.task.create({
        data: {
          organizationId: acmeOrg.id,
          projectId: activeProject.id,
          title: "Initial Velocity Test Task",
          status: "DONE",
          priority: "HIGH",
          creatorId: superAdminUser.id,
          assigneeId: managerUser.id,
          completedAt: new Date(),
        },
      });
    }

    // Write a test audit log in Acme
    await prisma.auditLog.create({
      data: {
        organizationId: acmeOrg.id,
        actorId: superAdminUser.id,
        action: "TASK:CREATE",
        resourceType: "Task",
        resourceId: "1",
        outcome: "SUCCESS",
        details: JSON.stringify({ title: "Seed test task" }),
      },
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function api(path, { method = "GET", headers = {}, body } = {}) {
    const url = `${baseUrl}${path}`;
    const opts = {
      method,
      headers: { ...headers },
    };
    if (body) {
      opts.headers["content-type"] = "application/json";
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const contentType = res.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    return {
      status: res.status,
      headers: res.headers,
      data,
    };
  }

  test("REQ 1 [Negative Auth]: Unauthenticated request to /api/reports/tasks/csv returns HTTP 401 Unauthorized", async () => {
    const res = await api("/api/reports/tasks/csv", {
      headers: { "x-organization-id": String(acmeOrg.id) },
    });
    assert.equal(res.status, 401);
  });

  test("REQ 2 [Tenant Isolation / AC 4]: Missing x-organization-id header returns HTTP 400 Bad Request", async () => {
    const res = await api("/api/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
      },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /x-organization-id/i);
  });

  test("REQ 3 [Tenant Isolation]: Non-member access to organization reports returns HTTP 403 Forbidden", async () => {
    // Nova Labs org ID accessed with user who is not a member of Nova
    const nonMemberUser = await prisma.user.create({
      data: {
        name: "Non Member",
        username: `nonmember_${Date.now()}`,
        email: `nonmember_${Date.now()}@teamguard.io`,
        passwordHash: "hash123",
      },
    });
    const nonMemberToken = signAccessToken(nonMemberUser.id);

    const res = await api("/api/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${nonMemberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 403);

    await prisma.user.delete({ where: { id: nonMemberUser.id } });
  });

  test("REQ 4 [Negative RBAC / AC 2]: Stakeholder (Viewer) cannot export task velocity CSV (HTTP 403 Forbidden)", async () => {
    const res = await api("/api/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${stakeholderToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 403);
    assert.equal(res.data.error, "Permission denied");
  });

  test("REQ 5 [Negative RBAC / AC 2]: Stakeholder (Viewer) cannot export audit compliance CSV (HTTP 403 Forbidden)", async () => {
    const res = await api("/api/reports/audit/csv", {
      headers: {
        authorization: `Bearer ${stakeholderToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 403);
    assert.equal(res.data.error, "Permission denied");
  });

  test("REQ 6 [Positive RBAC / AC 1]: Organization Admin can stream task velocity CSV with HTTP 200", async () => {
    const res = await api("/api/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/csv/);
    assert.match(res.headers.get("content-disposition"), /attachment; filename="teamguard-velocity-/);
    assert.ok(typeof res.data === "string");
  });

  test("REQ 7 [CSV Schema & Escaping]: Velocity CSV contains valid RFC 4180 headers and prevents injection", async () => {
    // Create a task with special characters and potential formula injection prefix
    const maliciousTask = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: activeProject.id,
        title: "=1+1 Formula Task, with comma and \"quotes\"",
        status: "DONE",
        priority: "MEDIUM",
        creatorId: superAdminUser.id,
        assigneeId: managerUser.id,
        completedAt: new Date(),
      },
    });

    const res = await api("/api/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    const csvContent = res.data;
    const lines = csvContent.split("\r\n");

    // Header validation
    const headerLine = lines[0];
    assert.ok(headerLine.includes("Task ID"));
    assert.ok(headerLine.includes("Task Key"));
    assert.ok(headerLine.includes("Title"));
    assert.ok(headerLine.includes("Status"));
    assert.ok(headerLine.includes("Priority"));
    assert.ok(headerLine.includes("Project Name"));
    assert.ok(headerLine.includes("Lead Time (Days)"));

    // Verify formula escaping (starts with '= was escaped to "'=...")
    assert.ok(csvContent.includes(`"'=1+1 Formula Task, with comma and ""quotes"""`));

    // Cleanup
    await prisma.task.delete({ where: { id: maliciousTask.id } });
  });

  test("REQ 8 [Positive RBAC / AC 1]: Project Manager can stream task velocity CSV", async () => {
    const res = await api("/api/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/csv/);
  });

  test("REQ 9 [Positive RBAC / AC 1]: Organization Admin can stream audit compliance CSV with HTTP 200", async () => {
    const res = await api("/api/reports/audit/csv", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/csv/);
    assert.match(res.headers.get("content-disposition"), /attachment; filename="teamguard-compliance-audit-/);

    const lines = res.data.split("\r\n");
    const headerLine = lines[0];
    assert.ok(headerLine.includes("Audit Log ID"));
    assert.ok(headerLine.includes("Timestamp"));
    assert.ok(headerLine.includes("Actor Name"));
    assert.ok(headerLine.includes("Action"));
    assert.ok(headerLine.includes("Resource Type"));
  });

  test("REQ 10 [Audit Trail Integrity / AC 3]: Report export records immutable AuditLog with action report:export", async () => {
    const preCount = await prisma.auditLog.count({
      where: {
        organizationId: acmeOrg.id,
        action: "report:export",
      },
    });

    const res = await api("/api/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 200);

    const postLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "report:export",
        actorId: superAdminUser.id,
      },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(postLog, "Must write an audit log entry on report export");
    assert.equal(postLog.action, "report:export");
    assert.equal(postLog.resourceType, "Report");
    assert.equal(postLog.resourceId, "tasks_velocity");
    assert.equal(postLog.outcome, "SUCCESS");
    assert.ok(postLog.details.includes("tasks_velocity"));
  });

  test("REQ 11 [Tenant Boundary]: Acme Corp report never leaks Nova Labs tasks", async () => {
    // 1. Create a task in Nova Labs with distinct title
    const novaProject = await prisma.project.findFirst({
      where: { organizationId: novaOrg.id, deletedAt: null },
    });

    const novaTask = await prisma.task.create({
      data: {
        organizationId: novaOrg.id,
        projectId: novaProject.id,
        title: "CONFIDENTIAL_NOVA_TASK_SECRET_987",
        status: "TODO",
        priority: "URGENT",
        creatorId: superAdminUser.id,
      },
    });

    // 2. Fetch Acme Corp velocity CSV
    const acmeRes = await api("/api/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(acmeRes.status, 200);
    assert.ok(
      !acmeRes.data.includes("CONFIDENTIAL_NOVA_TASK_SECRET_987"),
      "Acme Corp report must NEVER contain Nova Labs tasks"
    );

    // Cleanup
    await prisma.task.delete({ where: { id: novaTask.id } });
  });

  test("REQ 12 [Dual Route Aliasing]: /api/v1/reports/tasks/csv responds with valid CSV", async () => {
    const res = await api("/api/v1/reports/tasks/csv", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/csv/);
  });

  test("REQ 13 [JSON Summary Overview]: GET /api/reports/summary returns accurate aggregated metrics", async () => {
    const res = await api("/api/reports/summary", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.summary);
    assert.equal(typeof res.data.summary.totalTasks, "number");
    assert.equal(typeof res.data.summary.completedTasks, "number");
    assert.equal(typeof res.data.summary.completionRate, "number");
    assert.equal(typeof res.data.summary.avgLeadTimeDays, "number");
    assert.equal(typeof res.data.summary.totalAuditLogs, "number");
  });
});
