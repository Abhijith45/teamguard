import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("ACCESS REQUESTS E2E SUITE: Self-Service Privilege Escalation & Automated Space Membership", () => {
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

  const createdSpaceIds = [];
  const createdRequestIds = [];

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
      where: { email: "member2_req@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Requester Member 2",
        username: "member2_req",
        email: "member2_req@teamguard.io",
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
  });

  after(async () => {
    // Clean up created access requests
    if (prisma.accessRequest) {
      for (const reqId of createdRequestIds) {
        await prisma.accessRequest.delete({ where: { id: reqId } }).catch(() => {});
      }
    }
    // Clean up created spaces
    if (prisma.space) {
      for (const spaceId of createdSpaceIds) {
        await prisma.space.delete({ where: { id: spaceId } }).catch(() => {});
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
  // TIER 1: Core Functional & Lifecycle Invariants (F-14, F-15)
  // =========================================================================

  test("TIER 1 [F-14]: Team Member can submit an access request for a private space", async () => {
    // 1. Super Admin creates private space
    const slug = `req-space-${Date.now()}`;
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Security Compliance Space",
        slug,
        isPrivate: true,
      },
    });
    const space = spaceRes.data.space || spaceRes.data;
    createdSpaceIds.push(space.id);

    // 2. Team Member submits access request
    const reqRes = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: space.id,
        requestedLevel: "VIEW",
        justification: "Need to audit compliance controls for SOC 2",
      },
    });

    assert.ok([200, 201].includes(reqRes.status), `Expected 200 or 201, got ${reqRes.status}`);
    const reqData = reqRes.data.accessRequest || reqRes.data;
    assert.ok(reqData.id);
    assert.equal(reqData.resourceType, "SPACE");
    assert.equal(reqData.resourceId, space.id);
    assert.equal(reqData.requestedLevel, "VIEW");
    assert.equal(reqData.status, "PENDING");
    createdRequestIds.push(reqData.id);
  });

  test("TIER 1 [F-15]: Super Admin can list pending access requests", async () => {
    const res = await api("/api/access-requests", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    const requests = Array.isArray(res.data) ? res.data : (res.data.accessRequests || []);
    assert.ok(Array.isArray(requests));
    assert.ok(requests.length >= 1, "Must list submitted access request");
  });

  test("TIER 1 [F-15]: Super Admin can approve an access request with automated SpaceMember creation", async () => {
    const requestId = createdRequestIds[createdRequestIds.length - 1];
    const targetSpaceId = createdSpaceIds[createdSpaceIds.length - 1];

    // 1. Super Admin approves request
    const reviewRes = await api(`/api/access-requests/${requestId}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "APPROVED",
      },
    });

    assert.equal(reviewRes.status, 200);
    const updated = reviewRes.data.accessRequest || reviewRes.data;
    assert.equal(updated.status, "APPROVED");

    // 2. CRITICAL AUTOMATION INVARIANT: Approval must grant space membership
    // Team Member who previously received 404 should now receive 200 OK
    const spaceRes = await api(`/api/spaces/${targetSpaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(spaceRes.status, 200, "Approved member must now have access to the private space");
  });

  test("TIER 1 [F-15]: Super Admin can reject an access request with documented reason", async () => {
    // 1. Create another private space
    const slug = `reject-space-${Date.now()}`;
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Boardroom Strategic Plan", slug, isPrivate: true },
    });
    const space = spaceRes.data.space || spaceRes.data;
    createdSpaceIds.push(space.id);

    // 2. Member 2 submits request
    const reqRes = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: space.id,
        requestedLevel: "FULL",
        justification: "Seeking full administrative access",
      },
    });
    const reqData = reqRes.data.accessRequest || reqRes.data;
    createdRequestIds.push(reqData.id);

    // 3. Super Admin rejects request
    const reviewRes = await api(`/api/access-requests/${reqData.id}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "REJECTED",
        rejectionReason: "Administrative access restricted to senior staff",
      },
    });

    assert.equal(reviewRes.status, 200);
    const rejected = reviewRes.data.accessRequest || reviewRes.data;
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.rejectionReason, "Administrative access restricted to senior staff");

    // 4. Verification: Member 2 STILL receives 404 on private space
    const spaceCheck = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(spaceCheck.status, 404, "Rejected requester must remain denied (404 Not Found)");
  });

  // =========================================================================
  // TIER 2: Boundary, Negative & Validation Invariants (F-14, F-15)
  // =========================================================================

  test("TIER 2 [F-14]: Submitting access request with missing required fields returns HTTP 400", async () => {
    const res = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        // Missing resourceType, resourceId, and justification
        requestedLevel: "VIEW",
      },
    });

    assert.equal(res.status, 400, "Validation failure must return HTTP 400 Bad Request");
  });

  test("TIER 2 [F-14]: Submitting access request with invalid requestedLevel returns HTTP 400", async () => {
    const res = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: 1,
        requestedLevel: "UNRESTRICTED_ROOT",
        justification: "Privilege escalation attempt",
      },
    });

    assert.equal(res.status, 400, "Invalid access tier must be rejected with HTTP 400");
  });

  test("TIER 2 [F-15]: Non-admin / non-manager member CANNOT review access requests (HTTP 403)", async () => {
    const requestId = createdRequestIds[0];
    const res = await api(`/api/access-requests/${requestId}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "APPROVED" },
    });

    assert.equal(res.status, 403, "Non-admin member cannot approve access requests (HTTP 403 Forbidden)");
  });

  test("TIER 2 [F-15]: Reviewing non-existent access request returns HTTP 404", async () => {
    const res = await api("/api/access-requests/999999/review", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "APPROVED" },
    });

    assert.equal(res.status, 404);
  });

  test("TIER 2 [F-14]: Cross-tenant access request submission returns HTTP 404", async () => {
    // Nova Labs space requested from Acme Corp context
    const novaSpace = await prisma.space?.findFirst({ where: { organizationId: novaOrg.id } });
    if (novaSpace) {
      const res = await api("/api/access-requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          "x-organization-id": String(acmeOrg.id),
        },
        body: {
          resourceType: "SPACE",
          resourceId: novaSpace.id,
          requestedLevel: "VIEW",
          justification: "Cross-tenant probe",
        },
      });
      assert.equal(res.status, 404, "Target resource from other tenant must return 404 Not Found");
    }
  });

  // =========================================================================
  // TIER 3: Pairwise Combinatorial Matrix (Resource x Tier x Decision)
  // =========================================================================

  test("TIER 3 [F-14 / F-15]: Combinatorial Matrix: Requested Level x Review Decision", async () => {
    const spaceId = createdSpaceIds[0];

    // Combination 1: EDIT level requested -> APPROVED
    const req1 = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: spaceId,
        requestedLevel: "EDIT",
        justification: "Pairwise matrix test EDIT approval",
      },
    });
    assert.ok([200, 201].includes(req1.status));
    const r1 = req1.data.accessRequest || req1.data;
    createdRequestIds.push(r1.id);

    const approveRes = await api(`/api/access-requests/${r1.id}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "APPROVED" },
    });
    assert.equal(approveRes.status, 200);
    const approvedData = approveRes.data.accessRequest || approveRes.data;
    assert.equal(approvedData.status, "APPROVED");

    // Combination 2: FULL level requested -> REJECTED
    const req2 = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: spaceId,
        requestedLevel: "FULL",
        justification: "Pairwise matrix test FULL rejection",
      },
    });
    assert.ok([200, 201].includes(req2.status));
    const r2 = req2.data.accessRequest || req2.data;
    createdRequestIds.push(r2.id);

    const rejectRes = await api(`/api/access-requests/${r2.id}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "REJECTED", rejectionReason: "Excessive privilege requested" },
    });
    assert.equal(rejectRes.status, 200);
    const rejectedData = rejectRes.data.accessRequest || rejectRes.data;
    assert.equal(rejectedData.status, "REJECTED");
  });

  // =========================================================================
  // TIER 4: Enterprise End-to-End Workflow Scenarios
  // =========================================================================

  test("TIER 4 [F-14 -> F-15 / F-19]: End-to-End Self-Service Access Request & Automated Provisioning Workflow", async () => {
    // 1. Admin creates confidential project space "Alpha Stealth"
    const slug = `stealth-space-${Date.now()}`;
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Alpha Stealth Space",
        slug,
        isPrivate: true,
      },
    });
    const space = spaceRes.data.space || spaceRes.data;
    createdSpaceIds.push(space.id);

    // 2. Member 2 receives link to space -> attempts access -> 404 Not Found (Resource Hiding)
    const probe = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(probe.status, 404);

    // 3. UI triggers RequestAccessModal -> Member 2 submits request for EDIT access
    const submitRes = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: space.id,
        requestedLevel: "EDIT",
        justification: "Assigned as backend lead for Alpha Stealth deliverable",
      },
    });
    assert.ok([200, 201].includes(submitRes.status));
    const reqItem = submitRes.data.accessRequest || submitRes.data;
    createdRequestIds.push(reqItem.id);

    // 4. Admin reviews request queue -> discovers pending request
    const listRes = await api("/api/access-requests", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(listRes.status, 200);

    // 5. Admin approves request
    const reviewRes = await api(`/api/access-requests/${reqItem.id}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "APPROVED",
      },
    });
    assert.equal(reviewRes.status, 200);

    // 6. Member 2 immediately re-queries space -> Access is now granted (HTTP 200)
    const postGrant = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(postGrant.status, 200, "Member 2 must have instant access following request approval");
  });
});
