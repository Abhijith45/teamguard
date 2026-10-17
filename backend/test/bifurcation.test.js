import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";

describe("TASK-506: Task Creator vs Assignee Permission Bifurcation (DP-TASK-001 / US-ABAC-004)", () => {
  let server;
  let baseUrl;
  let acmeOrg;
  let novaOrg;
  let activeProject;

  let superAdminUser;
  let creatorOnlyUser;
  let assigneeOnlyUser;
  let defaultMemberUser;
  let stakeholderUser;

  let superAdminToken;
  let creatorOnlyToken;
  let assigneeOnlyToken;
  let defaultMemberToken;
  let stakeholderToken;

  let creatorOnlyRole;
  let assigneeOnlyRole;

  let createdTaskIds = [];

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    acmeOrg = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });
    novaOrg = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });

    superAdminUser = await prisma.user.findUnique({ where: { email: "admin@teamguard.io" } });
    defaultMemberUser = await prisma.user.findUnique({ where: { email: "member@teamguard.io" } });
    stakeholderUser = await prisma.user.findUnique({ where: { email: "viewer@teamguard.io" } });

    superAdminToken = signAccessToken(superAdminUser.id);
    defaultMemberToken = signAccessToken(defaultMemberUser.id);
    stakeholderToken = signAccessToken(stakeholderUser.id);

    activeProject = await prisma.project.findFirst({
      where: { organizationId: acmeOrg.id, deletedAt: null },
    });

    // 1. Create or fetch CreatorOnlyUser
    creatorOnlyUser = await prisma.user.upsert({
      where: { email: "creator.only@teamguard.io" },
      update: {},
      create: {
        name: "Creator Only Actor",
        username: "creator_only",
        email: "creator.only@teamguard.io",
        passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
        isActive: true,
      },
    });
    creatorOnlyToken = signAccessToken(creatorOnlyUser.id);

    // 2. Create or fetch AssigneeOnlyUser
    assigneeOnlyUser = await prisma.user.upsert({
      where: { email: "assignee.only@teamguard.io" },
      update: {},
      create: {
        name: "Assignee Only Actor",
        username: "assignee_only",
        email: "assignee.only@teamguard.io",
        passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
        isActive: true,
      },
    });
    assigneeOnlyToken = signAccessToken(assigneeOnlyUser.id);

    // 3. Ensure permissions exist in database
    const taskViewPerm = await prisma.permission.upsert({
      where: { resource_action: { resource: "task", action: "view" } },
      update: {},
      create: { resource: "task", action: "view", description: "View tasks" },
    });

    const taskCreatePerm = await prisma.permission.upsert({
      where: { resource_action: { resource: "task", action: "create" } },
      update: {},
      create: { resource: "task", action: "create", description: "Create tasks" },
    });

    const taskUpdateOwnPerm = await prisma.permission.upsert({
      where: { resource_action: { resource: "task", action: "update:own" } },
      update: { description: "Update tasks created by you" },
      create: { resource: "task", action: "update:own", description: "Update tasks created by you" },
    });

    const taskUpdateAssignedPerm = await prisma.permission.upsert({
      where: { resource_action: { resource: "task", action: "update:assigned" } },
      update: { description: "Update tasks assigned to you" },
      create: { resource: "task", action: "update:assigned", description: "Update tasks assigned to you" },
    });

    // 4. Create custom role: "Creator Role" (holds strictly task:update:own, NOT task:update:assigned)
    creatorOnlyRole = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: acmeOrg.id, name: "Task Author (Creator)" } },
      update: {},
      create: {
        organizationId: acmeOrg.id,
        name: "Task Author (Creator)",
        slug: "task-author-creator",
        description: "Can create tasks and update author-owned tasks",
        isSystem: false,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: creatorOnlyRole.id } });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: creatorOnlyRole.id, permissionId: taskViewPerm.id },
        { roleId: creatorOnlyRole.id, permissionId: taskCreatePerm.id },
        { roleId: creatorOnlyRole.id, permissionId: taskUpdateOwnPerm.id },
      ],
    });

    // 5. Create custom role: "Assignee Role" (holds strictly task:update:assigned, NOT task:update:own)
    assigneeOnlyRole = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: acmeOrg.id, name: "Task Executor (Assignee)" } },
      update: {},
      create: {
        organizationId: acmeOrg.id,
        name: "Task Executor (Assignee)",
        slug: "task-executor-assignee",
        description: "Can update status and checklist on assigned tasks",
        isSystem: false,
      },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: assigneeOnlyRole.id } });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: assigneeOnlyRole.id, permissionId: taskViewPerm.id },
        { roleId: assigneeOnlyRole.id, permissionId: taskUpdateAssignedPerm.id },
      ],
    });

    // 6. Ensure memberships
    const creatorMembership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: creatorOnlyUser.id, organizationId: acmeOrg.id } },
      update: { status: "ACTIVE" },
      create: { userId: creatorOnlyUser.id, organizationId: acmeOrg.id, status: "ACTIVE" },
    });
    await prisma.membershipRole.deleteMany({ where: { membershipId: creatorMembership.id } });
    await prisma.membershipRole.create({
      data: { membershipId: creatorMembership.id, roleId: creatorOnlyRole.id },
    });

    const assigneeMembership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: assigneeOnlyUser.id, organizationId: acmeOrg.id } },
      update: { status: "ACTIVE" },
      create: { userId: assigneeOnlyUser.id, organizationId: acmeOrg.id, status: "ACTIVE" },
    });
    await prisma.membershipRole.deleteMany({ where: { membershipId: assigneeMembership.id } });
    await prisma.membershipRole.create({
      data: { membershipId: assigneeMembership.id, roleId: assigneeOnlyRole.id },
    });

    // Ensure Team Member role has both task:update:own and task:update:assigned
    const teamMemberRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, name: "Team Member" },
    });
    if (teamMemberRole) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: teamMemberRole.id, permissionId: taskUpdateAssignedPerm.id } },
        update: {},
        create: { roleId: teamMemberRole.id, permissionId: taskUpdateAssignedPerm.id },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: teamMemberRole.id, permissionId: taskUpdateOwnPerm.id } },
        update: {},
        create: { roleId: teamMemberRole.id, permissionId: taskUpdateOwnPerm.id },
      });
    }
  });

  after(async () => {
    if (createdTaskIds.length > 0) {
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (creatorOnlyRole?.id) {
      await prisma.rolePermission.deleteMany({ where: { roleId: creatorOnlyRole.id } });
      await prisma.membershipRole.deleteMany({ where: { roleId: creatorOnlyRole.id } });
      await prisma.role.delete({ where: { id: creatorOnlyRole.id } }).catch(() => {});
    }
    if (assigneeOnlyRole?.id) {
      await prisma.rolePermission.deleteMany({ where: { roleId: assigneeOnlyRole.id } });
      await prisma.membershipRole.deleteMany({ where: { roleId: assigneeOnlyRole.id } });
      await prisma.role.delete({ where: { id: assigneeOnlyRole.id } }).catch(() => {});
    }
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

  test("REQ 1 [US-ABAC-004 AC 1]: User holding strictly task:update:own can update tasks they created (HTTP 200)", async () => {
    // Creator creates a task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creatorOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Author Created Task",
        description: "Initial description by author",
        priority: "MEDIUM",
        assigneeId: assigneeOnlyUser.id,
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Creator updates title, description, status, priority
    const updateRes = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${creatorOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        title: "Author Revised Title",
        description: "Author revised description",
        status: "IN_PROGRESS",
        priority: "HIGH",
      },
    });

    assert.equal(updateRes.status, 200, "Creator must be allowed to update task they created");
    assert.equal(updateRes.data.task.title, "Author Revised Title");
    assert.equal(updateRes.data.task.status, "IN_PROGRESS");
    assert.equal(updateRes.data.task.priority, "HIGH");
  });

  test("REQ 2 [US-ABAC-004 AC 2]: User holding strictly task:update:own is rejected when attempting to update a task where they are only assignee (HTTP 403)", async () => {
    // Super Admin creates a task assigned to CreatorOnlyUser
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Admin Task Assigned To Author",
        description: "Admin is creator",
        assigneeId: creatorOnlyUser.id,
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // CreatorOnlyUser attempts to update status on task they do NOT own/created
    const updateRes = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${creatorOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "IN_PROGRESS",
      },
    });

    assert.equal(updateRes.status, 403, "Assignee lacking task:update:assigned must be rejected with 403");
    assert.equal(updateRes.data.error, "Access denied: task creator permission required");
    assert.equal(updateRes.data.code, "CREATOR_PERMISSION_REQUIRED");
  });

  test("REQ 3 [US-ABAC-004 AC 3]: User holding strictly task:update:assigned can update status and description on task assigned to them (HTTP 200)", async () => {
    // Creator creates a task assigned to AssigneeOnlyUser
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creatorOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Task For Execution",
        description: "Execute task",
        assigneeId: assigneeOnlyUser.id,
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Assignee updates status to IN_PROGRESS and adds progress notes in description
    const updateRes = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${assigneeOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "IN_PROGRESS",
        description: "Execution in progress with notes",
        priority: "HIGH",
      },
    });

    assert.equal(updateRes.status, 200, "Assignee must be allowed to update execution fields");
    assert.equal(updateRes.data.task.status, "IN_PROGRESS");
    assert.equal(updateRes.data.task.description, "Execution in progress with notes");
    assert.equal(updateRes.data.task.priority, "HIGH");
  });

  test("REQ 4 [US-ABAC-004 AC 4]: User holding strictly task:update:assigned is rejected when attempting to alter task title (HTTP 403)", async () => {
    // Task created by Creator and assigned to AssigneeOnlyUser
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creatorOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Original Author Scope",
        description: "Do not rename",
        assigneeId: assigneeOnlyUser.id,
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Assignee attempts to modify the title
    const updateRes = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${assigneeOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        title: "Hijacked Title By Assignee",
        status: "DONE",
      },
    });

    assert.equal(updateRes.status, 403, "Assignee modifying title must be rejected with 403");
    assert.equal(updateRes.data.error, "Access denied: task title cannot be modified by assignee");
    assert.equal(updateRes.data.code, "ASSIGNEE_CANNOT_MUTATE_TITLE");

    // Verify title in database was NOT altered
    const dbTask = await prisma.task.findUnique({ where: { id: taskId } });
    assert.equal(dbTask.title, "Original Author Scope");
  });

  test("REQ 5 [US-ABAC-004 AC 4]: User holding strictly task:update:assigned attempting to alter projectId or creatorId is rejected (HTTP 403)", async () => {
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creatorOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Governance Guarded Task",
        assigneeId: assigneeOnlyUser.id,
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Attempt to alter projectId
    const res1 = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${assigneeOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { projectId: 9999 },
    });
    assert.equal(res1.status, 403);
    assert.equal(res1.data.code, "PROTECTED_FIELD_MUTATION");

    // Attempt to alter creatorId
    const res2 = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${assigneeOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { creatorId: assigneeOnlyUser.id },
    });
    assert.equal(res2.status, 403);
    assert.equal(res2.data.code, "PROTECTED_FIELD_MUTATION");
  });

  test("REQ 6 [US-ABAC-004 AC 5]: Default Team Member (holding both task:update:own and task:update:assigned)", async () => {
    // 1. Team Member creates their own task -> Can update title and status
    const ownTaskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${defaultMemberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Member Created Task",
        assigneeId: defaultMemberUser.id,
      },
    });
    assert.equal(ownTaskRes.status, 201);
    const ownTaskId = ownTaskRes.data.task.id;
    createdTaskIds.push(ownTaskId);

    const ownUpdateRes = await api(`/api/tasks/${ownTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${defaultMemberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        title: "Member Revised Title",
        status: "IN_PROGRESS",
      },
    });
    assert.equal(ownUpdateRes.status, 200, "Creator member can update title on own created task");
    assert.equal(ownUpdateRes.data.task.title, "Member Revised Title");

    // 2. Super Admin creates a task and assigns to Team Member
    const assignedTaskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Admin Author Task",
        assigneeId: defaultMemberUser.id,
      },
    });
    assert.equal(assignedTaskRes.status, 201);
    const assignedTaskId = assignedTaskRes.data.task.id;
    createdTaskIds.push(assignedTaskId);

    // Member updates status -> Succeeds under task:update:assigned
    const assignedStatusRes = await api(`/api/tasks/${assignedTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${defaultMemberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "DONE",
        description: "Completed by assigned member",
      },
    });
    assert.equal(assignedStatusRes.status, 200, "Assignee member can update status on assigned task");
    assert.equal(assignedStatusRes.data.task.status, "DONE");

    // Member attempts to update title on task created by Admin -> Fails with 403
    const assignedTitleRes = await api(`/api/tasks/${assignedTaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${defaultMemberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        title: "Member Stolen Title",
      },
    });
    assert.equal(assignedTitleRes.status, 403, "Assignee cannot modify title created by another author");
    assert.equal(assignedTitleRes.data.code, "ASSIGNEE_CANNOT_MUTATE_TITLE");
  });

  test("REQ 7 (Subtasks Checklist): Assignee can modify subtasks under task:update:assigned", async () => {
    // Task created by Super Admin and assigned to AssigneeOnlyUser
    const taskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Checklist Task",
        assigneeId: assigneeOnlyUser.id,
      },
    });
    assert.equal(taskRes.status, 201);
    const taskId = taskRes.data.task.id;
    createdTaskIds.push(taskId);

    // Assignee adds subtask checklist item
    const subtaskRes = await api(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${assigneeOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        title: "Implement unit tests",
      },
    });
    assert.equal(subtaskRes.status, 201, "Assignee must be allowed to create subtasks on assigned task");
    const subtaskId = subtaskRes.data.subtask.id;

    // Assignee toggles subtask completed
    const toggleRes = await api(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${assigneeOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        isCompleted: true,
      },
    });
    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.data.subtask.isCompleted, true);
  });

  test("REQ 8 (Negative RBAC): Stakeholder lacking update permissions is rejected (HTTP 403)", async () => {
    const taskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: activeProject.id,
        title: "Viewer Target Task",
      },
    });
    assert.equal(taskRes.status, 201);
    const taskId = taskRes.data.task.id;
    createdTaskIds.push(taskId);

    // Stakeholder attempts to update task
    const res = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${stakeholderToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "IN_PROGRESS",
      },
    });

    assert.equal(res.status, 403, "Caller lacking update permissions must receive 403");
    assert.match(res.data.error, /Permission denied/i);
  });

  test("REQ 9 (Cross-Tenant Boundary): Cross-tenant task update returns HTTP 404", async () => {
    // Nova Labs project and task
    const novaProject = await prisma.project.findFirst({
      where: { organizationId: novaOrg.id },
    });

    const novaTask = await prisma.task.create({
      data: {
        organizationId: novaOrg.id,
        projectId: novaProject.id,
        title: "Nova Confidential Task",
        status: "TODO",
        priority: "MEDIUM",
        creatorId: superAdminUser.id,
      },
    });
    createdTaskIds.push(novaTask.id);

    // Acme caller attempts to update Nova task
    const res = await api(`/api/tasks/${novaTask.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "DONE",
      },
    });

    assert.equal(res.status, 404, "Cross-tenant task update must return 404 Not Found");
  });
});
