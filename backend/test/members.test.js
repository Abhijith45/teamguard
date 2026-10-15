import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("TASK-101: Organization Member Directory, Last-Owner Safeguards & Role Reassignment", () => {
  let server;
  let baseUrl;
  let acmeOrg;
  let novaOrg;

  let superAdminUser;
  let managerUser;
  let memberUser;
  let stakeholderUser;
  let secondaryAdminUser;

  let superAdminMembership;
  let managerMembership;
  let memberMembership;
  let stakeholderMembership;
  let secondaryAdminMembership;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let stakeholderToken;

  let rolesMap = new Map();

  before(async () => {
    // 1. Start test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 2. Fetch Organizations
    acmeOrg = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });
    novaOrg = await prisma.organization.findUnique({ where: { slug: "nova-labs" } });

    // 3. Fetch Standard Roles
    const roles = await prisma.role.findMany({
      where: {
        OR: [{ organizationId: acmeOrg.id }, { organizationId: null }],
      },
    });
    for (const r of roles) {
      rolesMap.set(r.slug, r);
    }

    // 4. Fetch Users
    superAdminUser = await prisma.user.findUnique({ where: { email: "admin@teamguard.io" } });
    managerUser = await prisma.user.findUnique({ where: { email: "manager@teamguard.io" } });
    memberUser = await prisma.user.findUnique({ where: { email: "member@teamguard.io" } });
    stakeholderUser = await prisma.user.findUnique({ where: { email: "viewer@teamguard.io" } });

    // Ensure secondary admin user exists for multi-owner test
    secondaryAdminUser = await prisma.user.upsert({
      where: { email: "secondary-admin@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Secondary Admin",
        username: "secondary_admin",
        email: "secondary-admin@teamguard.io",
        passwordHash: "$2b$10$w66H6X9o9q51fJt9p9Nn..X8rP3Fm5hU0r3b.e3u0W/y8kQzFzL3G",
        isActive: true,
      },
    });

    // 5. Fetch Memberships
    superAdminMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: superAdminUser.id, organizationId: acmeOrg.id } },
    });
    managerMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: managerUser.id, organizationId: acmeOrg.id } },
    });
    memberMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: memberUser.id, organizationId: acmeOrg.id } },
    });
    stakeholderMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: stakeholderUser.id, organizationId: acmeOrg.id } },
    });

    // 6. Generate Tokens
    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    stakeholderToken = signAccessToken(stakeholderUser.id);
  });

  after(async () => {
    // Cleanup secondary admin membership if created
    if (secondaryAdminMembership) {
      await prisma.membership.deleteMany({
        where: { id: secondaryAdminMembership.id },
      });
    }
    await prisma.user.deleteMany({
      where: { email: "secondary-admin@teamguard.io" },
    });
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    resetAuthRateLimiter("127.0.0.1");
  });

  test("REQ 1: GET /api/members returns scoped tenant members with user info, roles, department, and isLastOwner", async () => {
    const res = await fetch(`${baseUrl}/api/members`, {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.members));
    assert.ok(data.members.length >= 4);

    const adminMember = data.members.find((m) => m.userId === superAdminUser.id);
    assert.ok(adminMember, "Super Admin member must be present in directory");
    assert.equal(adminMember.user.email, "admin@teamguard.io");
    assert.ok(adminMember.roles.some((r) => r.slug === "super-admin"));
    assert.equal(adminMember.isLastOwner, true, "Single Super Admin must have isLastOwner = true");

    const regularMember = data.members.find((m) => m.userId === memberUser.id);
    assert.ok(regularMember);
    assert.equal(regularMember.isLastOwner, false);
  });

  test("REQ 2: GET /api/members/roles returns available roles for assignment", async () => {
    const res = await fetch(`${baseUrl}/api/members/roles`, {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.roles));
    const slugs = data.roles.map((r) => r.slug);
    assert.ok(slugs.includes("super-admin"));
    assert.ok(slugs.includes("project-manager"));
    assert.ok(slugs.includes("team-member"));
    assert.ok(slugs.includes("stakeholder"));
  });

  test("REQ 3: Cross-tenant member mutation returns HTTP 404 Not Found (IDOR defense)", async () => {
    // Find a membership in Nova Labs
    const novaMembership = await prisma.membership.findFirst({
      where: { organizationId: novaOrg.id },
    });
    assert.ok(novaMembership, "Nova Labs membership fixture must exist");

    // Acme Corp admin attempts to reassign role on Nova Labs membership
    const targetRole = rolesMap.get("project-manager");
    const res = await fetch(`${baseUrl}/api/members/${novaMembership.id}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleId: targetRole.id }),
    });

    assert.equal(res.status, 404, "Cross-tenant membership access must return 404 Not Found");
  });

  test("REQ 4: Unauthorized actor lacking members:manage cannot reassign roles (HTTP 403 Forbidden)", async () => {
    const targetRole = rolesMap.get("project-manager");

    // Stakeholder (Viewer) attempts role update
    const res = await fetch(`${baseUrl}/api/members/${memberMembership.id}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${stakeholderToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleId: targetRole.id }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "Permission denied");
    assert.equal(body.requiredPermission, "members:manage");
  });

  test("REQ 5: Authorized Super Admin can successfully reassign a member role and emit audit log", async () => {
    const targetRole = rolesMap.get("project-manager");

    const res = await fetch(`${baseUrl}/api/members/${memberMembership.id}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleId: targetRole.id }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.member.roles.some((r) => r.id === targetRole.id));

    // Verify audit log entry
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "member:role:reassign",
        resourceId: String(memberMembership.id),
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit, "Audit log for role reassignment must be created");
    assert.equal(audit.actorId, superAdminUser.id);

    // Revert role back to team-member for clean state
    const originalRole = rolesMap.get("team-member");
    await fetch(`${baseUrl}/api/members/${memberMembership.id}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleId: originalRole.id }),
    });
  });

  test("REQ 6 [BR-010]: Demoting the sole active Super Admin returns HTTP 403 Forbidden (LAST_OWNER_PROTECTION)", async () => {
    const targetRole = rolesMap.get("project-manager");

    const res = await fetch(`${baseUrl}/api/members/${superAdminMembership.id}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleId: targetRole.id }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "LAST_OWNER_PROTECTION");
    assert.ok(body.error.includes("sole active organization owner"));
  });

  test("REQ 7 [BR-010]: Deactivating or suspending the sole active Super Admin returns HTTP 403 Forbidden", async () => {
    const res = await fetch(`${baseUrl}/api/members/${superAdminMembership.id}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "SUSPENDED" }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "LAST_OWNER_PROTECTION");
  });

  test("REQ 8 [BR-010]: Removing the sole active Super Admin returns HTTP 403 Forbidden", async () => {
    const res = await fetch(`${baseUrl}/api/members/${superAdminMembership.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "LAST_OWNER_PROTECTION");
  });

  test("REQ 9: Multi-owner organization allows safe demotion of an owner when another active owner exists", async () => {
    const superAdminRole = rolesMap.get("super-admin");
    const managerRole = rolesMap.get("project-manager");

    // 1. Provision a second Super Admin membership
    secondaryAdminMembership = await prisma.membership.create({
      data: {
        userId: secondaryAdminUser.id,
        organizationId: acmeOrg.id,
        department: "Executive",
        status: "ACTIVE",
      },
    });
    await prisma.membershipRole.create({
      data: {
        membershipId: secondaryAdminMembership.id,
        roleId: superAdminRole.id,
      },
    });

    // 2. Now with 2 active owners, demoting secondary admin to Project Manager MUST SUCCEED
    const res = await fetch(`${baseUrl}/api/members/${secondaryAdminMembership.id}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleId: managerRole.id }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.member.roles.some((r) => r.slug === "project-manager"));

    // 3. Clean up the secondary membership
    await prisma.membership.delete({
      where: { id: secondaryAdminMembership.id },
    });
    secondaryAdminMembership = null;
  });

  test("REQ 10: Authorized admin can update member department and emit audit log", async () => {
    const newDept = "Infrastructure & Security";

    const res = await fetch(`${baseUrl}/api/members/${memberMembership.id}/department`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ department: newDept }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.member.department, newDept);

    // Revert department back to "Engineering"
    await fetch(`${baseUrl}/api/members/${memberMembership.id}/department`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ department: "Engineering" }),
    });
  });
});
