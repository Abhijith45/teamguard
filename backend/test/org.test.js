import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("TASK-102: Organization Management, Dynamic Permission Matrix & Super Admin Lockout Guard", () => {
  let server;
  let baseUrl;
  let acmeOrg;
  let novaOrg;

  let superAdminUser;
  let managerUser;
  let memberUser;
  let stakeholderUser;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let stakeholderToken;

  // Track created orgs for cleanup
  const createdOrgIds = [];

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
    stakeholderUser = await prisma.user.findUnique({ where: { email: "viewer@teamguard.io" } });

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    stakeholderToken = signAccessToken(stakeholderUser.id);
  });

  after(async () => {
    // Clean up created orgs
    for (const orgId of createdOrgIds) {
      await prisma.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await prisma.task.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await prisma.project.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await prisma.fileAsset.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await prisma.membershipRole.deleteMany({
        where: { membership: { organizationId: orgId } },
      }).catch(() => {});
      await prisma.membership.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await prisma.rolePermission.deleteMany({
        where: { role: { organizationId: orgId } },
      }).catch(() => {});
      await prisma.role.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    }

    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    resetAuthRateLimiter();
  });

  async function request(path, options = {}) {
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

  // --- US-TENANT-002: Secondary Organization Provisioning ---

  test("REQ 1 [US-TENANT-002]: User can provision a new secondary organization with system roles and Super Admin assignment", async () => {
    const res = await request("/api/organizations", {
      method: "POST",
      headers: { authorization: `Bearer ${managerToken}` },
      body: { name: "Apex Technologies" },
    });

    assert.equal(res.status, 201);
    assert.ok(res.data.organization);
    assert.equal(res.data.organization.name, "Apex Technologies");
    assert.ok(res.data.organization.slug.startsWith("apex-technologies-"));

    const newOrgId = res.data.organization.id;
    createdOrgIds.push(newOrgId);

    // Verify creator is an active member with Super Admin role
    const membership = await prisma.membership.findFirst({
      where: { userId: managerUser.id, organizationId: newOrgId },
      include: { roles: { include: { role: true } } },
    });

    assert.ok(membership, "Creator must have active membership");
    assert.equal(membership.status, "ACTIVE");
    assert.equal(membership.department, "Executive");
    assert.ok(
      membership.roles.some((r) => r.role.slug === "super-admin"),
      "Creator must be assigned Super Admin role"
    );

    // Verify all baseline system roles were created
    const roles = await prisma.role.findMany({ where: { organizationId: newOrgId } });
    const roleSlugs = roles.map((r) => r.slug);
    assert.ok(roleSlugs.includes("super-admin"));
    assert.ok(roleSlugs.includes("project-manager"));
    assert.ok(roleSlugs.includes("team-member"));
    assert.ok(roleSlugs.includes("stakeholder"));

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: newOrgId, action: "organization:create" },
    });
    assert.ok(audit, "Must emit audit event for org creation");
    assert.equal(audit.actorId, managerUser.id);
  });

  test("REQ 2 [US-TENANT-002]: Organization creation rejects invalid payloads", async () => {
    // Empty name
    const res1 = await request("/api/organizations", {
      method: "POST",
      headers: { authorization: `Bearer ${managerToken}` },
      body: { name: " " },
    });
    assert.equal(res1.status, 400);

    // Name too short
    const res2 = await request("/api/organizations", {
      method: "POST",
      headers: { authorization: `Bearer ${managerToken}` },
      body: { name: "A" },
    });
    assert.equal(res2.status, 400);

    // Name too long (> 100 chars)
    const res3 = await request("/api/organizations", {
      method: "POST",
      headers: { authorization: `Bearer ${managerToken}` },
      body: { name: "X".repeat(101) },
    });
    assert.equal(res3.status, 400);
  });

  test("REQ 3 [US-TENANT-002]: Newly provisioned organization is strictly isolated against unjoined users", async () => {
    // Create new org owned by managerUser
    const createRes = await request("/api/organizations", {
      method: "POST",
      headers: { authorization: `Bearer ${managerToken}` },
      body: { name: "Isolated Workspace" },
    });
    assert.equal(createRes.status, 201);
    const isolatedOrgId = createRes.data.organization.id;
    createdOrgIds.push(isolatedOrgId);

    // memberUser is NOT a member of isolatedOrgId -> accessing dashboard must fail
    const accessRes = await request("/api/dashboard", {
      headers: {
        authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(isolatedOrgId),
      },
    });
    assert.equal(accessRes.status, 403);
  });

  // --- TASK-102: Organization Metadata & Details ---

  test("REQ 4 [TASK-102]: GET /api/organizations/current returns active workspace details and counts", async () => {
    const res = await request("/api/organizations/current", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.organization);
    assert.equal(res.data.organization.id, acmeOrg.id);
    assert.equal(res.data.organization.name, acmeOrg.name);
    assert.ok(res.data.organization.counts.members >= 1);
    assert.ok(res.data.organization.counts.roles >= 1);
  });

  test("REQ 5 [TASK-102]: Super Admin can update organization metadata and generate audit log", async () => {
    // Create a dedicated org to test updating
    const createRes = await request("/api/organizations", {
      method: "POST",
      headers: { authorization: `Bearer ${superAdminToken}` },
      body: { name: "Original Org Name" },
    });
    const testOrgId = createRes.data.organization.id;
    createdOrgIds.push(testOrgId);

    const updateRes = await request(`/api/organizations/${testOrgId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(testOrgId),
      },
      body: { name: "Updated Org Name" },
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.organization.name, "Updated Org Name");

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: testOrgId, action: "organization:update" },
    });
    assert.ok(audit, "Must log audit event for org metadata update");
  });

  test("REQ 6 [TASK-102]: Non-admin member cannot update organization metadata", async () => {
    const res = await request(`/api/organizations/${acmeOrg.id}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Hacked Org Name" },
    });

    assert.equal(res.status, 403);
  });

  test("REQ 7 [TASK-102]: Cross-tenant organization update is rejected with 404 (IDOR defense)", async () => {
    // Attempt to update novaOrg using acmeOrg tenant context
    const res = await request(`/api/organizations/${novaOrg.id}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Cross-Tenant Renamed" },
    });

    assert.equal(res.status, 404);
  });

  // --- US-RBAC-001: Dynamic Module-Grouped Permission Matrix ---

  test("REQ 8 [US-RBAC-001]: GET /api/permissions-matrix returns tenant roles, module categories, and mapping", async () => {
    const res = await request("/api/permissions-matrix", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.roles));
    assert.ok(Array.isArray(res.data.categories));
    assert.ok(typeof res.data.matrix === "object");

    // Verify module categories exist
    const catIds = res.data.categories.map((c) => c.id);
    assert.ok(catIds.includes("dashboard"));
    assert.ok(catIds.includes("project"));
    assert.ok(catIds.includes("task"));
    assert.ok(catIds.includes("roles"));

    // Verify roles belong to active org
    for (const r of res.data.roles) {
      assert.ok(r.name);
      assert.ok(r.id);
    }
  });

  test("REQ 9 [US-RBAC-001]: GET /api/permissions-matrix rejects callers lacking roles:manage (403)", async () => {
    const res = await request("/api/permissions-matrix", {
      headers: {
        authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 403);
  });

  // --- US-RBAC-002: Real-Time Discrete Permission Toggling & Dynamic Enforcement ---

  test("REQ 10 [US-RBAC-002]: Can grant and revoke permissions on non-admin roles with audit logging", async () => {
    // Create dedicated org to safely test permission toggles
    const createRes = await request("/api/organizations", {
      method: "POST",
      headers: { authorization: `Bearer ${superAdminToken}` },
      body: { name: "Matrix Test Org" },
    });
    const testOrgId = createRes.data.organization.id;
    createdOrgIds.push(testOrgId);

    // Fetch matrix for test org
    const matrixRes = await request("/api/permissions-matrix", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(testOrgId),
      },
    });
    assert.equal(matrixRes.status, 200);

    const teamMemberRole = matrixRes.data.roles.find((r) => r.slug === "team-member");
    assert.ok(teamMemberRole, "Team member role must exist in test org");

    // Find project:create permission
    const projectCat = matrixRes.data.categories.find((c) => c.id === "project");
    const projectCreatePerm = projectCat.permissions.find((p) => p.action === "create");
    assert.ok(projectCreatePerm, "project:create permission must exist");

    // 1. Grant project:create to Team Member
    const grantRes = await request("/api/permissions-matrix/toggle", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(testOrgId),
      },
      body: {
        roleId: teamMemberRole.id,
        permissionId: projectCreatePerm.id,
        enabled: true,
      },
    });
    assert.equal(grantRes.status, 200);
    assert.equal(grantRes.data.enabled, true);

    // Verify audit log
    const grantAudit = await prisma.auditLog.findFirst({
      where: {
        organizationId: testOrgId,
        action: "role:permission:grant",
      },
    });
    assert.ok(grantAudit, "Must log audit event for permission grant");

    // 2. Revoke project:create from Team Member
    const revokeRes = await request("/api/permissions-matrix/toggle", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(testOrgId),
      },
      body: {
        roleId: teamMemberRole.id,
        permissionId: projectCreatePerm.id,
        enabled: false,
      },
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.data.enabled, false);

    // Verify audit log
    const revokeAudit = await prisma.auditLog.findFirst({
      where: {
        organizationId: testOrgId,
        action: "role:permission:revoke",
      },
    });
    assert.ok(revokeAudit, "Must log audit event for permission revoke");
  });

  test("REQ 11 [US-RBAC-002]: Dynamic Enforcement: Toggling permission takes immediate effect without token re-issuance", async () => {
    // Create dedicated org
    const createRes = await request("/api/organizations", {
      method: "POST",
      headers: { authorization: `Bearer ${superAdminToken}` },
      body: { name: "Dynamic Enforcement Org" },
    });
    const testOrgId = createRes.data.organization.id;
    createdOrgIds.push(testOrgId);

    // Add memberUser to testOrg as Team Member
    const teamMemberRole = await prisma.role.findFirst({
      where: { organizationId: testOrgId, slug: "team-member" },
    });
    const memberMembership = await prisma.membership.create({
      data: {
        userId: memberUser.id,
        organizationId: testOrgId,
        department: "Engineering",
        status: "ACTIVE",
      },
    });
    await prisma.membershipRole.create({
      data: {
        membershipId: memberMembership.id,
        roleId: teamMemberRole.id,
      },
    });

    const projectCreatePerm = await prisma.permission.findFirst({
      where: { resource: "project", action: "create" },
    });

    // Baseline: member cannot create projects (403)
    const failBeforeGrant = await request("/api/projects", {
      method: "POST",
      headers: {
        authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(testOrgId),
      },
      body: { name: "Before Grant Project" },
    });
    assert.equal(failBeforeGrant.status, 403);

    // Step 1: Admin grants project:create to Team Member role
    const grantRes = await request("/api/permissions-matrix/toggle", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(testOrgId),
      },
      body: {
        roleId: teamMemberRole.id,
        permissionId: projectCreatePerm.id,
        enabled: true,
      },
    });
    assert.equal(grantRes.status, 200);

    // Step 2: Member immediately makes project create request with SAME token -> must succeed (201)
    const successAfterGrant = await request("/api/projects", {
      method: "POST",
      headers: {
        authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(testOrgId),
      },
      body: { name: "Granted Project" },
    });
    assert.equal(successAfterGrant.status, 201);

    // Step 3: Admin revokes project:create from Team Member role
    const revokeRes = await request("/api/permissions-matrix/toggle", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(testOrgId),
      },
      body: {
        roleId: teamMemberRole.id,
        permissionId: projectCreatePerm.id,
        enabled: false,
      },
    });
    assert.equal(revokeRes.status, 200);

    // Step 4: Member immediately makes another create request with SAME token -> must fail (403)
    const failAfterRevoke = await request("/api/projects", {
      method: "POST",
      headers: {
        authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(testOrgId),
      },
      body: { name: "Should Fail Project" },
    });
    assert.equal(failAfterRevoke.status, 403);
  });

  // --- US-RBAC-003: System Super Admin Lockout Guard & System Role Protection ---

  test("REQ 12 [US-RBAC-003 / BR-004 / SEC-05]: Revoking any permission from Super Admin returns HTTP 403 Privilege Guard", async () => {
    const matrixRes = await request("/api/permissions-matrix", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(matrixRes.status, 200);

    const superAdminRole = matrixRes.data.roles.find((r) => r.name === "Super Admin");
    const firstPerm = matrixRes.data.categories[0].permissions[0];

    const revokeAttempt = await request("/api/permissions-matrix/toggle", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        roleId: superAdminRole.id,
        permissionId: firstPerm.id,
        enabled: false,
      },
    });

    assert.equal(revokeAttempt.status, 403);
    assert.equal(revokeAttempt.data.code, "SUPER_ADMIN_LOCKOUT_PROTECTION");
    assert.match(revokeAttempt.data.error, /Privilege Guard/);
  });

  test("REQ 13 [US-RBAC-003]: Deleting a system role or Super Admin returns HTTP 403 Forbidden", async () => {
    const superAdminRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, name: "Super Admin" },
    });
    assert.ok(superAdminRole);

    const deleteAttempt = await request(`/api/admin/roles/${superAdminRole.id}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(deleteAttempt.status, 403);
    assert.match(deleteAttempt.data.message || deleteAttempt.data.error, /Cannot delete protected system role/);
  });
});
