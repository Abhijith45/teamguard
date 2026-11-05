import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("M2 EMPIRICAL ADVERSARIAL CHALLENGE: Privilege Boundaries, Ownership Restrictions & Spatial Tier Barriers", () => {
  let server;
  let baseUrl;

  let acmeOrg;
  let novaOrg;

  let superAdminUser;
  let managerUser;
  let memberUser;
  let member2User;
  let viewerUser;
  let guestUser;
  let customUpdateOnlyUser;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let member2Token;
  let viewerToken;
  let guestToken;
  let customUpdateOnlyToken;

  let acmeMemberMembership;
  let acmeMember2Membership;
  let acmeGuestMembership;
  let customUpdateOnlyMembership;

  let testProjectId;
  let testSpaceId;

  const createdTaskIds = [];
  const createdProjectIds = [];
  const createdSpaceIds = [];
  const createdRoleIds = [];
  const createdUserIds = [];

  async function api(path, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = {
      "content-type": "application/json",
      ...options.headers,
    };
    const response = await fetch(url, {
      ...options,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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

    // Ensure member2 exists in Acme Corp
    member2User = await prisma.user.upsert({
      where: { email: "member2_challenger@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Second Challenger Member",
        username: "member2_challenger",
        email: "member2_challenger@teamguard.io",
        passwordHash: "demo-hash",
        isActive: true,
      },
    });
    createdUserIds.push(member2User.id);

    const memberRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, slug: "team-member" },
    });

    acmeMemberMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: memberUser.id, organizationId: acmeOrg.id } },
    });

    acmeMember2Membership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: member2User.id, organizationId: acmeOrg.id } },
      update: { status: "ACTIVE" },
      create: {
        userId: member2User.id,
        organizationId: acmeOrg.id,
        status: "ACTIVE",
        department: "Engineering",
      },
    });

    if (memberRole) {
      await prisma.membershipRole.upsert({
        where: {
          membershipId_roleId: {
            membershipId: acmeMember2Membership.id,
            roleId: memberRole.id,
          },
        },
        update: {},
        create: {
          membershipId: acmeMember2Membership.id,
          roleId: memberRole.id,
        },
      });
    }

    // Create a special adversary user with ONLY UPDATE permissions (no delete capability)
    customUpdateOnlyUser = await prisma.user.upsert({
      where: { email: "updateonly@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Update Only User",
        username: "update_only_adversary",
        email: "updateonly@teamguard.io",
        passwordHash: "demo-hash",
        isActive: true,
      },
    });
    createdUserIds.push(customUpdateOnlyUser.id);

    customUpdateOnlyMembership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: customUpdateOnlyUser.id, organizationId: acmeOrg.id } },
      update: { status: "ACTIVE" },
      create: {
        userId: customUpdateOnlyUser.id,
        organizationId: acmeOrg.id,
        status: "ACTIVE",
        department: "Operations",
      },
    });

    // Create custom role with update:any and update:own, but ZERO delete permissions
    const updateOnlyRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Task Editor Without Delete ${Date.now()}`,
        slug: `task-editor-no-delete-${Date.now()}`,
        description: "Adversarial test role holding only task update capabilities",
        isSystem: false,
      },
    });
    createdRoleIds.push(updateOnlyRole.id);

    // Get task:update:any, task:update:own, task:view, task:create permissions
    const permKeys = ["task:view", "task:create", "task:update:any", "task:update:own"];
    for (const key of permKeys) {
      const [resource, action] = key.split(":");
      const perm = await prisma.permission.findUnique({
        where: { resource_action: { resource, action } },
      });
      if (perm) {
        await prisma.rolePermission.create({
          data: {
            roleId: updateOnlyRole.id,
            permissionId: perm.id,
          },
        });
      }
    }

    await prisma.membershipRole.create({
      data: {
        membershipId: customUpdateOnlyMembership.id,
        roleId: updateOnlyRole.id,
      },
    });

    // Ensure Guest user exists
    guestUser = await prisma.user.upsert({
      where: { email: "guest@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Guest Collaborator",
        username: "guest_collaborator_test",
        email: "guest@teamguard.io",
        passwordHash: "demo-hash",
        isActive: true,
      },
    });
    createdUserIds.push(guestUser.id);

    acmeGuestMembership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: guestUser.id, organizationId: acmeOrg.id } },
      update: { status: "ACTIVE", accountType: "GUEST" },
      create: {
        userId: guestUser.id,
        organizationId: acmeOrg.id,
        status: "ACTIVE",
        department: "External",
        accountType: "GUEST",
      },
    });

    // Setup base project
    const defaultProject = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Adversarial Harness Project ${Date.now()}`,
        status: "ACTIVE",
      },
    });
    testProjectId = defaultProject.id;
    createdProjectIds.push(testProjectId);

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    member2Token = signAccessToken(member2User.id);
    viewerToken = signAccessToken(viewerUser.id);
    guestToken = signAccessToken(guestUser.id);
    customUpdateOnlyToken = signAccessToken(customUpdateOnlyUser.id);
  });

  after(async () => {
    for (const taskId of createdTaskIds) {
      await prisma.task.delete({ where: { id: taskId } }).catch(() => {});
    }
    for (const projectId of createdProjectIds) {
      await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    }
    for (const spaceId of createdSpaceIds) {
      await prisma.space.delete({ where: { id: spaceId } }).catch(() => {});
    }
    for (const roleId of createdRoleIds) {
      await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetAuthRateLimiter();
  });

  // =========================================================================
  // SECTION 1: PRIVILEGE ESCALATION CHALLENGES (Update Permissions != Delete)
  // =========================================================================

  test("CHALLENGE 1.1: User holding 'task:update:any' and 'task:update:own' CANNOT delete their own task (HTTP 403)", async () => {
    // customUpdateOnlyUser creates a task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customUpdateOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: "Task created by update-only actor",
        priority: "MEDIUM",
        status: "TODO",
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Adversary attempts DELETE /api/tasks/:taskId
    const delRes = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${customUpdateOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Must return HTTP 403 Forbidden");
    assert.match(
      delRes.data.requiredPermission || delRes.data.error || "",
      /task:delete:own|task:delete:any|Permission denied/i
    );

    // Verify task is still in DB intact
    const taskInDb = await prisma.task.findUnique({ where: { id: taskId } });
    assert.ok(taskInDb, "Task must NOT be deleted from database");
  });

  test("CHALLENGE 1.2: User holding 'task:update:any' CANNOT delete another user's task (HTTP 403)", async () => {
    // memberUser creates a task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: "Task created by member 1 for update escalation challenge",
        priority: "HIGH",
        status: "TODO",
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // customUpdateOnlyUser attempts DELETE /api/tasks/:taskId
    const delRes = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${customUpdateOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Must return HTTP 403 Forbidden");

    // Verify task is still in DB intact
    const taskInDb = await prisma.task.findUnique({ where: { id: taskId } });
    assert.ok(taskInDb, "Task must NOT be deleted from database");
  });

  test("CHALLENGE 1.3: HTTP Verb Tampering / Override on PATCH cannot delete task", async () => {
    // Create task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: "Task for verb tampering challenge",
        priority: "LOW",
        status: "TODO",
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Try X-HTTP-Method-Override: DELETE on PATCH
    const overrideRes = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${customUpdateOnlyToken}`,
        "x-organization-id": String(acmeOrg.id),
        "X-HTTP-Method-Override": "DELETE",
        "X-Method-Override": "DELETE",
      },
      body: {
        title: "Attempted override",
      },
    });

    // Should update title via PATCH, NOT delete
    assert.ok([200, 400, 403].includes(overrideRes.status));
    const taskInDb = await prisma.task.findUnique({ where: { id: taskId } });
    assert.ok(taskInDb, "Task must NOT be deleted via method override header");
  });

  // =========================================================================
  // SECTION 2: OWNERSHIP BOUNDARY CHALLENGES ('task:delete:own')
  // =========================================================================

  test("CHALLENGE 2.1: Member with 'task:delete:own' CANNOT delete task created by another user (HTTP 403)", async () => {
    // Member 1 creates task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: "Member 1 Private Creation",
        priority: "MEDIUM",
        status: "TODO",
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Member 2 attempts deletion
    const delRes = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Must return HTTP 403 Forbidden");
    assert.equal(delRes.data.code, "CANNOT_DELETE_OTHERS_TASK");
    assert.match(delRes.data.error, /cannot delete tasks created by other members/i);

    // Verify task is still in DB intact
    const taskInDb = await prisma.task.findUnique({ where: { id: taskId } });
    assert.ok(taskInDb, "Task must still exist in DB");
  });

  test("CHALLENGE 2.2: Assignee who is NOT creator CANNOT delete task under 'task:delete:own' (HTTP 403)", async () => {
    // Member 1 creates task and assigns it to Member 2
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: "Task Assigned to Member 2",
        priority: "HIGH",
        status: "TODO",
        assigneeId: member2User.id,
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Member 2 is assignee, but NOT creator. Attempts deletion.
    const delRes = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Assignee cannot delete task created by someone else");
    assert.equal(delRes.data.code, "CANNOT_DELETE_OTHERS_TASK");
  });

  test("CHALLENGE 2.3: Parameter tampering (creatorId spoofing in DELETE body) cannot bypass ownership check", async () => {
    // Member 1 creates task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: "Task to test body spoofing",
        status: "TODO",
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Member 2 sends spoofed creatorId and membershipId in DELETE body
    const delRes = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        creatorId: member2User.id,
        actorId: memberUser.id,
        membershipId: acmeMemberMembership.id,
      },
    });

    assert.equal(delRes.status, 403, "Must not trust body parameters for creator identity");
    assert.equal(delRes.data.code, "CANNOT_DELETE_OTHERS_TASK");
  });

  test("CHALLENGE 2.4: Attempting to modify creatorId via PATCH is rejected/ignored and delete still fails", async () => {
    // Member 1 creates task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: "Task for creatorId modification test",
        status: "TODO",
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;
    createdTaskIds.push(taskId);

    // Manager (who has task:update:any) tries to change creatorId to Member 2
    await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        creatorId: member2User.id,
      },
    });

    // Check DB: creatorId must remain Member 1
    const taskInDb = await prisma.task.findUnique({ where: { id: taskId } });
    assert.equal(taskInDb.creatorId, memberUser.id, "creatorId must be immutable");

    // Member 2 still cannot delete it
    const delRes = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(delRes.status, 403);
  });

  // =========================================================================
  // SECTION 3: SPATIAL TIER BARRIER ON TASKS (ReBAC Tier vs Delete)
  // =========================================================================

  test("CHALLENGE 3.1: Task creator with 'task:delete:own' CANNOT delete task in Space with EDIT tier (HTTP 403)", async () => {
    // Create private space
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Private Tier Barrier Space",
        slug: `barrier-space-${Date.now()}`,
        isPrivate: true,
      },
    });
    assert.equal(spaceRes.status, 201);
    const spaceId = spaceRes.data.space.id;
    createdSpaceIds.push(spaceId);

    // Create project linked to this space
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: "Space-Bound Project",
        spaceId,
        status: "ACTIVE",
      },
    });
    createdProjectIds.push(project.id);

    // Member 1 creates a task in this project
    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        creatorId: memberUser.id,
        title: "Space Scoped Task by Member 1",
        status: "TODO",
        priority: "MEDIUM",
      },
    });
    createdTaskIds.push(task.id);

    // Add Member 1 to Space with EDIT tier
    const addMemberRes = await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "EDIT",
      },
    });
    assert.equal(addMemberRes.status, 200);

    // Member 1 attempts DELETE /api/tasks/:taskId
    // Has role key (task:delete:own), is creator (creator match), BUT spatial tier is EDIT (requires FULL)
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Must be rejected with HTTP 403 due to EDIT tier barrier");
    assert.equal(delRes.data.code, "TIER_RESTRICTION");
    assert.match(delRes.data.error, /tier 'Edit' does not allow deletion/i);

    // Verify task is still in DB
    const checkDb = await prisma.task.findUnique({ where: { id: task.id } });
    assert.ok(checkDb, "Task must remain in DB");
  });

  test("CHALLENGE 3.2: Task creator with 'task:delete:own' CANNOT delete task in Space with COMMENT or VIEW tier (HTTP 403)", async () => {
    // Using the same space and task from 3.1
    const spaceId = createdSpaceIds[createdSpaceIds.length - 1];
    const taskId = createdTaskIds[createdTaskIds.length - 1];

    // Downgrade Member 1 to COMMENT
    await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "COMMENT",
      },
    });

    const delResComment = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(delResComment.status, 403);
    assert.equal(delResComment.data.code, "TIER_RESTRICTION");
    assert.match(delResComment.data.error, /tier 'Comment' does not allow deletion/i);

    // Downgrade Member 1 to VIEW
    await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "VIEW",
      },
    });

    const delResView = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(delResView.status, 403);
    assert.equal(delResView.data.code, "TIER_RESTRICTION");
    assert.match(delResView.data.error, /tier 'View' does not allow deletion/i);
  });

  test("CHALLENGE 3.3: Project Manager with 'task:delete:any' CANNOT delete task in Space when PM has EDIT tier (HTTP 403)", async () => {
    const spaceId = createdSpaceIds[createdSpaceIds.length - 1];
    const taskId = createdTaskIds[createdTaskIds.length - 1];

    // Find Manager membership
    const managerMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: managerUser.id, organizationId: acmeOrg.id } },
    });

    // Add Manager to space with EDIT tier
    await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: managerMembership.id,
        accessLevel: "EDIT",
      },
    });

    // Manager attempts deletion
    const delRes = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "PM holding task:delete:any is blocked when spatial tier is EDIT");
    assert.equal(delRes.data.code, "TIER_RESTRICTION");
  });

  test("CHALLENGE 3.4: Member upgraded to FULL tier in Space CAN successfully delete their task (HTTP 204)", async () => {
    const spaceId = createdSpaceIds[createdSpaceIds.length - 1];
    const taskId = createdTaskIds[createdTaskIds.length - 1];

    // Upgrade Member 1 to FULL tier in Space
    const upgradeRes = await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "FULL",
      },
    });
    assert.equal(upgradeRes.status, 200);

    // Member 1 attempts DELETE /api/tasks/:taskId
    const delRes = await api(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 204, "Deletion must succeed with 204 No Content under FULL tier");

    // Verify task is deleted from DB
    const checkDb = await prisma.task.findUnique({ where: { id: taskId } });
    assert.equal(checkDb, null, "Task must be deleted from DB");
  });

  // =========================================================================
  // SECTION 4: SPACE TIER MUTATIONS (VIEW / COMMENT vs EDIT)
  // =========================================================================

  test("CHALLENGE 4.1: Member with VIEW tier CANNOT update space metadata via PATCH or PUT (HTTP 403)", async () => {
    // Create private space
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Space For Mutation Test",
        slug: `mutation-space-${Date.now()}`,
        isPrivate: true,
      },
    });
    assert.equal(spaceRes.status, 201);
    const spaceId = spaceRes.data.space.id;
    createdSpaceIds.push(spaceId);

    // Add Member 1 with VIEW tier
    await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "VIEW",
      },
    });

    // Member 1 attempts PATCH /api/spaces/:id
    const patchRes = await api(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Maliciously Renamed Space via PATCH",
      },
    });
    assert.equal(patchRes.status, 403, "PATCH must be rejected with HTTP 403");
    assert.match(patchRes.data.error, /requires EDIT, current tier is VIEW/i);

    // Member 1 attempts PUT /api/spaces/:id
    const putRes = await api(`/api/spaces/${spaceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Maliciously Renamed Space via PUT",
      },
    });
    assert.equal(putRes.status, 403, "PUT must be rejected with HTTP 403");
    assert.match(putRes.data.error, /requires EDIT, current tier is VIEW/i);

    // Verify name was not modified
    const spaceInDb = await prisma.space.findUnique({ where: { id: spaceId } });
    assert.equal(spaceInDb.name, "Space For Mutation Test");
  });

  test("CHALLENGE 4.2: Member with COMMENT tier CANNOT update space metadata (HTTP 403)", async () => {
    const spaceId = createdSpaceIds[createdSpaceIds.length - 1];

    // Upgrade Member 1 to COMMENT tier
    await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "COMMENT",
      },
    });

    const patchRes = await api(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Renamed by Commenter",
      },
    });
    assert.equal(patchRes.status, 403);
    assert.match(patchRes.data.error, /requires EDIT, current tier is COMMENT/i);
  });

  test("CHALLENGE 4.3: Member with EDIT tier CAN update space metadata (HTTP 200)", async () => {
    const spaceId = createdSpaceIds[createdSpaceIds.length - 1];

    // Upgrade Member 1 to EDIT tier
    await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "EDIT",
      },
    });

    const patchRes = await api(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Legitimately Updated by Editor",
        color: "#10b981",
      },
    });
    assert.equal(patchRes.status, 200, "EDIT tier must be allowed to update space metadata");
    assert.equal(patchRes.data.space.name, "Legitimately Updated by Editor");
    assert.equal(patchRes.data.space.color, "#10b981");
  });

  // =========================================================================
  // SECTION 5: SPACE DELETION PRIVILEGE BARRIER (EDIT vs FULL)
  // =========================================================================

  test("CHALLENGE 5.1: Member with EDIT tier CANNOT delete space (HTTP 403, requires FULL)", async () => {
    const spaceId = createdSpaceIds[createdSpaceIds.length - 1];

    // Member 1 currently holds EDIT tier. Attempts DELETE /api/spaces/:id
    const delRes = await api(`/api/spaces/${spaceId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "EDIT tier must be rejected with HTTP 403 for space deletion");
    assert.equal(delRes.data.code, "OBJECT_TIER_BARRIER");
    assert.match(delRes.data.error, /requires FULL, current tier is EDIT/i);

    // Verify space still exists in DB
    const spaceInDb = await prisma.space.findUnique({ where: { id: spaceId } });
    assert.ok(spaceInDb, "Space must still exist in DB");
  });

  test("CHALLENGE 5.2: In a PUBLIC space, member with default EDIT tier CANNOT delete space (HTTP 403)", async () => {
    // Create public space
    const pubSpaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Public Space For Deletion Test",
        slug: `public-del-test-${Date.now()}`,
        isPrivate: false,
      },
    });
    assert.equal(pubSpaceRes.status, 201);
    const pubSpaceId = pubSpaceRes.data.space.id;
    createdSpaceIds.push(pubSpaceId);

    // Member 1 (no explicit membership, gets default public EDIT tier) attempts deletion
    const delRes = await api(`/api/spaces/${pubSpaceId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Default public tier EDIT cannot delete public space");
    assert.match(delRes.data.error, /requires FULL, current tier is EDIT/i);

    // Verify space still in DB
    const spaceInDb = await prisma.space.findUnique({ where: { id: pubSpaceId } });
    assert.ok(spaceInDb, "Public space must still exist in DB");
  });

  test("CHALLENGE 5.3: Member with FULL tier CAN delete space (HTTP 200)", async () => {
    const spaceId = createdSpaceIds[0]; // The first private space created in 3.1
    // Promote Member 1 to FULL tier
    await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "FULL",
      },
    });

    const delRes = await api(`/api/spaces/${spaceId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 200, "FULL tier member can delete space");
    assert.equal(delRes.data.spaceId, spaceId);

    // Verify deletion in DB
    const spaceInDb = await prisma.space.findUnique({ where: { id: spaceId } });
    assert.equal(spaceInDb, null, "Space must be removed from DB");
  });

  // =========================================================================
  // SECTION 6: BOUNDARY & ISOLATION ADVERSARIAL CASES
  // =========================================================================

  test("CHALLENGE 6.1: Member with EDIT tier CANNOT manage space members (HTTP 403, requires FULL)", async () => {
    // Space from 4.1
    const spaceId = createdSpaceIds[1];

    // Member 1 holds EDIT tier. Attempts to add Member 2 with FULL tier
    const addRes = await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMember2Membership.id,
        accessLevel: "FULL",
      },
    });

    assert.equal(addRes.status, 403, "EDIT tier cannot add/escalate space members");
    assert.match(addRes.data.error, /requires FULL/i);

    // Member 1 attempts to remove a space member
    const remRes = await api(`/api/spaces/${spaceId}/members/${acmeMember2Membership.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(remRes.status, 403, "EDIT tier cannot remove space members");
  });

  test("CHALLENGE 6.2: Non-member probing private space receives HTTP 404 resource hiding across all verbs", async () => {
    // Create private space with SuperAdmin only
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Secret Isolated Space",
        slug: `secret-space-${Date.now()}`,
        isPrivate: true,
      },
    });
    assert.equal(spaceRes.status, 201);
    const spaceId = spaceRes.data.space.id;
    createdSpaceIds.push(spaceId);

    // Member 2 (not a member of this space) probes:
    // GET
    const getRes = await api(`/api/spaces/${spaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(getRes.status, 404, "GET non-member private space must return 404");

    // PATCH
    const patchRes = await api(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Probe" },
    });
    assert.equal(patchRes.status, 404, "PATCH non-member private space must return 404");

    // DELETE
    const delRes = await api(`/api/spaces/${spaceId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(delRes.status, 404, "DELETE non-member private space must return 404");

    // POST /members
    const postMemRes = await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { membershipId: acmeMember2Membership.id, accessLevel: "FULL" },
    });
    assert.equal(postMemRes.status, 404, "POST /members non-member private space must return 404");
  });

  test("CHALLENGE 6.3: Guest account sandboxing - complete exclusion from Spaces API", async () => {
    // 1. GET /api/spaces returns empty array
    const listRes = await api("/api/spaces", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(listRes.status, 200);
    assert.deepEqual(listRes.data, []);

    // 2. POST /api/spaces returns 403
    const createRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Guest Space", slug: "guest-space" },
    });
    assert.equal(createRes.status, 403);
    assert.equal(createRes.data.code, "GUEST_SPACE_ACCESS_DENIED");

    // 3. Admin cannot add guest as space member
    const pubSpaceId = createdSpaceIds[createdSpaceIds.length - 2];
    const addGuestRes = await api(`/api/spaces/${pubSpaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeGuestMembership.id,
        accessLevel: "VIEW",
      },
    });
    assert.equal(addGuestRes.status, 400);
    assert.match(addGuestRes.data.error, /Guests cannot be added as space members/i);
  });

  test("CHALLENGE 6.4: Non-member holding 'task:delete:any' (Project Manager) attempting to delete task in private space", async () => {
    // 1. Super Admin creates private space
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Confidential Project Space",
        slug: `confidential-space-${Date.now()}`,
        isPrivate: true,
      },
    });
    assert.equal(spaceRes.status, 201);
    const spaceId = spaceRes.data.space.id;
    createdSpaceIds.push(spaceId);

    // 2. Create project in this private space
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: "Confidential Project",
        spaceId,
        status: "ACTIVE",
      },
    });
    createdProjectIds.push(project.id);

    // 3. Super Admin creates a task in this private space
    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        creatorId: superAdminUser.id,
        title: "Confidential Strategy Task",
        status: "TODO",
        priority: "HIGH",
      },
    });
    createdTaskIds.push(task.id);

    // 4. Project Manager is NOT a member of this private space.
    // Project Manager attempts DELETE /api/tasks/:taskId
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    // Assert whether non-member PM was able to delete task in private space
    // Vulnerability finding: returns 204 because objectAccessLevel is undefined for non-members of private space
    assert.equal(delRes.status, 403, `Non-member PM should NOT be able to delete task in private space, but got ${delRes.status}`);
  });

  test("CHALLENGE 6.5: Expelled member (task creator with 'task:delete:own' removed from private space) deleting task in private space", async () => {
    // 1. Create private space
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Expelled Member Test Space",
        slug: `expelled-test-${Date.now()}`,
        isPrivate: true,
      },
    });
    assert.equal(spaceRes.status, 201);
    const spaceId = spaceRes.data.space.id;
    createdSpaceIds.push(spaceId);

    // 2. Add Member 1 with EDIT tier initially
    await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMemberMembership.id,
        accessLevel: "EDIT",
      },
    });

    // 3. Create project in this space
    const project = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: "Expelled Member Project",
        spaceId,
        status: "ACTIVE",
      },
    });
    createdProjectIds.push(project.id);

    // 4. Member 1 creates a task
    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: project.id,
        creatorId: memberUser.id,
        title: "Task by Member to be Expelled",
        status: "TODO",
        priority: "MEDIUM",
      },
    });
    createdTaskIds.push(task.id);

    // 5. While holding EDIT tier in the space, Member 1 attempts delete -> BLOCKED (403)
    const delResWhileMember = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(delResWhileMember.status, 403, "While an EDIT member, delete is blocked");

    // 6. Super Admin removes Member 1 from the space entirely
    await api(`/api/spaces/${spaceId}/members/${acmeMemberMembership.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    // 7. Member 1 attempts delete after being expelled from the private space
    const delResAfterExpelled = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    // An expelled member with NO access to the private space should NOT be able to delete the task!
    // But due to the missing private space membership barrier, objectAccessLevel is undefined and delete succeeds (204)!
    assert.equal(delResAfterExpelled.status, 403, `Expelled non-member should NOT be able to delete task in private space, but got ${delResAfterExpelled.status}`);
  });
});



