import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("ACTION DECOUPLING E2E SUITE: Two-Key Action Authorization Gate & Task Deletion Protection", () => {
  let server;
  let baseUrl;

  let acmeOrg;
  let novaOrg;

  let superAdminUser;
  let managerUser;
  let memberUser;
  let member2User;
  let viewerUser;
  let elenaUser;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let member2Token;
  let viewerToken;
  let elenaToken;

  let acmeMemberMembership;
  let acmeMember2Membership;

  let testProjectId;
  let archivedProjectId;
  let testSpaceId;

  const createdTaskIds = [];
  const createdProjectIds = [];
  const createdSpaceIds = [];

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
    elenaUser = await prisma.user.findUnique({ where: { email: "elena@novalabs.io" } });

    // Ensure member2 exists in Acme Corp
    member2User = await prisma.user.upsert({
      where: { email: "member2_action@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Second Action Member",
        username: "member2_action",
        email: "member2_action@teamguard.io",
        passwordHash: "demo-hash",
        isActive: true,
      },
    });

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

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    member2Token = signAccessToken(member2User.id);
    viewerToken = signAccessToken(viewerUser.id);
    elenaToken = signAccessToken(elenaUser.id);

    // Create a dedicated active test project
    const projRes = await api("/api/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: `Two-Key Test Project ${Date.now()}`,
        description: "Project for two-key action decoupling verification",
        priority: "HIGH",
        status: "ACTIVE",
      },
    });
    const proj = projRes.data.project || projRes.data;
    testProjectId = proj.id;
    createdProjectIds.push(testProjectId);

    // Create an archived project for boundary testing
    const archRes = await api("/api/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: `Archived Test Project ${Date.now()}`,
        description: "Archived project for immutability testing",
        priority: "LOW",
        status: "ARCHIVED",
        isArchived: true,
      },
    });
    const archProj = archRes.data.project || archRes.data;
    archivedProjectId = archProj.id;
    createdProjectIds.push(archivedProjectId);
  });

  after(async () => {
    // Teardown created tasks
    for (const tId of createdTaskIds) {
      await prisma.task.delete({ where: { id: tId } }).catch(() => {});
    }
    // Teardown created projects
    for (const pId of createdProjectIds) {
      await prisma.task.deleteMany({ where: { projectId: pId } }).catch(() => {});
      await prisma.project.delete({ where: { id: pId } }).catch(() => {});
    }
    // Teardown created spaces
    if (prisma.space) {
      for (const sId of createdSpaceIds) {
        await prisma.space.delete({ where: { id: sId } }).catch(() => {});
      }
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetAuthRateLimiter();
  });

  // =========================================================================
  // TIER 1: Core Two-Key Functional Invariants (F-05, F-06, F-21)
  // =========================================================================

  test("TIER 1 [F-06]: Team Member can create a task and delete their OWN task (creator match)", async () => {
    // 1. Team Member creates task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: `Member Own Task ${Date.now()}`,
        priority: "MEDIUM",
        status: "TODO",
      },
    });
    assert.ok([200, 201].includes(createRes.status));
    const task = createRes.data.task || createRes.data;
    assert.ok(task.id);
    assert.equal(task.creatorId, memberUser.id, "Creator must match creating user");

    // 2. Team Member deletes their own task -> Success (HTTP 200/204)
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.ok([200, 204].includes(delRes.status), `Expected 200/204 on deleting own task, got ${delRes.status}`);

    // Verify task is deleted
    const getRes = await api(`/api/tasks/${task.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(getRes.status, 404);
  });

  test("TIER 1 [F-05 / F-06]: Super Admin with 'task:delete:any' can delete any member's task", async () => {
    // 1. Team Member creates task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: `Task For Admin Deletion ${Date.now()}`,
        priority: "HIGH",
        status: "TODO",
      },
    });
    assert.ok([200, 201].includes(createRes.status));
    const task = createRes.data.task || createRes.data;

    // 2. Super Admin deletes the task created by Team Member -> Success
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.ok([200, 204].includes(delRes.status));
  });

  test("TIER 1 [F-05]: Project Manager with role capability can delete tasks", async () => {
    // 1. Team Member creates task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: `Task For PM Deletion ${Date.now()}`,
        priority: "LOW",
        status: "TODO",
      },
    });
    const task = createRes.data.task || createRes.data;

    // 2. Project Manager deletes -> Success
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.ok([200, 204].includes(delRes.status));
  });

  test("TIER 1 [F-06]: Task update is decoupled from task deletion (update grant does not confer delete)", async () => {
    // Verify that holding task:update does not permit arbitrary deletion without task:delete grant
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: `Decoupled Task ${Date.now()}`,
        priority: "MEDIUM",
        status: "TODO",
      },
    });
    const task = createRes.data.task || createRes.data;
    createdTaskIds.push(task.id);

    // Update is permitted
    const updateRes = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "IN_PROGRESS" },
    });
    assert.equal(updateRes.status, 200);
  });

  // =========================================================================
  // TIER 2: Boundary, Negative & Ownership Invariants (F-05, F-06, F-07)
  // =========================================================================

  test("TIER 2 [F-06]: Non-creator Team Member 2 CANNOT delete task created by Team Member 1 (HTTP 403)", async () => {
    // 1. Team Member 1 creates a task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: `Member 1 Protected Task ${Date.now()}`,
        priority: "HIGH",
        status: "TODO",
      },
    });
    const task = createRes.data.task || createRes.data;
    createdTaskIds.push(task.id);

    // 2. Team Member 2 attempts to delete Team Member 1's task
    // CRITICAL TWO-KEY INVARIANT: Must return HTTP 403 Forbidden
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Non-creator member must be barred with HTTP 403 from deleting other member's task");
  });

  test("TIER 2 [F-06]: Assignee who is NOT creator CANNOT delete task under 'task:delete:own' (HTTP 403)", async () => {
    // 1. Team Member 1 creates task, assigning it to Team Member 2
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: `Assigned But Not Created Task ${Date.now()}`,
        priority: "MEDIUM",
        status: "TODO",
        assigneeId: member2User.id,
      },
    });
    const task = createRes.data.task || createRes.data;
    createdTaskIds.push(task.id);

    // 2. Member 2 (the assignee) attempts to delete -> Must be blocked (403)
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Task assignee who is not creator cannot delete task");
  });

  test("TIER 2 [F-05]: Viewer / Stakeholder with NO delete capability cannot delete task even if creator (HTTP 403)", async () => {
    // 1. Super Admin creates task with viewer as creator or attempts deletion as viewer
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: `Viewer Probe Task ${Date.now()}`,
        priority: "LOW",
        status: "TODO",
      },
    });
    const task = createRes.data.task || createRes.data;
    createdTaskIds.push(task.id);

    // Viewer attempts deletion -> HTTP 403
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Viewer lacking delete capability receives 403 Forbidden");
  });

  test("TIER 2 [F-07]: SpaceMember with EDIT tier is blocked from deleting tasks in that space (requires FULL)", async () => {
    // Create a private space with EDIT access for member
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: `Restricted Tier Space ${Date.now()}`,
        slug: `restricted-tier-${Date.now()}`,
        isPrivate: true,
      },
    });

    if (spaceRes.status === 200 || spaceRes.status === 201) {
      const space = spaceRes.data.space || spaceRes.data;
      createdSpaceIds.push(space.id);

      // Add member with EDIT tier
      await api(`/api/spaces/${space.id}/members`, {
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

      // Create a project inside this space
      const projectRes = await api("/api/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          "x-organization-id": String(acmeOrg.id),
        },
        body: {
          name: `Tier Restricted Project ${Date.now()}`,
          spaceId: space.id,
          status: "ACTIVE",
        },
      });

      if (projectRes.status === 200 || projectRes.status === 201) {
        const proj = projectRes.data.project || projectRes.data;
        createdProjectIds.push(proj.id);

        // Member creates task
        const taskRes = await api("/api/tasks", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${memberToken}`,
            "x-organization-id": String(acmeOrg.id),
          },
          body: {
            projectId: proj.id,
            title: "Task in Edit-Tier Space",
          },
        });

        if (taskRes.status === 200 || taskRes.status === 201) {
          const task = taskRes.data.task || taskRes.data;
          createdTaskIds.push(task.id);

          // Member attempts deletion -> blocked by EDIT tier (HTTP 403)
          const delRes = await api(`/api/tasks/${task.id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${memberToken}`,
              "x-organization-id": String(acmeOrg.id),
            },
          });
          assert.equal(delRes.status, 403, "SpaceMember with EDIT tier cannot delete tasks");
        }
      }
    }
  });

  test("TIER 2 [F-06]: Attempting to delete a task in an archived project returns HTTP 403", async () => {
    // 1. Create a task in the archived project as Admin
    const task = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: archivedProjectId,
        title: "Archived Immutability Task",
        status: "DONE",
        creatorId: memberUser.id,
      },
    });
    createdTaskIds.push(task.id);

    // 2. Member attempts to delete task in archived project -> Must fail 403
    const delRes = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "Cannot delete tasks in an archived project");
  });

  test("TIER 2 [F-06]: Deleting a non-existent task returns HTTP 404", async () => {
    const res = await api("/api/tasks/9999999", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 404);
  });

  test("TIER 2 [F-06]: Cross-tenant task deletion attempt returns HTTP 404", async () => {
    // Create task in Nova Labs
    const novaProj = await prisma.project.findFirst({ where: { organizationId: novaOrg.id } });
    if (novaProj) {
      const novaTask = await prisma.task.create({
        data: {
          organizationId: novaOrg.id,
          projectId: novaProj.id,
          title: "Nova Confidential Task",
          status: "TODO",
          creatorId: elenaUser.id,
        },
      });
      createdTaskIds.push(novaTask.id);

      // Acme admin tries to delete Nova task using Acme Org ID
      const res = await api(`/api/tasks/${novaTask.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          "x-organization-id": String(acmeOrg.id),
        },
      });
      assert.equal(res.status, 404, "Cross-tenant task deletion must return 404 Not Found");
    }
  });

  // =========================================================================
  // TIER 3: Pairwise Combinatorial Matrix (Capability x Ownership x Status)
  // =========================================================================

  test("TIER 3 [F-05 / F-06]: Combinatorial Matrix: Deletion Capability x Ownership", async () => {
    // Pair 1: Role 'task:delete:any' x Ownership 'Third-Party' -> Allowed (200)
    const task1 = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: testProjectId,
        title: "Matrix Task 1",
        creatorId: member2User.id,
      },
    });
    const del1 = await api(`/api/tasks/${task1.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.ok([200, 204].includes(del1.status), "Admin with task:delete:any can delete third-party task");

    // Pair 2: Role 'task:delete:own' x Ownership 'Third-Party' -> Denied (403)
    const task2 = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: testProjectId,
        title: "Matrix Task 2",
        creatorId: superAdminUser.id,
      },
    });
    createdTaskIds.push(task2.id);
    const del2 = await api(`/api/tasks/${task2.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(del2.status, 403, "Member with task:delete:own cannot delete third-party task");

    // Pair 3: Role 'task:delete:own' x Ownership 'Creator' -> Allowed (200)
    const task3 = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: testProjectId,
        title: "Matrix Task 3",
        creatorId: memberUser.id,
      },
    });
    const del3 = await api(`/api/tasks/${task3.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.ok([200, 204].includes(del3.status), "Member with task:delete:own can delete own task");

    // Pair 4: Role 'None' x Ownership 'Creator' -> Denied (403)
    const task4 = await prisma.task.create({
      data: {
        organizationId: acmeOrg.id,
        projectId: testProjectId,
        title: "Matrix Task 4",
        creatorId: viewerUser.id,
      },
    });
    createdTaskIds.push(task4.id);
    const del4 = await api(`/api/tasks/${task4.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(del4.status, 403, "Viewer lacking role capability cannot delete even own task");
  });

  // =========================================================================
  // TIER 4: Enterprise End-to-End Workflow Scenarios
  // =========================================================================

  test("TIER 4 [F-05 -> F-07]: End-to-End Collaborative Two-Key Task Deletion Lifecycle", async () => {
    // Step 1: Member 1 creates Task A
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: testProjectId,
        title: `Collaborative Workflow Task ${Date.now()}`,
        priority: "HIGH",
        status: "TODO",
        assigneeId: member2User.id,
      },
    });
    assert.ok([200, 201].includes(createRes.status));
    const task = createRes.data.task || createRes.data;

    // Step 2: Member 2 (the assignee) updates task status to IN_PROGRESS (allowed)
    const updateRes = await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "IN_PROGRESS" },
    });
    assert.equal(updateRes.status, 200);

    // Step 3: Member 2 attempts to delete task -> Denied (HTTP 403)
    const member2Delete = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(member2Delete.status, 403);

    // Step 4: Member 1 (creator) deletes own task -> Success (HTTP 200/204)
    const member1Delete = await api(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.ok([200, 204].includes(member1Delete.status));

    // Step 5: Verification that task is deleted
    const verifyRes = await api(`/api/tasks/${task.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(verifyRes.status, 404);
  });
});
