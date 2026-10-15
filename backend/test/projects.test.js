import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("TASK-201: Project Core CRUD, Tenant Scoping & Soft Deletion Lifecycle", () => {
  let server;
  let baseUrl;
  let acmeOrg;
  let novaOrg;

  let superAdminUser;
  let managerUser;
  let memberUser;
  let viewerUser;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let viewerToken;

  const createdProjectIds = [];
  const createdTaskIds = [];

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    acmeOrg = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });
    novaOrg = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });

    superAdminUser = await prisma.user.findUnique({ where: { email: "admin@teamguard.io" } });
    managerUser = await prisma.user.findUnique({ where: { email: "manager@teamguard.io" } });
    memberUser = await prisma.user.findUnique({ where: { email: "member@teamguard.io" } });
    viewerUser = await prisma.user.findUnique({ where: { email: "viewer@teamguard.io" } });

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    viewerToken = signAccessToken(viewerUser.id);
  });

  after(async () => {
    // Clean up created tasks and projects
    for (const tId of createdTaskIds) {
      await prisma.task.delete({ where: { id: tId } }).catch(() => {});
    }
    for (const pId of createdProjectIds) {
      await prisma.task.deleteMany({ where: { projectId: pId } }).catch(() => {});
      await prisma.project.delete({ where: { id: pId } }).catch(() => {});
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetAuthRateLimiter();
  });

  // =========================================================================
  // REQ 1: Project Creation with initial tasks
  // =========================================================================
  test("REQ 1 [US-PROJ-001]: Project Manager / Admin can create a project with priority and initial tasks", async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: `Alpha Migration ${Date.now()}`,
        description: "Cloud infrastructure modernization deliverable",
        priority: "HIGH",
        status: "ACTIVE",
        initialTasks: [
          { title: "Audit security groups", priority: "HIGH", status: "TODO" },
          { title: "Provision VPC subnets", priority: "MEDIUM", status: "TODO" },
        ],
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 201);
    assert.ok(body.project);
    assert.ok(body.project.id);
    assert.strictEqual(body.project.organizationId, acmeOrg.id);
    assert.strictEqual(body.project.priority, "HIGH");
    assert.strictEqual(body.project.progress, 0);
    assert.strictEqual(body.project.deletedAt, null);
    assert.strictEqual(body.project.tasks.length, 2);

    createdProjectIds.push(body.project.id);
    for (const t of body.project.tasks) {
      createdTaskIds.push(t.id);
    }
  });

  // =========================================================================
  // REQ 2: Payload Validation on Project Creation
  // =========================================================================
  test("REQ 2 [US-PROJ-001]: Validation failure on malformed payload returns HTTP 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: "A", // too short (< 2 chars)
        priority: "INVALID_PRIORITY",
      }),
    });

    assert.strictEqual(res.status, 400);
  });

  // =========================================================================
  // REQ 3: Negative RBAC - Stakeholder cannot create projects
  // =========================================================================
  test("REQ 3 [US-PROJ-001]: Stakeholder lacking project:create cannot create projects (HTTP 403 Forbidden)", async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: "Unauthorized Project Attempt",
        priority: "LOW",
      }),
    });

    assert.strictEqual(res.status, 403);
  });

  // =========================================================================
  // REQ 4: Tenant-Scoped Listing
  // =========================================================================
  test("REQ 4 [US-PROJ-001]: Project listing (GET /api/projects) returns projects strictly scoped to active tenant", async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(body.projects));
    for (const p of body.projects) {
      assert.strictEqual(p.organizationId, acmeOrg.id);
      assert.strictEqual(p.deletedAt, null);
    }
  });

  // =========================================================================
  // REQ 5: Cross-Tenant Isolation (IDOR Defense)
  // =========================================================================
  test("REQ 5 [US-PROJ-001]: Cross-tenant project retrieval, update, or deletion returns HTTP 404 Not Found", async () => {
    // Nova Labs has an existing project
    const novaProject = await prisma.project.findFirst({
      where: { organizationId: novaOrg.id, deletedAt: null },
    });
    assert.ok(novaProject, "Nova Labs fixture project must exist");

    // Attempt retrieval from Acme Corp
    const resGet = await fetch(`${baseUrl}/api/projects/${novaProject.id}`, {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.strictEqual(resGet.status, 404);

    // Attempt update from Acme Corp
    const resUpdate = await fetch(`${baseUrl}/api/projects/${novaProject.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ name: "Cross Tenant Attack Name" }),
    });
    assert.strictEqual(resUpdate.status, 404);

    // Attempt deletion from Acme Corp
    const resDelete = await fetch(`${baseUrl}/api/projects/${novaProject.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.strictEqual(resDelete.status, 404);
  });

  // =========================================================================
  // REQ 6: Project Update with project:update
  // =========================================================================
  test("REQ 6 [US-PROJ-001]: Authorized actor can update project attributes (HTTP 200 OK)", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Updatable Project ${Date.now()}`,
        priority: "LOW",
        progress: 0,
      },
    });
    createdProjectIds.push(project.id);

    const updatedName = `Renamed Deliverable ${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: updatedName,
        priority: "HIGH",
        progress: 50,
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.project.name, updatedName);
    assert.strictEqual(body.project.priority, "HIGH");
    assert.strictEqual(body.project.progress, 50);
  });

  // =========================================================================
  // REQ 7: Negative Authorization on Project Update
  // =========================================================================
  test("REQ 7 [US-PROJ-001]: Actor lacking project:update cannot update projects (HTTP 403 Forbidden)", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Immutable for Viewer ${Date.now()}`,
      },
    });
    createdProjectIds.push(project.id);

    const res = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ name: "Hacked by Viewer" }),
    });

    assert.strictEqual(res.status, 403);
  });

  // =========================================================================
  // REQ 8: Soft-Deletion Sets deletedAt
  // =========================================================================
  test("REQ 8 [US-PROJ-004]: Soft-deleting a project sets deletedAt timestamp and returns HTTP 204", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Soft Deletable Project ${Date.now()}`,
      },
    });
    createdProjectIds.push(project.id);

    const res = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.strictEqual(res.status, 204);

    // Verify DB row still exists with deletedAt set
    const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
    assert.ok(dbProject, "Project record must remain in database");
    assert.ok(dbProject.deletedAt instanceof Date, "deletedAt must be set to Date");
  });

  // =========================================================================
  // REQ 9: Soft-Deleted Project Excluded from Standard Listing
  // =========================================================================
  test("REQ 9 [US-PROJ-004]: Soft-deleted project is excluded from standard GET /api/projects", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Hidden Deleted Project ${Date.now()}`,
        deletedAt: new Date(),
      },
    });
    createdProjectIds.push(project.id);

    // Default listing
    const resDefault = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const bodyDefault = await resDefault.json();
    const foundDefault = bodyDefault.projects.some((p) => p.id === project.id);
    assert.strictEqual(foundDefault, false, "Soft-deleted project must be excluded from default list");

    // With includeDeleted=true
    const resAll = await fetch(`${baseUrl}/api/projects?includeDeleted=true`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const bodyAll = await resAll.json();
    const foundAll = bodyAll.projects.some((p) => p.id === project.id);
    assert.strictEqual(foundAll, true, "Soft-deleted project must be included when includeDeleted=true");
  });

  // =========================================================================
  // REQ 10: Direct Retrieval of Soft-Deleted Project Returns 404
  // =========================================================================
  test("REQ 10 [US-PROJ-004]: Direct retrieval (GET /api/projects/:id) of soft-deleted project returns HTTP 404", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Direct Read Soft-Deleted ${Date.now()}`,
        deletedAt: new Date(),
      },
    });
    createdProjectIds.push(project.id);

    const res = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.strictEqual(res.status, 404);
  });

  // =========================================================================
  // REQ 11: Updating Soft-Deleted Project Returns 404
  // =========================================================================
  test("REQ 11 [US-PROJ-004]: Attempting to update a soft-deleted project returns HTTP 404 Not Found", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Cannot Update Deleted ${Date.now()}`,
        deletedAt: new Date(),
      },
    });
    createdProjectIds.push(project.id);

    const res = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ name: "Attempted resurrection update" }),
    });

    assert.strictEqual(res.status, 404);
  });

  // =========================================================================
  // REQ 12: Cascade Task Scoping - Tasks of Soft-Deleted Project Excluded
  // =========================================================================
  test("REQ 12 [US-PROJ-004]: Tasks belonging to a soft-deleted project are excluded from GET /api/tasks", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Project with Cascaded Tasks ${Date.now()}`,
      },
    });
    createdProjectIds.push(project.id);

    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        title: `Task in Cascaded Project ${Date.now()}`,
        creatorId: managerUser.id,
      },
    });
    createdTaskIds.push(task.id);

    // Prior to project deletion, task appears in listing
    const resBefore = await fetch(`${baseUrl}/api/tasks`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const bodyBefore = await resBefore.json();
    assert.ok(bodyBefore.tasks.some((t) => t.id === task.id), "Task must be present when project is active");

    // Soft-delete project
    await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    // After project deletion, task must be excluded from listing
    const resAfter = await fetch(`${baseUrl}/api/tasks`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const bodyAfter = await resAfter.json();
    assert.strictEqual(
      bodyAfter.tasks.some((t) => t.id === task.id),
      false,
      "Task must be excluded from GET /api/tasks once parent project is soft-deleted"
    );
  });

  // =========================================================================
  // REQ 13: Creating Task on Soft-Deleted Project Returns 404
  // =========================================================================
  test("REQ 13 [US-PROJ-004]: Attempting to create a task in a soft-deleted project returns HTTP 404 Not Found", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Dead Project for Task Creation ${Date.now()}`,
        deletedAt: new Date(),
      },
    });
    createdProjectIds.push(project.id);

    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        projectId: project.id,
        title: "Task in Dead Project",
      }),
    });

    assert.strictEqual(res.status, 404);
  });

  // =========================================================================
  // REQ 14: Restoring a Soft-Deleted Project
  // =========================================================================
  test("REQ 14 [US-PROJ-004]: Restoring a soft-deleted project restores project and its tasks to active listings", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Restorable Project ${Date.now()}`,
        deletedAt: new Date(),
      },
    });
    createdProjectIds.push(project.id);

    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        title: `Task in Restorable Project ${Date.now()}`,
        creatorId: managerUser.id,
      },
    });
    createdTaskIds.push(task.id);

    // Restore project
    const resRestore = await fetch(`${baseUrl}/api/projects/${project.id}/restore`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    const bodyRestore = await resRestore.json();
    assert.strictEqual(resRestore.status, 200);
    assert.strictEqual(bodyRestore.project.deletedAt, null);

    // Verify project appears in standard project list
    const resProjList = await fetch(`${baseUrl}/api/projects`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const bodyProjList = await resProjList.json();
    assert.ok(bodyProjList.projects.some((p) => p.id === project.id));

    // Verify task appears in task list
    const resTaskList = await fetch(`${baseUrl}/api/tasks`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const bodyTaskList = await resTaskList.json();
    assert.ok(bodyTaskList.tasks.some((t) => t.id === task.id));
  });

  // =========================================================================
  // REQ 15: Negative Authorization on Project Deletion
  // =========================================================================
  test("REQ 15 [US-PROJ-001]: Actor lacking project:delete cannot delete a project (HTTP 403 Forbidden)", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Protected from Viewer Delete ${Date.now()}`,
      },
    });
    createdProjectIds.push(project.id);

    const res = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.strictEqual(res.status, 403);
  });

  // =========================================================================
  // REQ 16: Audit Logging on Project Lifecycle
  // =========================================================================
  test("REQ 16 [US-PROJ-001]: Project operations emit structured AuditLog events", async () => {
    const projectName = `Audited Project ${Date.now()}`;
    const resCreate = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ name: projectName }),
    });
    const bodyCreate = await resCreate.json();
    createdProjectIds.push(bodyCreate.project.id);

    const auditCreate = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "project:create",
        resourceId: String(bodyCreate.project.id),
      },
    });
    assert.ok(auditCreate, "project:create audit log must exist");

    // Soft delete
    await fetch(`${baseUrl}/api/projects/${bodyCreate.project.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    const auditDelete = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "project:delete",
        resourceId: String(bodyCreate.project.id),
      },
    });
    assert.ok(auditDelete, "project:delete audit log must exist");
  });
});
