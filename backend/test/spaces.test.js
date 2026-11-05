import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("SPACES E2E SUITE: Spatial ReBAC, Container Hierarchy, Privacy & Access Tiers", () => {
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
  let elenaUser;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let member2Token;
  let viewerToken;
  let guestToken;
  let elenaToken;

  let acmeMemberMembership;
  let acmeMember2Membership;
  let acmeGuestMembership;

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

    // Ensure a second team member exists in Acme Corp for isolation tests
    member2User = await prisma.user.upsert({
      where: { email: "member2@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Second Member",
        username: "member2",
        email: "member2@teamguard.io",
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

    // Ensure a Guest user exists in Acme Corp
    guestUser = await prisma.user.upsert({
      where: { email: "guest@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Guest Collaborator",
        username: "guest_collaborator",
        email: "guest@teamguard.io",
        passwordHash: "demo-hash",
        isActive: true,
      },
    });

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
    }).catch(async () => {
      // If accountType column not yet generated in migration, fallback without it
      return prisma.membership.upsert({
        where: { userId_organizationId: { userId: guestUser.id, organizationId: acmeOrg.id } },
        update: { status: "ACTIVE" },
        create: {
          userId: guestUser.id,
          organizationId: acmeOrg.id,
          status: "ACTIVE",
          department: "External",
        },
      });
    });

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    member2Token = signAccessToken(member2User.id);
    viewerToken = signAccessToken(viewerUser.id);
    guestToken = signAccessToken(guestUser.id);
    elenaToken = signAccessToken(elenaUser.id);
  });

  after(async () => {
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
  // TIER 1: Core Functional & CRUD Invariants (F-01, F-02, F-03, F-04, F-16)
  // =========================================================================

  test("TIER 1 [F-01 / F-02]: Super Admin can create a public space with styling metadata", async () => {
    const slug = `public-eng-${Date.now()}`;
    const res = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Engineering Public Hub",
        slug,
        description: "Public workspace container for all engineering projects",
        icon: "code",
        color: "#2563eb",
        isPrivate: false,
      },
    });

    assert.ok([200, 201].includes(res.status), `Expected 200 or 201, got ${res.status}`);
    const space = res.data.space || res.data;
    assert.ok(space.id, "Created space must have an ID");
    assert.equal(space.name, "Engineering Public Hub");
    assert.equal(space.isPrivate, false);
    createdSpaceIds.push(space.id);
  });

  test("TIER 1 [F-01 / F-02]: Super Admin can create a private space requiring membership", async () => {
    const slug = `private-exec-${Date.now()}`;
    const res = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Executive Strategy Room",
        slug,
        description: "Confidential space for executive leadership",
        icon: "lock",
        color: "#dc2626",
        isPrivate: true,
      },
    });

    assert.ok([200, 201].includes(res.status), `Expected 200 or 201, got ${res.status}`);
    const space = res.data.space || res.data;
    assert.ok(space.id);
    assert.equal(space.isPrivate, true);
    createdSpaceIds.push(space.id);
  });

  test("TIER 1 [F-01 / F-04]: Super Admin can list all spaces in the organization", async () => {
    const res = await api("/api/spaces", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    const spaces = Array.isArray(res.data) ? res.data : (res.data.spaces || []);
    assert.ok(Array.isArray(spaces), "Spaces response must be an array");
    assert.ok(spaces.length >= 2, "Admin must see both public and private spaces");
  });

  test("TIER 1 [F-02]: Regular Team Member can list public spaces", async () => {
    const res = await api("/api/spaces", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    const spaces = Array.isArray(res.data) ? res.data : (res.data.spaces || []);
    assert.ok(Array.isArray(spaces));
    const publicSpaces = spaces.filter((s) => !s.isPrivate);
    assert.ok(publicSpaces.length >= 1, "Member should see at least one public space");
  });

  test("TIER 1 [F-03]: Super Admin can add a member to a private space with specific tier", async () => {
    // 1. Create a private space
    const slug = `private-team-${Date.now()}`;
    const createRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Restricted Operations",
        slug,
        isPrivate: true,
      },
    });
    assert.ok([200, 201].includes(createRes.status));
    const space = createRes.data.space || createRes.data;
    createdSpaceIds.push(space.id);

    // 2. Add member with VIEW tier
    const addRes = await api(`/api/spaces/${space.id}/members`, {
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
    assert.ok([200, 201].includes(addRes.status), `Expected 200/201 on adding member, got ${addRes.status}`);

    // 3. Member can now read the space
    const readRes = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(readRes.status, 200, "Member with VIEW tier should access space");
  });

  test("TIER 1 [F-03]: Super Admin can update space member access tier to EDIT", async () => {
    const spaceId = createdSpaceIds[createdSpaceIds.length - 1];
    const updateRes = await api(`/api/spaces/${spaceId}/members`, {
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
    assert.ok([200, 201].includes(updateRes.status));
  });

  test("TIER 1 [F-01]: Super Admin can update space details (name, color, icon)", async () => {
    const spaceId = createdSpaceIds[0];
    const res = await api(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Engineering Central Hub Updated",
        color: "#10b981",
        icon: "terminal",
      },
    });
    assert.equal(res.status, 200);
    const updated = res.data.space || res.data;
    assert.equal(updated.name, "Engineering Central Hub Updated");
    assert.equal(updated.color, "#10b981");
  });

  test("TIER 1 [F-04 / F-16]: Super Admin can delete a space", async () => {
    const slug = `temp-delete-${Date.now()}`;
    const createRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Temporary Space", slug, isPrivate: false },
    });
    assert.ok([200, 201].includes(createRes.status));
    const space = createRes.data.space || createRes.data;

    const delRes = await api(`/api/spaces/${space.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.ok([200, 204].includes(delRes.status));

    // Verify it is gone
    const getRes = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(getRes.status, 404);
  });

  // =========================================================================
  // TIER 2: Boundary, Negative & Resource Hiding Invariants (F-02, F-04, F-09)
  // =========================================================================

  test("TIER 2 [F-02]: Non-member receives 404 (resource hiding) when querying private space", async () => {
    // Create a private space that member2 is NOT part of
    const slug = `hidden-space-${Date.now()}`;
    const createRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Super Secret Space", slug, isPrivate: true },
    });
    assert.ok([200, 201].includes(createRes.status));
    const space = createRes.data.space || createRes.data;
    createdSpaceIds.push(space.id);

    // Member 2 queries private space without membership
    const res = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    // CRITICAL SECURITY CONTRACT: Must be 404, NEVER 403, to prevent existence probing
    assert.equal(res.status, 404, "Unauthorized private space access must return 404 Not Found (Resource Hiding)");
  });

  test("TIER 2 [F-09]: Guest user calling GET /api/spaces receives an empty list", async () => {
    const res = await api("/api/spaces", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    const spaces = Array.isArray(res.data) ? res.data : (res.data.spaces || []);
    assert.deepEqual(spaces, [], "Guest user must receive empty array when listing spaces");
  });

  test("TIER 2 [F-09]: Guest user calling GET /api/spaces/:id directly receives HTTP 403 Forbidden", async () => {
    const spaceId = createdSpaceIds[0];
    const res = await api(`/api/spaces/${spaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 403, "Guests must be barred from direct Space access with HTTP 403");
  });

  test("TIER 2 [F-09]: Guest user attempting POST /api/spaces receives HTTP 403 Forbidden", async () => {
    const res = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Guest Infiltration Space", slug: `guest-space-${Date.now()}` },
    });

    assert.equal(res.status, 403);
  });

  test("TIER 2 [F-03]: Member with VIEW access tier is barred from modifying space (HTTP 403)", async () => {
    // 1. Create private space
    const slug = `view-only-space-${Date.now()}`;
    const createRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Read-Only Archive", slug, isPrivate: true },
    });
    const space = createRes.data.space || createRes.data;
    createdSpaceIds.push(space.id);

    // 2. Add member with VIEW tier
    await api(`/api/spaces/${space.id}/members`, {
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

    // 3. Member attempts to update space metadata -> Must fail 403
    const updateRes = await api(`/api/spaces/${space.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Unauthorized Defacement" },
    });

    assert.equal(updateRes.status, 403, "VIEW tier member cannot update space metadata");
  });

  test("TIER 2 [F-03 / F-07]: Member with EDIT access tier is barred from deleting space (requires FULL)", async () => {
    // 1. Create private space
    const slug = `edit-only-space-${Date.now()}`;
    const createRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Edit Permitted Space", slug, isPrivate: true },
    });
    const space = createRes.data.space || createRes.data;
    createdSpaceIds.push(space.id);

    // 2. Add member with EDIT tier
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

    // 3. Member attempts deletion -> Must fail 403 (Requires FULL tier)
    const delRes = await api(`/api/spaces/${space.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(delRes.status, 403, "EDIT tier member cannot delete space (Object tier barrier)");
  });

  test("TIER 2 [F-01]: Cross-tenant access: user from Acme cannot access Nova Labs space (HTTP 404)", async () => {
    // 1. Create space in Nova Labs
    const slug = `nova-space-${Date.now()}`;
    const novaRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${elenaToken}`,
        "x-organization-id": String(novaOrg.id),
      },
      body: { name: "Nova Research Space", slug, isPrivate: false },
    });
    const novaSpace = novaRes.data.space || novaRes.data;
    createdSpaceIds.push(novaSpace.id);

    // 2. Acme admin attempts to access Nova Labs space with Acme Org header
    const crossRes = await api(`/api/spaces/${novaSpace.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(crossRes.status, 404, "Cross-tenant space access must return 404 Not Found");
  });

  // =========================================================================
  // TIER 3: Pairwise Combinatorial Matrix (Privacy x Role x Access Tier)
  // =========================================================================

  test("TIER 3 [F-02 / F-04]: Pairwise evaluation across Space Privacy x Roles", async () => {
    // Pair 1: Public Space x Stakeholder (Viewer)
    const publicSpaceId = createdSpaceIds[0];
    const viewerPublic = await api(`/api/spaces/${publicSpaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(viewerPublic.status, 200, "Stakeholder can view public space");

    // Pair 2: Private Space x Super Admin Bypass (Admin not explicitly in SpaceMember)
    const privateSpaceId = createdSpaceIds[1];
    const adminPrivate = await api(`/api/spaces/${privateSpaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(adminPrivate.status, 200, "Super Admin bypasses private space isolation");

    // Pair 3: Private Space x Stakeholder (Viewer) -> 404 Not Found
    const viewerPrivate = await api(`/api/spaces/${privateSpaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(viewerPrivate.status, 404, "Stakeholder receives 404 on unjoined private space");

    // Pair 4: Public Space x Guest -> 403 Forbidden
    const guestPublic = await api(`/api/spaces/${publicSpaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(guestPublic.status, 403, "Guest barred from public space");
  });

  // =========================================================================
  // TIER 4: Enterprise End-to-End Workflow Scenarios
  // =========================================================================

  test("TIER 4 [F-01 -> F-04]: End-to-End ReBAC Lifecycle: Private Container Creation -> Probing -> Member Escalation -> Teardown", async () => {
    // 1. Super Admin creates private space
    const slug = `e2e-space-${Date.now()}`;
    const createRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Enterprise M&A Space",
        slug,
        description: "Mergers and acquisitions working group",
        isPrivate: true,
      },
    });
    assert.ok([200, 201].includes(createRes.status));
    const space = createRes.data.space || createRes.data;
    createdSpaceIds.push(space.id);

    // 2. Team Member 2 probes private space -> 404 Resource Hiding
    const probeRes = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(probeRes.status, 404);

    // 3. Admin grants Member 2 EDIT tier
    const grantRes = await api(`/api/spaces/${space.id}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMember2Membership.id,
        accessLevel: "EDIT",
      },
    });
    assert.ok([200, 201].includes(grantRes.status));

    // 4. Member 2 can now access the space and edit metadata
    const accessRes = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(accessRes.status, 200);

    const editRes = await api(`/api/spaces/${space.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { description: "Updated by authorized M&A editor" },
    });
    assert.equal(editRes.status, 200);

    // 5. Member 2 is blocked from deleting space (Requires FULL tier)
    const deleteAttempt = await api(`/api/spaces/${space.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(deleteAttempt.status, 403);

    // 6. Admin upgrades Member 2 to FULL tier
    const upgradeRes = await api(`/api/spaces/${space.id}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        membershipId: acmeMember2Membership.id,
        accessLevel: "FULL",
      },
    });
    assert.ok([200, 201].includes(upgradeRes.status));

    // 7. Admin revokes Member 2 access
    const revokeRes = await api(`/api/spaces/${space.id}/members/${acmeMember2Membership.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.ok([200, 204].includes(revokeRes.status));

    // 8. Member 2 now receives 404 again
    const postRevokeRes = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(postRevokeRes.status, 404);
  });
});
