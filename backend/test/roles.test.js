import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("TASK-103: Custom Role Creation, Template Cloning & Module-Level Bulk Toggles", () => {
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

  const createdRoleIds = [];
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
    // Clean up created roles
    for (const rId of createdRoleIds) {
      await prisma.rolePermission.deleteMany({ where: { roleId: rId } }).catch(() => {});
      await prisma.membershipRole.deleteMany({ where: { roleId: rId } }).catch(() => {});
      await prisma.role.delete({ where: { id: rId } }).catch(() => {});
    }

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

  // --- US-RBAC-004: Custom Role Creation & Template Cloning ---

  test("REQ 1 [US-RBAC-004]: Admin can create a custom role with clean slate and scoped to active organization", async () => {
    const res = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Security Auditor",
        description: "Specialized read-only compliance and audit inspector",
      },
    });

    assert.equal(res.status, 201);
    assert.ok(res.data.role);
    assert.equal(res.data.role.name, "Security Auditor");
    assert.equal(res.data.role.isSystem, false);
    assert.equal(res.data.role.organizationId, acmeOrg.id);
    assert.ok(res.data.role.slug.startsWith("security-auditor-"));
    assert.equal(res.data.clonedPermissionCount, 0);

    createdRoleIds.push(res.data.role.id);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: acmeOrg.id, action: "role:create", resourceId: String(res.data.role.id) },
    });
    assert.ok(audit, "Must log audit event for role:create");
  });

  test("REQ 2 [US-RBAC-004]: Admin can create a custom role by cloning permissions from an existing template", async () => {
    // Find Team Member template in Acme Corp
    const memberRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, slug: "team-member" },
      include: { permissions: true },
    });
    assert.ok(memberRole);

    const res = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "QA Specialist",
        description: "Cloned from Team Member template for quality assurance",
        cloneFromRoleId: memberRole.id,
      },
    });

    assert.equal(res.status, 201);
    assert.ok(res.data.role);
    assert.equal(res.data.role.name, "QA Specialist");
    assert.equal(res.data.clonedPermissionCount, memberRole.permissions.length);
    assert.ok(res.data.role.permissions.length >= memberRole.permissions.length);

    createdRoleIds.push(res.data.role.id);

    // Verify permissions in DB match cloned permissions
    const dbRolePermissions = await prisma.rolePermission.findMany({
      where: { roleId: res.data.role.id },
    });
    assert.equal(dbRolePermissions.length, memberRole.permissions.length);
  });

  test("REQ 3 [US-RBAC-004]: Duplicate role name in same tenant returns HTTP 409 Conflict", async () => {
    // Attempt to create role with same name as an existing one
    const res = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Super Admin", // already exists
      },
    });

    assert.equal(res.status, 409);
    assert.match(res.data.error, /Role name already exists/);
  });

  test("REQ 4 [US-RBAC-004]: Role creation rejects invalid payloads", async () => {
    // Empty / short name
    const res1 = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "A" },
    });
    assert.equal(res1.status, 400);

    // Name too long (> 50 chars)
    const res2 = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Z".repeat(51) },
    });
    assert.equal(res2.status, 400);
  });

  test("REQ 5 [US-RBAC-004]: Non-admin lacking roles:manage cannot create custom roles", async () => {
    const res = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Unauthorized Role" },
    });

    assert.equal(res.status, 403);
  });

  // --- US-RBAC-005: Module-Level Bulk Permission Toggles ---

  test("REQ 6 [US-RBAC-005]: Module-level bulk toggle (Select All) grants all permissions in a module", async () => {
    // Create custom role for bulk toggle testing
    const roleRes = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Billing Manager" },
    });
    assert.equal(roleRes.status, 201);
    const testRoleId = roleRes.data.role.id;
    createdRoleIds.push(testRoleId);

    // Bulk grant all "files" permissions
    const bulkRes = await request(`/api/roles/${testRoleId}/modules/files/toggle`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { enabled: true },
    });

    assert.equal(bulkRes.status, 200);
    assert.equal(bulkRes.data.enabled, true);
    assert.equal(bulkRes.data.module, "files");
    assert.ok(bulkRes.data.affectedCount >= 1);

    // Verify all files permissions are in DB for this role
    const filePerms = await prisma.permission.findMany({ where: { resource: "files" } });
    const assigned = await prisma.rolePermission.findMany({
      where: { roleId: testRoleId, permission: { resource: "files" } },
    });
    assert.equal(assigned.length, filePerms.length);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "role:module:bulk-grant",
        resourceId: `${testRoleId}:files`,
      },
    });
    assert.ok(audit, "Must log audit event for role:module:bulk-grant");
  });

  test("REQ 7 [US-RBAC-005]: Module-level bulk toggle (Clear All) revokes all permissions in a module", async () => {
    // Create role cloned from manager
    const mgrRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, slug: "project-manager" },
    });
    const roleRes = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Temporary Lead",
        cloneFromRoleId: mgrRole.id,
      },
    });
    assert.equal(roleRes.status, 201);
    const testRoleId = roleRes.data.role.id;
    createdRoleIds.push(testRoleId);

    // Bulk revoke all "task" permissions
    const bulkRevokeRes = await request(`/api/roles/${testRoleId}/modules/task/toggle`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { enabled: false },
    });

    assert.equal(bulkRevokeRes.status, 200);
    assert.equal(bulkRevokeRes.data.enabled, false);

    // Verify in DB that zero task permissions remain for this role
    const remainingTasks = await prisma.rolePermission.findMany({
      where: { roleId: testRoleId, permission: { resource: "task" } },
    });
    assert.equal(remainingTasks.length, 0);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "role:module:bulk-revoke",
        resourceId: `${testRoleId}:task`,
      },
    });
    assert.ok(audit, "Must log audit event for role:module:bulk-revoke");
  });

  test("REQ 8 [US-RBAC-005 / BR-004 / SEC-05]: Attempting bulk Clear All on Super Admin returns HTTP 403 Lockout Guard", async () => {
    const superAdminRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, name: "Super Admin" },
    });
    assert.ok(superAdminRole);

    const res = await request(`/api/roles/${superAdminRole.id}/modules/task/toggle`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { enabled: false },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.code, "SUPER_ADMIN_LOCKOUT_PROTECTION");
    assert.match(res.data.error, /Privilege Guard/);
  });

  // --- US-RBAC-006: Custom Role Modification & Safe Deletion ---

  test("REQ 9 [US-RBAC-006]: Attempting to delete a built-in system role returns HTTP 403 Forbidden", async () => {
    const memberRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, slug: "team-member" },
    });
    assert.ok(memberRole);

    const res = await request(`/api/roles/${memberRole.id}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 403);
    assert.match(res.data.error, /Cannot delete protected system role/);
  });

  test("REQ 10 [US-RBAC-006]: Attempting to delete a custom role assigned to active members returns HTTP 400 Bad Request", async () => {
    // Create a custom role
    const roleRes = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Active Assigned Role" },
    });
    assert.equal(roleRes.status, 201);
    const assignedRoleId = roleRes.data.role.id;
    createdRoleIds.push(assignedRoleId);

    // Assign stakeholderUser to this role
    const stakeholderMembership = await prisma.membership.findFirst({
      where: { userId: stakeholderUser.id, organizationId: acmeOrg.id },
    });
    assert.ok(stakeholderMembership);

    const assignBinding = await prisma.membershipRole.create({
      data: {
        membershipId: stakeholderMembership.id,
        roleId: assignedRoleId,
      },
    });

    // Attempt to delete role while assigned -> Must be rejected with 400
    const deleteRes = await request(`/api/roles/${assignedRoleId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(deleteRes.status, 400);
    assert.match(deleteRes.data.error, /Cannot delete role assigned to active members/);

    // Clean up assignment binding
    await prisma.membershipRole.delete({
      where: { membershipId_roleId: { membershipId: stakeholderMembership.id, roleId: assignedRoleId } },
    });
  });

  test("REQ 11 [US-RBAC-006]: Successfully deletes an unassigned custom role and emits audit log", async () => {
    // Create an unassigned custom role
    const roleRes = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Obsolete Role" },
    });
    assert.equal(roleRes.status, 201);
    const obsoleteRoleId = roleRes.data.role.id;

    // Delete the unassigned role -> Must succeed (200)
    const deleteRes = await request(`/api/roles/${obsoleteRoleId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.data.success, true);

    // Verify it is gone from database
    const dbRole = await prisma.role.findUnique({ where: { id: obsoleteRoleId } });
    assert.equal(dbRole, null);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "role:delete",
        resourceId: String(obsoleteRoleId),
      },
    });
    assert.ok(audit, "Must emit role:delete audit event");
  });

  test("REQ 12 [TASK-103]: Cross-tenant role modification or deletion attempt returns HTTP 404 (IDOR defense)", async () => {
    // Create custom role in Nova Labs
    const novaRole = await prisma.role.create({
      data: {
        organizationId: novaOrg.id,
        name: "Nova Secret Role",
        slug: "nova-secret-role",
        isSystem: false,
      },
    });
    createdRoleIds.push(novaRole.id);

    // Attempt to delete novaRole using acmeOrg tenant header
    const deleteAttempt = await request(`/api/roles/${novaRole.id}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(deleteAttempt.status, 404);

    // Attempt to bulk toggle novaRole using acmeOrg tenant header
    const toggleAttempt = await request(`/api/roles/${novaRole.id}/modules/task/toggle`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { enabled: true },
    });

    assert.equal(toggleAttempt.status, 404);
  });

  test("REQ 13 [TASK-103]: Custom role appears dynamically in Permissions Matrix and Roles list", async () => {
    const roleRes = await request("/api/roles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Product Operations" },
    });
    assert.equal(roleRes.status, 201);
    createdRoleIds.push(roleRes.data.role.id);

    // Verify in GET /api/roles
    const listRes = await request("/api/roles", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(listRes.status, 200);
    const foundInList = listRes.data.roles.find((r) => r.name === "Product Operations");
    assert.ok(foundInList, "Created role must appear in roles list");

    // Verify in GET /api/permissions-matrix
    const matrixRes = await request("/api/permissions-matrix", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(matrixRes.status, 200);
    const foundInMatrix = matrixRes.data.roles.find((r) => r.name === "Product Operations");
    assert.ok(foundInMatrix, "Created role must appear in matrix columns");
  });
});
