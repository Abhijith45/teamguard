import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { verifyAuditChainIntegrity } from "../src/services/platform.service.js";

let server;
let baseUrl;
let platformAdminUser;
let platformAdminToken;
let tenantOwnerUser;
let tenantOwnerToken;
let testOrg;
let testMemberUser;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // 1. Create or ensure a Platform Admin user (isPlatformAdmin: true)
  platformAdminUser = await prisma.user.upsert({
    where: { email: "platform-operator@teamguard.internal" },
    update: { isPlatformAdmin: true, isActive: true },
    create: {
      name: "Platform Operator",
      username: "platform_operator",
      email: "platform-operator@teamguard.internal",
      passwordHash: "mock-hash-platform-admin",
      isPlatformAdmin: true,
      isActive: true,
    },
  });
  platformAdminToken = signAccessToken(platformAdminUser.id);

  // 2. Fetch existing Acme Corp demo user who is tenant Super Admin but NOT platform admin
  const demoRes = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona: "super-admin", organizationSlug: "acme-corp" },
  });
  tenantOwnerUser = demoRes.data.user;
  tenantOwnerToken = demoRes.data.accessToken;

  // 3. Create an isolated test organization with System Roles for break-glass tests
  testOrg = await prisma.organization.create({
    data: {
      name: "Lockout Target Corp",
      slug: `lockout-corp-${Date.now()}`,
    },
  });

  // Create Super Admin role in testOrg
  const superAdminRole = await prisma.role.create({
    data: {
      organizationId: testOrg.id,
      name: "Super Admin",
      slug: "super-admin",
      isSystem: true,
    },
  });

  // Create an active member in testOrg (not currently Super Admin)
  testMemberUser = await prisma.user.create({
    data: {
      name: "Desginated Survivor",
      username: `survivor_${Date.now()}`,
      email: `survivor_${Date.now()}@lockout.internal`,
      passwordHash: "mock-hash-member",
      isPlatformAdmin: false,
      isActive: true,
    },
  });

  const memberRole = await prisma.role.create({
    data: {
      organizationId: testOrg.id,
      name: "Member",
      slug: "member",
      isSystem: true,
    },
  });

  const membership = await prisma.membership.create({
    data: {
      userId: testMemberUser.id,
      organizationId: testOrg.id,
      status: "ACTIVE",
    },
  });

  await prisma.membershipRole.create({
    data: {
      membershipId: membership.id,
      roleId: memberRole.id,
    },
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function api(path, options = {}) {
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

// ----------------------------------------------------------------------------
// US-PLAT-001: Global Tenant State Overview & RBAC Boundaries
// ----------------------------------------------------------------------------

test("REQ 1 [US-PLAT-001 AC 3]: Tenant Super Admin without platformAdmin claim receives HTTP 403 Forbidden", async () => {
  const res = await api("/api/v1/platform/tenants", {
    headers: {
      authorization: `Bearer ${tenantOwnerToken}`,
    },
  });

  assert.equal(res.status, 403, "Non-platform admin must be denied platform governance view");
  assert.equal(res.data.error, "Forbidden: Platform administrator privileges required");
});

test("REQ 2 [US-PLAT-001 AC 3]: Unauthenticated request receives HTTP 401 Unauthorized", async () => {
  const res = await api("/api/v1/platform/tenants");
  assert.equal(res.status, 401, "Unauthenticated request must be rejected");
});

test("REQ 3 [US-PLAT-001 AC 1]: Platform Super Admin can retrieve global tenant state overview with aggregates", async () => {
  const res = await api("/api/v1/platform/tenants", {
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
    },
  });

  assert.equal(res.status, 200, "Platform admin should successfully fetch tenants overview");
  assert.ok(res.data.metrics, "Metrics aggregate must be present");
  assert.ok(typeof res.data.metrics.totalTenants === "number", "totalTenants must be numeric");
  assert.ok(typeof res.data.metrics.activeTenants === "number", "activeTenants must be numeric");
  assert.ok(typeof res.data.metrics.suspendedTenants === "number", "suspendedTenants must be numeric");
  assert.ok(typeof res.data.metrics.totalUsers === "number", "totalUsers must be numeric");
  assert.ok(Array.isArray(res.data.tenants), "tenants must be an array");
  assert.ok(res.data.tenants.length > 0, "At least one tenant should exist");
});

test("REQ 4 [US-PLAT-001 AC 1 & 2]: Global overview response does NOT leak customer tasks, comments, or file assets", async () => {
  const res = await api("/api/v1/platform/tenants", {
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
    },
  });

  assert.equal(res.status, 200);
  for (const tenant of res.data.tenants) {
    assert.equal(tenant.tasks, undefined, "Tenant tasks must never be included in platform overview");
    assert.equal(tenant.files, undefined, "Tenant files must never be included in platform overview");
    assert.equal(tenant.comments, undefined, "Tenant comments must never be included in platform overview");
    assert.ok(tenant.activeMemberCount !== undefined, "Tenant active member count should be aggregated");
  }
});

test("REQ 5 [US-PLAT-001 AC 2]: Platform Super Admin cannot access tenant tasks or files without organization membership", async () => {
  // Platform admin attempts to query Acme Corp tasks without being a member of Acme Corp
  const acmeCorp = await prisma.organization.findUnique({
    where: { slug: "acme-corp" },
  });

  const res = await api("/api/tasks", {
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
      "x-organization-id": String(acmeCorp.id),
    },
  });

  assert.equal(res.status, 403, "Platform admin without tenant membership must receive 403");
  assert.ok(
    res.data.error.includes("not an active member of this organization"),
    "Must fail-closed when caller is not an active member"
  );
});

// ----------------------------------------------------------------------------
// US-PLAT-001: Tenant Suspension & Activation Management
// ----------------------------------------------------------------------------

test("REQ 6 [US-PLAT-001]: Platform Super Admin can suspend and reactivate a tenant", async () => {
  // 1. Suspend the test organization
  const suspendRes = await api(`/api/v1/platform/tenants/${testOrg.id}/status`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
    },
    body: {
      isSuspended: true,
      reason: "Security audit compliance hold",
    },
  });

  assert.equal(suspendRes.status, 200, "Should successfully suspend tenant");
  assert.equal(suspendRes.data.organization.isSuspended, true);
  assert.equal(suspendRes.data.organization.suspensionReason, "Security audit compliance hold");
  assert.ok(suspendRes.data.auditLog, "Suspension must emit PlatformAuditLog entry");

  // 2. Reactivate the test organization
  const reactivateRes = await api(`/api/v1/platform/tenants/${testOrg.id}/status`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
    },
    body: {
      isSuspended: false,
      reason: "Compliance hold cleared",
    },
  });

  assert.equal(reactivateRes.status, 200, "Should successfully reactivate tenant");
  assert.equal(reactivateRes.data.organization.isSuspended, false);
});

test("REQ 7 [US-PLAT-001]: Tenant suspension blocks access for tenant members with HTTP 403", async () => {
  // Suspend testOrg
  await api(`/api/v1/platform/tenants/${testOrg.id}/status`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${platformAdminToken}` },
    body: { isSuspended: true, reason: "Administrative hold" },
  });

  const memberToken = signAccessToken(testMemberUser.id);

  // Member attempts to access projects in suspended tenant
  const accessRes = await api("/api/projects", {
    headers: {
      authorization: `Bearer ${memberToken}`,
      "x-organization-id": String(testOrg.id),
    },
  });

  assert.equal(accessRes.status, 403, "Suspended organization must block member requests");
  assert.ok(
    accessRes.data.error.includes("suspended"),
    "Error message must specify organization is suspended"
  );

  // Restore active state
  await api(`/api/v1/platform/tenants/${testOrg.id}/status`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${platformAdminToken}` },
    body: { isSuspended: false, reason: "Restored" },
  });
});

// ----------------------------------------------------------------------------
// US-PLAT-002: MFA Step-Up Token Verification
// ----------------------------------------------------------------------------

test("REQ 8 [US-PLAT-002 AC 1]: Submitting break-glass recovery without MFA token returns HTTP 401 Unauthorized", async () => {
  const res = await api("/api/v1/platform/break-glass", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
    },
    body: {
      targetOrganizationId: testOrg.id,
      designatedMemberId: testMemberUser.id,
      ticketId: "TG-982401",
      justification: "Primary tenant administrator departed the company without handing off credentials.",
    },
  });

  assert.equal(res.status, 401, "MFA step-up must be mandatory for break-glass recovery");
  assert.equal(res.data.error, "MFA step-up authentication required");
});

test("REQ 9 [US-PLAT-002]: MFA step-up verification rejects invalid TOTP codes with HTTP 401", async () => {
  const res = await api("/api/v1/platform/mfa/verify", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
    },
    body: {
      totpCode: "000000",
      targetOrganizationId: testOrg.id,
    },
  });

  assert.equal(res.status, 401, "Invalid TOTP code must be rejected");
  assert.equal(res.data.error, "Invalid MFA TOTP verification code");
});

test("REQ 10 [US-PLAT-002]: MFA step-up verification issues valid ephemeral token with 5-minute expiry", async () => {
  const res = await api("/api/v1/platform/mfa/verify", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
    },
    body: {
      totpCode: "123456",
      targetOrganizationId: testOrg.id,
    },
  });

  assert.equal(res.status, 200, "Valid TOTP code must issue step-up token");
  assert.ok(res.data.mfaToken, "mfaToken must be returned");
  assert.equal(res.data.expiresInSeconds, 300, "MFA token must have 300s (5m) validity window");
  assert.ok(res.data.nonce, "Single-use nonce must be returned");
});

// ----------------------------------------------------------------------------
// US-PLAT-002: Break-Glass Validation Safeguards
// ----------------------------------------------------------------------------

test("REQ 11 [US-PLAT-002 AC 2]: Break-glass request with invalid ITSM ticket format returns HTTP 422 Unprocessable Entity", async () => {
  // First obtain valid MFA token
  const mfaRes = await api("/api/v1/platform/mfa/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${platformAdminToken}` },
    body: { totpCode: "123456", targetOrganizationId: testOrg.id },
  });

  const res = await api("/api/v1/platform/break-glass", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
      "x-mfa-token": mfaRes.data.mfaToken,
    },
    body: {
      targetOrganizationId: testOrg.id,
      designatedMemberId: testMemberUser.id,
      ticketId: "INVALID-TICKET-FORMAT",
      justification: "Primary tenant administrator departed the company without handing off credentials.",
    },
  });

  assert.equal(res.status, 422, "Invalid ticket format must be rejected with 422");
  assert.ok(res.data.error.includes("Invalid ITSM ticket reference format"));
});

test("REQ 12 [US-PLAT-002 AC 2]: Break-glass request with justification < 20 characters returns HTTP 422 Unprocessable Entity", async () => {
  const mfaRes = await api("/api/v1/platform/mfa/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${platformAdminToken}` },
    body: { totpCode: "123456", targetOrganizationId: testOrg.id },
  });

  const res = await api("/api/v1/platform/break-glass", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
      "x-mfa-token": mfaRes.data.mfaToken,
    },
    body: {
      targetOrganizationId: testOrg.id,
      designatedMemberId: testMemberUser.id,
      ticketId: "TG-104928",
      justification: "Too short",
    },
  });

  assert.equal(res.status, 422, "Justification shorter than 20 chars must be rejected with 422");
  assert.ok(res.data.error.includes("Justification must be at least 20 characters"));
});

test("REQ 13 [US-PLAT-002 AC 3]: Break-glass request for non-member recipient returns HTTP 400 Bad Request", async () => {
  // Create an arbitrary user who has NO membership in testOrg
  const nonMember = await prisma.user.create({
    data: {
      name: "Outsider",
      username: `outsider_${Date.now()}`,
      email: `outsider_${Date.now()}@foreign.internal`,
      passwordHash: "mock-hash",
    },
  });

  const mfaRes = await api("/api/v1/platform/mfa/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${platformAdminToken}` },
    body: { totpCode: "123456", targetOrganizationId: testOrg.id },
  });

  const res = await api("/api/v1/platform/break-glass", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
      "x-mfa-token": mfaRes.data.mfaToken,
    },
    body: {
      targetOrganizationId: testOrg.id,
      designatedMemberId: nonMember.id,
      ticketId: "TG-104928",
      justification: "Emergency ownership restoration authorized by enterprise support ticket.",
    },
  });

  assert.equal(res.status, 400, "Non-member target must be rejected with HTTP 400");
  assert.equal(
    res.data.error,
    "Designated owner must be an existing active member of the organization"
  );
});

// ----------------------------------------------------------------------------
// US-PLAT-002: Successful Emergency Break-Glass Execution & Audit Trail
// ----------------------------------------------------------------------------

test("REQ 14 [US-PLAT-002 AC 4, 5, 6]: Successful break-glass recovery atomically assigns Super Admin, writes hash-chained audit log, and creates outbox alert", async () => {
  const mfaRes = await api("/api/v1/platform/mfa/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${platformAdminToken}` },
    body: { totpCode: "123456", targetOrganizationId: testOrg.id },
  });

  const res = await api("/api/v1/platform/break-glass", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
      "x-mfa-token": mfaRes.data.mfaToken,
    },
    body: {
      targetOrganizationId: testOrg.id,
      designatedMemberId: testMemberUser.id,
      ticketId: "TG-550291",
      justification: "Sole active administrative account departed company; designated replacement confirmed by CISO.",
    },
  });

  assert.equal(res.status, 200, "Break glass recovery should execute successfully");
  assert.equal(res.data.success, true);
  assert.ok(res.data.auditLogId, "Audit log ID must be returned");
  assert.ok(res.data.currentHash, "Cryptographic hash must be returned");
  assert.equal(res.data.designatedMemberId, testMemberUser.id);
  assert.equal(res.data.alertStatus, "DISPATCHED");

  // Verify designated member now has Super Admin role in testOrg
  const updatedMembership = await prisma.membership.findFirst({
    where: { userId: testMemberUser.id, organizationId: testOrg.id },
    include: { roles: { include: { role: true } } },
  });

  const hasSuperAdmin = updatedMembership.roles.some((r) => r.role.slug === "super-admin");
  assert.equal(hasSuperAdmin, true, "Designated member must now hold Super Admin role");

  // Verify PlatformAuditLog record is present with SHA-256 hash
  const auditEntry = await prisma.platformAuditLog.findUnique({
    where: { id: res.data.auditLogId },
  });
  assert.ok(auditEntry, "Audit log record must exist in database");
  assert.equal(auditEntry.action, "BREAK_GLASS_OWNER_REASSIGNMENT");
  assert.equal(auditEntry.ticketId, "TG-550291");
  assert.equal(auditEntry.targetOrganizationId, testOrg.id);
  assert.ok(auditEntry.prevLogHash, "prevLogHash must be present");
  assert.ok(auditEntry.currentHash, "currentHash must be present");

  // Verify BreakGlassAlertOutbox record exists
  const outboxEntry = await prisma.breakGlassAlertOutbox.findFirst({
    where: {
      targetOrganizationId: testOrg.id,
      ticketId: "TG-550291",
    },
  });
  assert.ok(outboxEntry, "BreakGlassAlertOutbox entry must exist");
  assert.equal(outboxEntry.status, "DISPATCHED");
  assert.equal(outboxEntry.designatedMemberId, testMemberUser.id);
});

test("REQ 15 [US-PLAT-002]: Reusing single-use MFA step-up token is rejected with HTTP 401 (Replay Attack Guard)", async () => {
  // 1. Generate MFA token
  const mfaRes = await api("/api/v1/platform/mfa/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${platformAdminToken}` },
    body: { totpCode: "123456", targetOrganizationId: testOrg.id },
  });

  // 2. Use it once
  const firstUse = await api("/api/v1/platform/break-glass", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
      "x-mfa-token": mfaRes.data.mfaToken,
    },
    body: {
      targetOrganizationId: testOrg.id,
      designatedMemberId: testMemberUser.id,
      ticketId: "TG-778899",
      justification: "Secondary break-glass execution test for replay attack defense.",
    },
  });
  assert.equal(firstUse.status, 200, "First execution should succeed");

  // 3. Attempt replay with identical MFA token
  const replayAttempt = await api("/api/v1/platform/break-glass", {
    method: "POST",
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
      "x-mfa-token": mfaRes.data.mfaToken,
    },
    body: {
      targetOrganizationId: testOrg.id,
      designatedMemberId: testMemberUser.id,
      ticketId: "TG-778899",
      justification: "Replay attempt using the previously exhausted MFA step-up token.",
    },
  });

  assert.equal(replayAttempt.status, 401, "Replayed MFA token must be rejected with 401");
  assert.ok(
    replayAttempt.data.error.includes("already been used"),
    "Error must indicate single-use replay protection"
  );
});

test("REQ 16 [UD-001 / Non-Repudiation]: Cryptographic SHA-256 audit log chain passes end-to-end integrity verification", async () => {
  // Query audit logs endpoint
  const res = await api("/api/v1/platform/audit-logs", {
    headers: {
      authorization: `Bearer ${platformAdminToken}`,
    },
  });

  assert.equal(res.status, 200, "Platform audit logs should be retrieved successfully");
  assert.ok(res.data.logs.length > 0, "Audit logs must contain executed actions");
  assert.equal(res.data.integrity.chainValid, true, "Entire cryptographic hash chain must be valid");
  assert.ok(res.data.integrity.verifiedRecordCount > 0, "Must verify all logged records");

  // Service-level direct integrity verification
  const serviceCheck = await verifyAuditChainIntegrity();
  assert.equal(serviceCheck.chainValid, true, "Service integrity check must pass");
});
