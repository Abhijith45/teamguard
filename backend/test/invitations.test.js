import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "crypto";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import {
  getDeliveredEmails,
  clearDeliveredEmails,
  getLastDeliveredEmail,
} from "../src/services/email.service.js";

describe("TASK-505: Transactional Email Member Invitations via Resend (UD-005)", () => {
  let server;
  let baseUrl;
  let acmeOrg;
  let novaOrg;

  let superAdminUser;
  let managerUser;
  let memberUser;
  let invitedCollaborator;
  let mismatchedCollaborator;
  let delegatedManager;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let invitedToken;
  let mismatchedToken;
  let delegatedManagerToken;
  let novaAdminToken;

  let superAdminRole;
  let teamMemberRole;
  let projectManagerRole;

  const testUserIds = [];
  const testInvitationIds = [];

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

    superAdminRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, name: "Super Admin" },
    });
    projectManagerRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, name: "Project Manager" },
    });
    teamMemberRole = await prisma.role.findFirst({
      where: { organizationId: acmeOrg.id, name: "Team Member" },
    });

    // 1. Create a collaborator user to accept invitations
    invitedCollaborator = await prisma.user.upsert({
      where: { email: "invitee@collaborator.io" },
      update: {},
      create: {
        email: "invitee@collaborator.io",
        username: "invitee_collab",
        name: "Invited Collaborator",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
        isActive: true,
      },
    });
    testUserIds.push(invitedCollaborator.id);

    // 2. Create another user with mismatched email to test identity invariant
    mismatchedCollaborator = await prisma.user.upsert({
      where: { email: "intruder@mismatch.io" },
      update: {},
      create: {
        email: "intruder@mismatch.io",
        username: "intruder_mismatch",
        name: "Mismatched User",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
        isActive: true,
      },
    });
    testUserIds.push(mismatchedCollaborator.id);

    // 3. Create a delegated manager user who has members:manage but lacks roles:manage or audit:read
    delegatedManager = await prisma.user.upsert({
      where: { email: "delegated-lead@teamguard.io" },
      update: {},
      create: {
        email: "delegated-lead@teamguard.io",
        username: "delegated_lead",
        name: "Delegated Lead",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
        isActive: true,
      },
    });
    testUserIds.push(delegatedManager.id);

    // Give delegated lead a custom role in Acme Corp that has members:manage and task:* but NOT roles:manage
    const customLeadRole = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: acmeOrg.id, name: "Delegated Lead" } },
      update: {},
      create: {
        organizationId: acmeOrg.id,
        name: "Delegated Lead",
        slug: "delegated-lead",
        description: "Can manage members and tasks but cannot manage roles",
      },
    });

    const membersManagePerm = await prisma.permission.findFirst({
      where: { resource: "members", action: "manage" },
    });
    const taskViewPerm = await prisma.permission.findFirst({
      where: { resource: "task", action: "view" },
    });
    const taskCreatePerm = await prisma.permission.findFirst({
      where: { resource: "task", action: "create" },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: customLeadRole.id } });
    if (membersManagePerm) {
      await prisma.rolePermission.create({
        data: { roleId: customLeadRole.id, permissionId: membersManagePerm.id },
      });
    }
    if (taskViewPerm) {
      await prisma.rolePermission.create({
        data: { roleId: customLeadRole.id, permissionId: taskViewPerm.id },
      });
    }
    if (taskCreatePerm) {
      await prisma.rolePermission.create({
        data: { roleId: customLeadRole.id, permissionId: taskCreatePerm.id },
      });
    }

    const leadMembership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: delegatedManager.id, organizationId: acmeOrg.id } },
      update: { status: "ACTIVE" },
      create: {
        userId: delegatedManager.id,
        organizationId: acmeOrg.id,
        status: "ACTIVE",
        department: "Operations",
      },
    });
    await prisma.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId: leadMembership.id, roleId: customLeadRole.id } },
      update: {},
      create: { membershipId: leadMembership.id, roleId: customLeadRole.id },
    });

    // Create Nova Admin who has members:manage in Nova Labs to verify cross-tenant IDOR defense
    const novaSuperAdminRole = await prisma.role.findFirst({
      where: { organizationId: novaOrg.id, name: "Super Admin" },
    });
    const novaAdminUser = await prisma.user.upsert({
      where: { email: "nova-admin@teamguard.io" },
      update: {},
      create: {
        email: "nova-admin@teamguard.io",
        username: "nova_admin",
        name: "Nova Admin",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
        isActive: true,
      },
    });
    testUserIds.push(novaAdminUser.id);
    const novaMembership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: novaAdminUser.id, organizationId: novaOrg.id } },
      update: { status: "ACTIVE" },
      create: {
        userId: novaAdminUser.id,
        organizationId: novaOrg.id,
        status: "ACTIVE",
        department: "Executive",
      },
    });
    await prisma.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId: novaMembership.id, roleId: novaSuperAdminRole.id } },
      update: {},
      create: { membershipId: novaMembership.id, roleId: novaSuperAdminRole.id },
    });

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    invitedToken = signAccessToken(invitedCollaborator.id);
    mismatchedToken = signAccessToken(mismatchedCollaborator.id);
    delegatedManagerToken = signAccessToken(delegatedManager.id);
    novaAdminToken = signAccessToken(novaAdminUser.id);
  });

  after(async () => {
    // Cleanup invitations and created test records
    await prisma.membershipInvitation.deleteMany({
      where: { id: { in: testInvitationIds } },
    });
    await prisma.membershipRole.deleteMany({
      where: { membership: { userId: { in: testUserIds } } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: testUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: testUserIds } },
    });

    server.close();
  });

  beforeEach(() => {
    clearDeliveredEmails();
  });

  // TEST 1: Invitation Dispatch (US-INV-001 / TG-INV-001)
  test("REQ 1 [US-INV-001 / TG-INV-001]: Admin creates invitation returning 201 with single-use token and 7-day expiry", async () => {
    const invitePayload = {
      email: "newuser1@collaborator.io",
      roleId: teamMemberRole.id,
      department: "Frontend Engineering",
    };

    const res = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify(invitePayload),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.message, "Invitation dispatched successfully");
    assert.ok(body.token, "Raw single-use token must be returned");
    assert.ok(body.inviteUrl, "Full invite URL must be returned");
    assert.ok(body.inviteUrl.includes(body.token), "Invite URL must include raw token");
    assert.equal(body.invitation.email, "newuser1@collaborator.io");
    assert.equal(body.invitation.status, "PENDING");
    assert.equal(body.invitation.roleId, teamMemberRole.id);
    assert.equal(body.invitation.department, "Frontend Engineering");
    assert.equal(body.invitation.tokenHash, undefined, "tokenHash must NOT be exposed in response");

    testInvitationIds.push(body.invitation.id);

    // Verify cryptographic SHA-256 token hash stored in database
    const dbRecord = await prisma.membershipInvitation.findUnique({
      where: { id: body.invitation.id },
    });
    assert.ok(dbRecord);
    const expectedHash = crypto.createHash("sha256").update(body.token).digest("hex");
    assert.equal(dbRecord.tokenHash, expectedHash);

    // Verify 7-day expiration window (~7 days from now)
    const expiryDiffDays = (new Date(dbRecord.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24);
    assert.ok(expiryDiffDays > 6.9 && expiryDiffDays <= 7.05, "Expiry must be 7 days from creation");

    // Verify email was dispatched into outbox
    const delivered = getLastDeliveredEmail();
    assert.ok(delivered);
    assert.equal(delivered.to, "newuser1@collaborator.io");
    assert.ok(delivered.html.includes(body.inviteUrl));
    assert.ok(delivered.html.includes("Acme Corp"));

    // Verify structured audit log entry emitted
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "INVITATION_CREATE",
        resourceId: String(body.invitation.id),
      },
    });
    assert.ok(auditLog);
    assert.equal(auditLog.actorId, superAdminUser.id);
  });

  // TEST 2: Active Member Re-Invitation Guard
  test("REQ 2 [US-INV-001 / Invariant]: User already an active member cannot be invited (HTTP 400)", async () => {
    const res = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: memberUser.email, // Already an active member in Acme Corp
        roleId: teamMemberRole.id,
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "User is already a member of this organization");
  });

  // TEST 3: Privilege Delegation Barrier (US-RBAC-006 / US-INV-001)
  test("REQ 3 [US-INV-001 / Delegation Barrier]: Delegated actor cannot invite a member with role exceeding their authority (HTTP 403)", async () => {
    // delegatedManager has members:manage and task:* but NOT roles:manage or superAdmin privileges.
    // Attempting to invite someone as Super Admin must fail with HTTP 403 DELEGATION_BARRIER_BREACH.
    const res = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${delegatedManagerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: "delegated-escalation@collaborator.io",
        roleId: superAdminRole.id,
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.code, "DELEGATION_BARRIER_BREACH");
    assert.ok(body.error.includes("Privilege Delegation Barrier"));
    assert.ok(Array.isArray(body.unauthorizedPermissions));
  });

  // TEST 4: Invitation Acceptance (US-INV-002 / TG-INV-001)
  test("REQ 4 [US-INV-002 / TG-INV-001]: Collaborator accepts invitation with matching email, creating active membership", async () => {
    // 1. Admin creates invitation for invitedCollaborator's email
    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: invitedCollaborator.email,
        roleId: teamMemberRole.id,
        department: "Design Systems",
      }),
    });
    const inviteBody = await inviteRes.json();
    assert.equal(inviteRes.status, 201);
    testInvitationIds.push(inviteBody.invitation.id);

    // 2. Invited collaborator accepts the invitation
    const acceptRes = await fetch(`${baseUrl}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invitedToken}`,
      },
      body: JSON.stringify({
        token: inviteBody.token,
      }),
    });

    const acceptBody = await acceptRes.json();
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptBody.success, true);
    assert.equal(acceptBody.message, "Invitation accepted successfully");
    assert.equal(acceptBody.membership.userId, invitedCollaborator.id);
    assert.equal(acceptBody.membership.organizationId, acmeOrg.id);
    assert.equal(acceptBody.membership.department, "Design Systems");
    assert.equal(acceptBody.membership.status, "ACTIVE");

    // 3. Verify invitation marked ACCEPTED in DB
    const dbInvite = await prisma.membershipInvitation.findUnique({
      where: { id: inviteBody.invitation.id },
    });
    assert.equal(dbInvite.status, "ACCEPTED");
    assert.equal(dbInvite.acceptedById, invitedCollaborator.id);
    assert.ok(dbInvite.acceptedAt);

    // 4. Verify membership and role created in DB
    const dbMembershipRole = await prisma.membershipRole.findFirst({
      where: {
        membership: { userId: invitedCollaborator.id, organizationId: acmeOrg.id },
        roleId: teamMemberRole.id,
      },
    });
    assert.ok(dbMembershipRole, "MembershipRole binding must exist");

    // 5. Verify audit log entry
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: acmeOrg.id,
        action: "INVITATION_ACCEPT",
        resourceId: String(inviteBody.invitation.id),
      },
    });
    assert.ok(auditLog);
    assert.equal(auditLog.actorId, invitedCollaborator.id);
  });

  // TEST 5: Identity Matching Invariant (US-INV-002)
  test("REQ 5 [US-INV-002 / Identity Guard]: Collaborator with mismatched email is rejected (HTTP 403)", async () => {
    // 1. Create invitation for test-identity@collaborator.io
    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: "targeted-user@collaborator.io",
        roleId: teamMemberRole.id,
      }),
    });
    const inviteBody = await inviteRes.json();
    assert.equal(inviteRes.status, 201);
    testInvitationIds.push(inviteBody.invitation.id);

    // 2. Mismatched collaborator tries to accept with their session
    const acceptRes = await fetch(`${baseUrl}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mismatchedToken}`, // email: intruder@mismatch.io
      },
      body: JSON.stringify({
        token: inviteBody.token,
      }),
    });

    const acceptBody = await acceptRes.json();
    assert.equal(acceptRes.status, 403);
    assert.equal(acceptBody.error, "This invitation was sent to a different email address");

    // Verify invitation is still PENDING
    const dbInvite = await prisma.membershipInvitation.findUnique({
      where: { id: inviteBody.invitation.id },
    });
    assert.equal(dbInvite.status, "PENDING");
  });

  // TEST 6: Expired Token Rejection (US-INV-002)
  test("REQ 6 [US-INV-002 / Expiry]: Expired invitation token (> 7 days) returns HTTP 400 Bad Request", async () => {
    // 1. Create invitation
    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: mismatchedCollaborator.email,
        roleId: teamMemberRole.id,
      }),
    });
    const inviteBody = await inviteRes.json();
    testInvitationIds.push(inviteBody.invitation.id);

    // 2. Artificially backdate expiresAt in DB by 8 days
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await prisma.membershipInvitation.update({
      where: { id: inviteBody.invitation.id },
      data: { expiresAt: eightDaysAgo },
    });

    // 3. Attempt acceptance
    const acceptRes = await fetch(`${baseUrl}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mismatchedToken}`,
      },
      body: JSON.stringify({
        token: inviteBody.token,
      }),
    });

    const acceptBody = await acceptRes.json();
    assert.equal(acceptRes.status, 400);
    assert.equal(acceptBody.error, "Invitation has expired");
  });

  // TEST 7: Single-Use Invariant (US-INV-002)
  test("REQ 7 [US-INV-002 / Single-Use]: Reusing an already accepted token returns HTTP 400 Bad Request", async () => {
    // Create new user for this test
    const oneTimeUser = await prisma.user.upsert({
      where: { email: "onetime@collaborator.io" },
      update: {},
      create: {
        email: "onetime@collaborator.io",
        username: "onetime_user",
        name: "One Time User",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
        isActive: true,
      },
    });
    testUserIds.push(oneTimeUser.id);
    const oneTimeToken = signAccessToken(oneTimeUser.id);

    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: oneTimeUser.email,
        roleId: teamMemberRole.id,
      }),
    });
    const inviteBody = await inviteRes.json();
    testInvitationIds.push(inviteBody.invitation.id);

    // First acceptance succeeds
    const firstRes = await fetch(`${baseUrl}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${oneTimeToken}`,
      },
      body: JSON.stringify({ token: inviteBody.token }),
    });
    assert.equal(firstRes.status, 200);

    // Second acceptance of the same token returns HTTP 400
    const secondRes = await fetch(`${baseUrl}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${oneTimeToken}`,
      },
      body: JSON.stringify({ token: inviteBody.token }),
    });

    const secondBody = await secondRes.json();
    assert.equal(secondRes.status, 400);
    assert.equal(secondBody.error, "Invitation is no longer valid");
  });

  // TEST 8: Revocation (US-INV-003)
  test("REQ 8 [US-INV-003 / Revocation]: Admin revokes pending invitation; subsequent acceptance returns HTTP 400", async () => {
    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: "revokeme@collaborator.io",
        roleId: teamMemberRole.id,
      }),
    });
    const inviteBody = await inviteRes.json();
    testInvitationIds.push(inviteBody.invitation.id);

    // Admin revokes invitation
    const revokeRes = await fetch(`${baseUrl}/api/invitations/${inviteBody.invitation.id}/revoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    const revokeBody = await revokeRes.json();
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeBody.message, "Invitation revoked");

    // Acceptance attempt on revoked invitation fails
    const acceptRes = await fetch(`${baseUrl}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ token: inviteBody.token }),
    });
    const acceptBody = await acceptRes.json();
    assert.equal(acceptRes.status, 400);
    assert.equal(acceptBody.error, "Invitation is no longer valid");
  });

  // TEST 9: Resend Invitation (US-INV-003)
  test("REQ 9 [US-INV-003 / Resend]: Admin resends invitation; previous token invalidated and fresh token issued", async () => {
    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: "resendme@collaborator.io",
        roleId: teamMemberRole.id,
      }),
    });
    const inviteBody = await inviteRes.json();
    const oldToken = inviteBody.token;
    testInvitationIds.push(inviteBody.invitation.id);

    clearDeliveredEmails();

    // Admin resends invitation
    const resendRes = await fetch(`${baseUrl}/api/invitations/${inviteBody.invitation.id}/resend`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    const resendBody = await resendRes.json();
    assert.equal(resendRes.status, 200);
    assert.equal(resendBody.message, "Invitation resent successfully");
    assert.notEqual(resendBody.token, oldToken, "Fresh token must differ from old token");
    assert.ok(resendBody.inviteUrl.includes(resendBody.token));

    // Verify fresh email sent
    const delivered = getLastDeliveredEmail();
    assert.ok(delivered);
    assert.equal(delivered.to, "resendme@collaborator.io");

    // Old token should no longer work
    const oldTokenAccept = await fetch(`${baseUrl}/api/invitations/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ token: oldToken }),
    });
    assert.equal(oldTokenAccept.status, 400);
  });

  // TEST 10: Tenant Boundary Isolation (US-TENANT-005)
  test("REQ 10 [US-TENANT-005 / IDOR Isolation]: Invitation in Org A cannot be revoked or resent from Org B (HTTP 404)", async () => {
    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: "isolation@collaborator.io",
        roleId: teamMemberRole.id,
      }),
    });
    const inviteBody = await inviteRes.json();
    testInvitationIds.push(inviteBody.invitation.id);

    // Attempt to revoke from Nova Labs tenant
    const crossRevoke = await fetch(`${baseUrl}/api/invitations/${inviteBody.invitation.id}/revoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${novaAdminToken}`,
        "x-organization-id": String(novaOrg.id),
      },
    });
    assert.equal(crossRevoke.status, 404);

    // Attempt to resend from Nova Labs tenant
    const crossResend = await fetch(`${baseUrl}/api/invitations/${inviteBody.invitation.id}/resend`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${novaAdminToken}`,
        "x-organization-id": String(novaOrg.id),
      },
    });
    assert.equal(crossResend.status, 404);
  });

  // TEST 11: Listing Pending Invitations & Auto-Expiry
  test("REQ 11 [US-INV-003 / Listing]: GET /api/invitations returns tenant invitations and marks expired records", async () => {
    const res = await fetch(`${baseUrl}/api/invitations`, {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(body.invitations));
    for (const inv of body.invitations) {
      assert.equal(inv.tokenHash, undefined, "tokenHash must never leak in listing");
      assert.ok(inv.role);
      assert.ok(inv.inviter);
    }
  });

  // TEST 12: Public Token Verification
  test("REQ 12 [US-INV-001 / Token Verification]: GET /api/invitations/verify returns public workspace and role metadata", async () => {
    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: "verifytest@collaborator.io",
        roleId: teamMemberRole.id,
        department: "Product Management",
      }),
    });
    const inviteBody = await inviteRes.json();
    testInvitationIds.push(inviteBody.invitation.id);

    const verifyRes = await fetch(`${baseUrl}/api/invitations/verify?token=${inviteBody.token}`);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyBody.invitation.organization.name, "Acme Corp");
    assert.equal(verifyBody.invitation.role.name, teamMemberRole.name);
    assert.equal(verifyBody.invitation.email, "verifytest@collaborator.io");
    assert.equal(verifyBody.invitation.department, "Product Management");
    assert.equal(verifyBody.invitation.isExpired, false);
    assert.equal(verifyBody.invitation.tokenHash, undefined);
  });

  // TEST 13: Concurrent Acceptance Race Condition
  test("REQ 13 [US-INV-002 / Race Condition]: Concurrent acceptance attempts yield exactly one success", async () => {
    const raceUser = await prisma.user.upsert({
      where: { email: "raceuser@collaborator.io" },
      update: {},
      create: {
        email: "raceuser@collaborator.io",
        username: "race_user",
        name: "Race User",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
        isActive: true,
      },
    });
    testUserIds.push(raceUser.id);
    const raceUserToken = signAccessToken(raceUser.id);

    const inviteRes = await fetch(`${baseUrl}/api/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: JSON.stringify({
        email: raceUser.email,
        roleId: teamMemberRole.id,
      }),
    });
    const inviteBody = await inviteRes.json();
    testInvitationIds.push(inviteBody.invitation.id);

    // Fire two parallel accept requests
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/invitations/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${raceUserToken}`,
        },
        body: JSON.stringify({ token: inviteBody.token }),
      }),
      fetch(`${baseUrl}/api/invitations/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${raceUserToken}`,
        },
        body: JSON.stringify({ token: inviteBody.token }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.equal(statuses[0], 200, "Exactly one request must succeed with 200");
    assert.ok(
      statuses[1] === 400 || statuses[1] === 409,
      "The loser in the race must be rejected with 400 or 409"
    );
  });
});

