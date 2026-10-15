import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("TASK-201 & TASK-202: Project Core CRUD, Keys, Progress & Archival Protection", () => {
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
  let elenaToken;

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
    const elenaUser = await prisma.user.findUnique({ where: { email: "elena@novalabs.io" } });

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    viewerToken = signAccessToken(viewerUser.id);
    elenaToken = signAccessToken(elenaUser.id);
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

  // =========================================================================
  // TASK-202: JIRA-Style Project Keys, Dynamic Progress & Archival Protection
  // =========================================================================

  // REQ 17 [US-PROJ-002 / TG-PROJ-002]: Auto-generation of uppercase project key
  test("REQ 17 [US-PROJ-002 / TG-PROJ-002]: Auto-generates uppercase project key matching ^[A-Z][A-Z0-9_]{1,9}$ from title", async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: `Cyber Security Audit ${Date.now()}`,
        priority: "HIGH",
      }),
    });
    const body = await res.json();
    assert.strictEqual(res.status, 201);
    assert.ok(body.project.key);
    assert.match(body.project.key, /^[A-Z][A-Z0-9_]{1,9}$/);
    assert.strictEqual(body.project.key.startsWith("CSA"), true);
    createdProjectIds.push(body.project.id);
  });

  // REQ 18 [US-PROJ-003 / TG-PROJ-003 / BR-008]: Custom project key creation and format validation
  test("REQ 18 [US-PROJ-003 / TG-PROJ-003 / BR-008]: Accepts valid custom key and rejects malformed keys with HTTP 400", async () => {
    // Valid custom key
    const customKey = `CYBER_${Date.now() % 1000}`;
    const resValid = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: `Custom Key Project ${Date.now()}`,
        key: customKey,
      }),
    });
    const bodyValid = await resValid.json();
    assert.strictEqual(resValid.status, 201);
    assert.strictEqual(bodyValid.project.key, customKey);
    createdProjectIds.push(bodyValid.project.id);

    // Invalid keys: lowercase, starting with number, too long (>10), single char
    const invalidKeys = ["lowercase", "123NUM", "TOOLONGPROJECTKEY", "A"];
    for (const inv of invalidKeys) {
      const resInv = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
          "x-organization-id": String(acmeOrg.id),
        },
        body: JSON.stringify({
          name: `Invalid Key Test ${Date.now()}`,
          key: inv,
        }),
      });
      assert.strictEqual(resInv.status, 400, `Key ${inv} should be rejected with 400`);
    }
  });

  // REQ 19 [US-PROJ-003 / TG-PROJ-003 / BR-008]: Key uniqueness per organization (HTTP 409 Conflict) and multi-tenant isolation
  test("REQ 19 [US-PROJ-003 / TG-PROJ-003 / BR-008]: Enforces key uniqueness within tenant (HTTP 409) while allowing across tenants", async () => {
    const key = `UNIQ_${Date.now() % 10000}`;
    const res1 = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: `Acme Unique 1 ${Date.now()}`,
        key,
      }),
    });
    const body1 = await res1.json();
    assert.strictEqual(res1.status, 201);
    createdProjectIds.push(body1.project.id);

    // Duplicate key in Acme -> 409 Conflict
    const resDup = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: `Acme Duplicate 2 ${Date.now()}`,
        key,
      }),
    });
    assert.strictEqual(resDup.status, 409);
    const bodyDup = await resDup.json();
    assert.strictEqual(bodyDup.code, "PROJECT_KEY_CONFLICT");

    // Same key in Nova Labs -> Succeeded (201 Created)
    const resNova = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${elenaToken}`,
        "x-organization-id": String(novaOrg.id),
      },
      body: JSON.stringify({
        name: `Nova Unique with Same Key ${Date.now()}`,
        key,
      }),
    });
    const bodyNova = await resNova.json();
    assert.strictEqual(resNova.status, 201);
    assert.strictEqual(bodyNova.project.key, key);
    createdProjectIds.push(bodyNova.project.id);
  });

  // REQ 20 [US-PROJ-003 / BR-008]: Key modification permitted when 0 tasks exist, immutable once tasks exist
  test("REQ 20 [US-PROJ-003 / BR-008]: Key can be modified when 0 tasks exist, but rejects update with HTTP 400 once tasks exist", async () => {
    const initialKey = `MUT_${Date.now() % 1000}`;
    const newKey = `NEW_${Date.now() % 1000}`;

    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Immutability Test Project ${Date.now()}`,
        key: initialKey,
      },
    });
    createdProjectIds.push(project.id);

    // 1. 0 tasks exist: Key modification succeeds
    const resUpdate = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ key: newKey }),
    });
    const bodyUpdate = await resUpdate.json();
    assert.strictEqual(resUpdate.status, 200);
    assert.strictEqual(bodyUpdate.project.key, newKey);

    // 2. Add a task to this project
    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        title: "Blocker task for key modification",
        creatorId: managerUser.id,
      },
    });
    createdTaskIds.push(task.id);

    // 3. Attempt key modification now that a task exists -> HTTP 400
    const resBlocked = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ key: `LOCKED_${Date.now() % 100}` }),
    });
    assert.strictEqual(resBlocked.status, 400);
    const bodyBlocked = await resBlocked.json();
    assert.strictEqual(bodyBlocked.code, "KEY_IMMUTABLE_TASKS_EXIST");
  });

  // REQ 21 [US-PROJ-004 / TG-PROJ-003]: Dynamic project progress calculation based on DONE tasks
  test("REQ 21 [US-PROJ-004 / TG-PROJ-003]: Dynamically calculates completion percentage as (DONE tasks / total tasks) * 100", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Progress Ratio Project ${Date.now()}`,
        key: `PRG_${Date.now() % 1000}`,
      },
    });
    createdProjectIds.push(project.id);

    // 0 tasks -> 0%
    const res0 = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const body0 = await res0.json();
    assert.strictEqual(body0.project.progress, 0);

    // Add 4 tasks: 1 DONE, 3 TODO -> 25%
    const t1 = await prisma.task.create({
      data: { organizationId: acmeOrg.id, projectId: project.id, title: "T1", status: "DONE", creatorId: managerUser.id },
    });
    const t2 = await prisma.task.create({
      data: { organizationId: acmeOrg.id, projectId: project.id, title: "T2", status: "TODO", creatorId: managerUser.id },
    });
    const t3 = await prisma.task.create({
      data: { organizationId: acmeOrg.id, projectId: project.id, title: "T3", status: "TODO", creatorId: managerUser.id },
    });
    const t4 = await prisma.task.create({
      data: { organizationId: acmeOrg.id, projectId: project.id, title: "T4", status: "TODO", creatorId: managerUser.id },
    });
    createdTaskIds.push(t1.id, t2.id, t3.id, t4.id);

    const res25 = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const body25 = await res25.json();
    assert.strictEqual(body25.project.progress, 25);

    // Move t2 to DONE (2 DONE out of 4) -> 50%
    await prisma.task.update({ where: { id: t2.id }, data: { status: "DONE" } });

    const res50 = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const body50 = await res50.json();
    assert.strictEqual(body50.project.progress, 50);

    // Move t3 and t4 to DONE (4 DONE out of 4) -> 100%
    await prisma.task.update({ where: { id: t3.id }, data: { status: "DONE" } });
    await prisma.task.update({ where: { id: t4.id }, data: { status: "DONE" } });

    const res100 = await fetch(`${baseUrl}/api/projects/${project.id}`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const body100 = await res100.json();
    assert.strictEqual(body100.project.progress, 100);
  });

  // REQ 22 [US-PROJ-005 / TG-PROJ-005]: Project Archival Lifecycle (/archive & /unarchive) and Audit Logging
  test("REQ 22 [US-PROJ-005 / TG-PROJ-005]: Project archival and unarchival endpoints toggle isArchived state and emit AuditLog", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Archival Flow Project ${Date.now()}`,
        key: `ARC_${Date.now() % 1000}`,
        isArchived: false,
      },
    });
    createdProjectIds.push(project.id);

    // Archive project
    const resArchive = await fetch(`${baseUrl}/api/projects/${project.id}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const bodyArchive = await resArchive.json();
    assert.strictEqual(resArchive.status, 200);
    assert.strictEqual(bodyArchive.project.isArchived, true);
    assert.strictEqual(bodyArchive.project.status, "ARCHIVED");

    // Verify AuditLog for archive
    const auditArchive = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "project:archive",
        resourceId: String(project.id),
      },
    });
    assert.ok(auditArchive, "project:archive audit log must exist");

    // Unarchive project
    const resUnarchive = await fetch(`${baseUrl}/api/projects/${project.id}/unarchive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const bodyUnarchive = await resUnarchive.json();
    assert.strictEqual(resUnarchive.status, 200);
    assert.strictEqual(bodyUnarchive.project.isArchived, false);
    assert.strictEqual(bodyUnarchive.project.status, "ACTIVE");

    // Verify AuditLog for unarchive
    const auditUnarchive = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "project:unarchive",
        resourceId: String(project.id),
      },
    });
    assert.ok(auditUnarchive, "project:unarchive audit log must exist");
  });

  // REQ 23 [US-PROJ-005 / TG-PROJ-005 / BR-009]: Mutation freezing: Rejects task creation in archived project
  test("REQ 23 [US-PROJ-005 / TG-PROJ-005 / BR-009]: Rejects task creation targeting an archived project with HTTP 400", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Frozen Project Create ${Date.now()}`,
        key: `FRZ_${Date.now() % 1000}`,
        isArchived: true,
        status: "ARCHIVED",
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
        title: "Disallowed Task in Archived Container",
        priority: "HIGH",
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, "PROJECT_ARCHIVED");
    assert.strictEqual(body.error, "Cannot create tasks in an archived project");
  });

  // REQ 24 [US-PROJ-005 / TG-PROJ-005 / BR-009]: Mutation freezing: Rejects task updates in archived project
  test("REQ 24 [US-PROJ-005 / TG-PROJ-005 / BR-009]: Rejects task update within an archived project with HTTP 400", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Frozen Project Update ${Date.now()}`,
        key: `UPD_${Date.now() % 1000}`,
        isArchived: false,
      },
    });
    createdProjectIds.push(project.id);

    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        title: "Task to be frozen",
        creatorId: managerUser.id,
      },
    });
    createdTaskIds.push(task.id);

    // Archive project
    await prisma.project.update({
      where: { id: project.id },
      data: { isArchived: true, status: "ARCHIVED" },
    });

    // Attempt to update task
    const res = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        title: "Attempted Title Edit During Archival Freeze",
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, "PROJECT_ARCHIVED");
    assert.strictEqual(body.error, "Cannot modify tasks in an archived project");
  });

  // REQ 25 [US-PROJ-005 / TG-PROJ-005 / BR-009]: Mutation freezing: Rejects task deletion in archived project
  test("REQ 25 [US-PROJ-005 / TG-PROJ-005 / BR-009]: Rejects task deletion within an archived project with HTTP 400", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Frozen Project Delete ${Date.now()}`,
        key: `DEL_${Date.now() % 1000}`,
        isArchived: true,
        status: "ARCHIVED",
      },
    });
    createdProjectIds.push(project.id);

    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        title: "Task in Archived Project",
        creatorId: managerUser.id,
      },
    });
    createdTaskIds.push(task.id);

    const res = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.code, "PROJECT_ARCHIVED");
    assert.strictEqual(body.error, "Cannot delete tasks in an archived project");
  });

  // REQ 26 [US-PROJ-005 / TG-PROJ-005]: Unarchiving restores task mutations
  test("REQ 26 [US-PROJ-005 / TG-PROJ-005]: Unarchiving project restores task mutation capability", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Restorable Archive Project ${Date.now()}`,
        key: `RST_${Date.now() % 1000}`,
        isArchived: true,
        status: "ARCHIVED",
      },
    });
    createdProjectIds.push(project.id);

    // Unarchive
    const resUnarchive = await fetch(`${baseUrl}/api/projects/${project.id}/unarchive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.strictEqual(resUnarchive.status, 200);

    // Task creation now succeeds
    const resCreateTask = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        projectId: project.id,
        title: "Successfully created after unarchive",
      }),
    });
    const bodyCreateTask = await resCreateTask.json();
    assert.strictEqual(resCreateTask.status, 201);
    createdTaskIds.push(bodyCreateTask.task.id);
  });

  // REQ 27 [US-PROJ-002]: Task listing returns project key for JIRA-style key rendering
  test("REQ 27 [US-PROJ-002]: GET /api/tasks returns project.key for JIRA-style key display", async () => {
    const projectKey = `KEY_${Date.now() % 1000}`;
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Keyed Project ${Date.now()}`,
        key: projectKey,
      },
    });
    createdProjectIds.push(project.id);

    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        title: "Keyed Task Test",
        creatorId: managerUser.id,
      },
    });
    createdTaskIds.push(task.id);

    const res = await fetch(`${baseUrl}/api/tasks?projectId=${project.id}`, {
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(body.tasks.length >= 1);
    const targetTask = body.tasks.find((t) => t.id === task.id);
    assert.ok(targetTask);
    assert.strictEqual(targetTask.project.key, projectKey);
  });

  // REQ 28 [US-PROJ-005]: Negative authorization on archive / unarchive
  test("REQ 28 [US-PROJ-005]: Actor lacking project:update receives HTTP 403 when attempting to archive or unarchive", async () => {
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Unauthorized Archive Target ${Date.now()}`,
        key: `UNAUTH_${Date.now() % 100}`,
      },
    });
    createdProjectIds.push(project.id);

    const resArchive = await fetch(`${baseUrl}/api/projects/${project.id}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.strictEqual(resArchive.status, 403);

    const resUnarchive = await fetch(`${baseUrl}/api/projects/${project.id}/unarchive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.strictEqual(resUnarchive.status, 403);
  });
});
