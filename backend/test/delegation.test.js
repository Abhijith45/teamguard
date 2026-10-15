import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("TASK-104: Universal Privilege Delegation Barrier & System Role Protection", () => {
  let server;
  let baseUrl;
  let acmeOrg;
  let novaOrg;

  let superAdminUser;
  let managerUser;
  let memberUser;
  let delegateUser;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let delegateToken;

  let delegatedRole;

  const createdRoleIds = [];
  const createdUserIds = [];

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

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);

    // Create a Delegated Administrator user who has roles:manage and members:manage,
    // plus task:* and project:* permissions, but specifically lacks audit:* and org:delete.
    delegateUser = await prisma.user.upsert({
      where: { email: "delegate-admin@teamguard.io" },
      update: {},
      create: {
        email: "delegate-admin@teamguard.io",
        username: "delegate_admin",
        name: "Delegate Admin",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
        isActive: true,
      },
    });
    createdUserIds.push(delegateUser.id);
    delegateToken = signAccessToken(delegateUser.id);

    // Create a Delegated Role in Acme Corp
    delegatedRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Delegated Manager ${Date.now()}`,
        slug: `delegated-mgr-${Date.now()}`,
        description: "Manager with roles:manage and members:manage but scoped domain privileges",
        isSystem: false,
      },
    });
    createdRoleIds.push(delegatedRole.id);

    // Find permissions to grant to Delegated Role:
    // roles:manage, members:manage, task:view, task:create, task:update:own, task:update:any, project:view, project:create
    const delegatedPerms = await prisma.permission.findMany({
      where: {
        OR: [
          { resource: "roles", action: "manage" },
          { resource: "members", action: "manage" },
          { resource: "task", action: "view" },
          { resource: "task", action: "create" },
          { resource: "task", action: "update:own" },
          { resource: "task", action: "update:any" },
          { resource: "project", action: "view" },
          { resource: "project", action: "create" },
        ],
      },
    });

    await prisma.rolePermission.createMany({
      data: delegatedPerms.map((p) => ({
        roleId: delegatedRole.id,
        permissionId: p.id,
      })),
    });

    // Bind Delegate User to Acme Corp with Delegated Role
    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: delegateUser.id,
          organizationId: acmeOrg.id,
        },
      },
      update: { status: "ACTIVE" },
      create: {
        userId: delegateUser.id,
        organizationId: acmeOrg.id,
        department: "Operations",
        status: "ACTIVE",
      },
    });

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: delegateUser.id,
          organizationId: acmeOrg.id,
        },
      },
    });

    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipRole.create({
      data: {
        membershipId: membership.id,
        roleId: delegatedRole.id,
      },
    });
  });

  after(async () => {
    for (const rId of createdRoleIds) {
      await prisma.rolePermission.deleteMany({ where: { roleId: rId } }).catch(() => {});
      await prisma.membershipRole.deleteMany({ where: { roleId: rId } }).catch(() => {});
      await prisma.role.delete({ where: { id: rId } }).catch(() => {});
    }

    for (const uId of createdUserIds) {
      await prisma.membershipRole.deleteMany({ where: { membership: { userId: uId } } }).catch(() => {});
      await prisma.membership.deleteMany({ where: { userId: uId } }).catch(() => {});
      await prisma.user.delete({ where: { id: uId } }).catch(() => {});
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetAuthRateLimiter();
  });

  // =========================================================================
  // REQ 1: Universal Privilege Delegation Barrier on Role Creation (Template Cloning)
  // =========================================================================
  test("REQ 1 [US-RBAC-006]: Actor cannot clone a template role containing privileges they do not hold", async () => {
    const superAdminRole = await prisma.role.findFirst({
      where: { slug: "super-admin", organizationId: acmeOrg.id },
    });

    const res = await fetch(`${baseUrl}/api/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegateToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: `Escalated Role ${Date.now()}`,
        description: "Attempting to clone Super Admin permissions",
        cloneFromRoleId: superAdminRole.id,
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.code, "DELEGATION_BARRIER_BREACH");
    assert.ok(Array.isArray(body.unauthorizedPermissions));
    assert.ok(body.unauthorizedPermissions.length > 0);
  });

  // =========================================================================
  // REQ 2: Delegation Barrier Allows Cloning Valid Subset
  // =========================================================================
  test("REQ 2 [US-RBAC-006]: Actor can clone a template role whose permissions are a subset of their own", async () => {
    // Team Member has dashboard:view, project:view, task:view, task:create, task:update:own, files:view, files:download, profile:read
    // Let's create a role with a strict subset of delegate's permissions (task:view, task:create)
    const subsetRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Task Worker Base ${Date.now()}`,
        slug: `task-worker-base-${Date.now()}`,
        isSystem: false,
      },
    });
    createdRoleIds.push(subsetRole.id);

    const taskPerm = await prisma.permission.findFirst({
      where: { resource: "task", action: "view" },
    });
    await prisma.rolePermission.create({
      data: { roleId: subsetRole.id, permissionId: taskPerm.id },
    });

    const res = await fetch(`${baseUrl}/api/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegateToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        name: `Cloned Worker ${Date.now()}`,
        cloneFromRoleId: subsetRole.id,
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(body.clonedPermissionCount, 1);
    createdRoleIds.push(body.role.id);
  });

  // =========================================================================
  // REQ 3: Delegation Barrier on Discrete Permission Toggling
  // =========================================================================
  test("REQ 3 [US-RBAC-006]: Actor cannot discretely grant a permission they do not personally possess", async () => {
    const targetRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Test Target Role ${Date.now()}`,
        slug: `target-role-${Date.now()}`,
        isSystem: false,
      },
    });
    createdRoleIds.push(targetRole.id);

    // Attempt to grant "audit:read" (which delegateUser does not have)
    const auditPerm = await prisma.permission.findFirst({
      where: { resource: "audit", action: "read" },
    });

    const res = await fetch(`${baseUrl}/api/permissions-matrix/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegateToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        roleId: targetRole.id,
        permissionId: auditPerm.id,
        enabled: true,
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.code, "DELEGATION_BARRIER_BREACH");
    assert.ok(body.unauthorizedPermissions.includes("audit:read"));
  });

  // =========================================================================
  // REQ 4: Discrete Permission Toggle Permitted for Possessed Permission
  // =========================================================================
  test("REQ 4 [US-RBAC-006]: Actor can discretely grant a permission they personally possess", async () => {
    const targetRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Sub-Role ${Date.now()}`,
        slug: `sub-role-${Date.now()}`,
        isSystem: false,
      },
    });
    createdRoleIds.push(targetRole.id);

    // Grant "task:create" (which delegateUser possesses)
    const taskCreatePerm = await prisma.permission.findFirst({
      where: { resource: "task", action: "create" },
    });

    const res = await fetch(`${baseUrl}/api/permissions-matrix/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegateToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        roleId: targetRole.id,
        permissionId: taskCreatePerm.id,
        enabled: true,
      }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.enabled, true);
  });

  // =========================================================================
  // REQ 5: Delegation Barrier on Module-Level Bulk Grant
  // =========================================================================
  test("REQ 5 [US-RBAC-006]: Bulk toggle (Select All) rejects grant if module contains unheld permissions", async () => {
    const targetRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Bulk Target ${Date.now()}`,
        slug: `bulk-target-${Date.now()}`,
        isSystem: false,
      },
    });
    createdRoleIds.push(targetRole.id);

    // Attempt bulk grant on "audit" module (delegateUser possesses 0 audit permissions)
    const res = await fetch(`${baseUrl}/api/roles/${targetRole.id}/modules/audit/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegateToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ enabled: true }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.code, "DELEGATION_BARRIER_BREACH");
  });

  // =========================================================================
  // REQ 6: Delegation Barrier on Replace Role Permissions (PUT /permissions)
  // =========================================================================
  test("REQ 6 [US-RBAC-006]: Replace permissions (PUT) rejects permissions outside caller authority", async () => {
    const targetRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Put Target ${Date.now()}`,
        slug: `put-target-${Date.now()}`,
        isSystem: false,
      },
    });
    createdRoleIds.push(targetRole.id);

    const auditPerm = await prisma.permission.findFirst({
      where: { resource: "audit", action: "read" },
    });

    const res = await fetch(`${baseUrl}/api/roles/${targetRole.id}/permissions`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegateToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ ids: [auditPerm.id] }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.code, "DELEGATION_BARRIER_BREACH");
  });

  // =========================================================================
  // REQ 7: Delegation Barrier on Member Role Reassignment (Privilege Escalation Prevention)
  // =========================================================================
  test("REQ 7 [US-RBAC-006]: Actor cannot reassign a member to a role with permissions exceeding their own", async () => {
    const member = await prisma.membership.findFirst({
      where: { userId: memberUser.id, organizationId: acmeOrg.id },
    });

    // Delegate attempts to reassign member to "Super Admin"
    const superAdminRole = await prisma.role.findFirst({
      where: { slug: "super-admin", organizationId: acmeOrg.id },
    });

    const res = await fetch(`${baseUrl}/api/members/${member.id}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegateToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ roleId: superAdminRole.id }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.code, "DELEGATION_BARRIER_BREACH");
    assert.ok(Array.isArray(body.unauthorizedPermissions));
  });

  // =========================================================================
  // REQ 8: Delegation Barrier Allows Member Assignment of Permissible Role
  // =========================================================================
  test("REQ 8 [US-RBAC-006]: Actor can assign a role whose permissions are within caller authority", async () => {
    const member = await prisma.membership.findFirst({
      where: { userId: memberUser.id, organizationId: acmeOrg.id },
    });

    // Create a sub-role with task:view only (held by delegateUser)
    const taskViewerRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Task Viewer ${Date.now()}`,
        slug: `task-viewer-${Date.now()}`,
        isSystem: false,
      },
    });
    createdRoleIds.push(taskViewerRole.id);

    const taskPerm = await prisma.permission.findFirst({
      where: { resource: "task", action: "view" },
    });
    await prisma.rolePermission.create({
      data: { roleId: taskViewerRole.id, permissionId: taskPerm.id },
    });

    const res = await fetch(`${baseUrl}/api/members/${member.id}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegateToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ roleId: taskViewerRole.id }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.member.roles[0].id, taskViewerRole.id);

    // Restore member role back to Team Member
    const teamMemberRole = await prisma.role.findFirst({
      where: { slug: "team-member", organizationId: acmeOrg.id },
    });
    await fetch(`${baseUrl}/api/members/${member.id}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ roleId: teamMemberRole.id }),
    });
  });

  // =========================================================================
  // REQ 9: Super Admin Unbounded Delegation
  // =========================================================================
  test("REQ 9 [US-RBAC-006]: Full Super Admin can assign any role and grant any permission", async () => {
    const targetRole = await prisma.role.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Admin Target ${Date.now()}`,
        slug: `admin-target-${Date.now()}`,
        isSystem: false,
      },
    });
    createdRoleIds.push(targetRole.id);

    const auditPerm = await prisma.permission.findFirst({
      where: { resource: "audit", action: "read" },
    });

    // Super Admin can grant audit:read
    const res = await fetch(`${baseUrl}/api/permissions-matrix/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        roleId: targetRole.id,
        permissionId: auditPerm.id,
        enabled: true,
      }),
    });

    assert.strictEqual(res.status, 200);
  });

  // =========================================================================
  // REQ 10: System Role Protection: Renaming Attempt Rejected
  // =========================================================================
  test("REQ 10 [US-RBAC-007 / TG-RBAC-008]: Attempting to rename a built-in system role returns HTTP 403", async () => {
    const systemRole = await prisma.role.findFirst({
      where: { slug: "team-member", organizationId: acmeOrg.id },
    });

    const res = await fetch(`${baseUrl}/api/roles/${systemRole.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ name: "Renamed Team Member" }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.code, "SYSTEM_ROLE_IMMUTABLE");
  });

  // =========================================================================
  // REQ 11: System Role Protection: Deletion Attempt Rejected
  // =========================================================================
  test("REQ 11 [US-RBAC-007 / TG-RBAC-008]: Attempting to delete a built-in system role returns HTTP 403", async () => {
    const systemRole = await prisma.role.findFirst({
      where: { slug: "super-admin", organizationId: acmeOrg.id },
    });

    const res = await fetch(`${baseUrl}/api/roles/${systemRole.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    const body = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(body.code, "SYSTEM_ROLE_IMMUTABLE");
  });

  // =========================================================================
  // REQ 12: System Role Description Update Allowed
  // =========================================================================
  test("REQ 12 [US-RBAC-007 / TG-RBAC-008]: Updating description metadata on system role is permitted", async () => {
    const systemRole = await prisma.role.findFirst({
      where: { slug: "team-member", organizationId: acmeOrg.id },
    });

    const originalDesc = systemRole.description;
    const newDesc = `Standard workspace team contributor (updated ${Date.now()})`;

    const res = await fetch(`${baseUrl}/api/roles/${systemRole.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ description: newDesc }),
    });

    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.role.description, newDesc);

    // Restore original description
    await fetch(`${baseUrl}/api/roles/${systemRole.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ description: originalDesc }),
    });
  });

  // =========================================================================
  // REQ 13: Super Admin Lockout Guard Immutability
  // =========================================================================
  test("REQ 13 [TASK-104 / BR-004 / SEC-05]: Super Admin role permissions cannot be revoked via any API", async () => {
    const superAdminRole = await prisma.role.findFirst({
      where: { slug: "super-admin", organizationId: acmeOrg.id },
    });

    const taskPerm = await prisma.permission.findFirst({
      where: { resource: "task", action: "view" },
    });

    // 1. Discrete toggle revocation attempt
    const res1 = await fetch(`${baseUrl}/api/permissions-matrix/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        roleId: superAdminRole.id,
        permissionId: taskPerm.id,
        enabled: false,
      }),
    });
    const body1 = await res1.json();
    assert.strictEqual(res1.status, 403);
    assert.strictEqual(body1.code, "SUPER_ADMIN_LOCKOUT_PROTECTION");

    // 2. Module bulk toggle revocation attempt
    const res2 = await fetch(`${baseUrl}/api/roles/${superAdminRole.id}/modules/task/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ enabled: false }),
    });
    const body2 = await res2.json();
    assert.strictEqual(res2.status, 403);
    assert.strictEqual(body2.code, "SUPER_ADMIN_LOCKOUT_PROTECTION");
  });

  // =========================================================================
  // REQ 14: Cross-Tenant Isolation (IDOR Defense)
  // =========================================================================
  test("REQ 14 [TASK-104]: Cross-tenant role modification or assignment returns HTTP 404", async () => {
    // Create role in Nova Labs
    const novaRole = await prisma.role.create({
      data: {
        organizationId: novaOrg.id,
        name: `Nova Private Role ${Date.now()}`,
        slug: `nova-priv-${Date.now()}`,
        isSystem: false,
      },
    });
    createdRoleIds.push(novaRole.id);

    // Caller from Acme Corp attempts to modify Nova role
    const res = await fetch(`${baseUrl}/api/roles/${novaRole.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({ description: "Malicious cross-tenant update" }),
    });

    assert.strictEqual(res.status, 404);
  });
});
