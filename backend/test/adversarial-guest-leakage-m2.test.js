import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

describe("ADVERSARIAL CHALLENGER SUITE: M2 Guest Data Leakage, Private Container Discovery, Directory Barrier & Access Request Boundaries", () => {
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
  let foreignUser;

  let superAdminToken;
  let managerToken;
  let memberToken;
  let member2Token;
  let viewerToken;
  let guestToken;
  let foreignToken;

  let acmeGuestMembership;
  let acmeMemberMembership;
  let acmeMember2Membership;

  const createdSpaceIds = [];
  const createdProjectIds = [];
  const createdTaskIds = [];
  const createdCustomFieldIds = [];
  const createdAccessRequestIds = [];

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
    return { status: response.status, data, rawText: text, headers: response.headers };
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
    foreignUser = await prisma.user.findUnique({ where: { email: "elena@novalabs.io" } });

    // Ensure member2 exists in Acme Corp
    member2User = await prisma.user.upsert({
      where: { email: "challenger_member2@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Challenger Member 2",
        username: "challenger_m2",
        email: "challenger_member2@teamguard.io",
        passwordHash: "demo-hash",
        isActive: true,
      },
    });

    // Ensure guest user exists in Acme Corp
    guestUser = await prisma.user.upsert({
      where: { email: "challenger_guest@teamguard.io" },
      update: { isActive: true },
      create: {
        name: "Challenger Guest Collaborator",
        username: "challenger_guest",
        email: "challenger_guest@teamguard.io",
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
      update: { status: "ACTIVE", accountType: "MEMBER" },
      create: {
        userId: member2User.id,
        organizationId: acmeOrg.id,
        status: "ACTIVE",
        department: "Engineering",
        accountType: "MEMBER",
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

    acmeGuestMembership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: guestUser.id, organizationId: acmeOrg.id } },
      update: { status: "ACTIVE", accountType: "GUEST" },
      create: {
        userId: guestUser.id,
        organizationId: acmeOrg.id,
        status: "ACTIVE",
        department: "Contractors",
        accountType: "GUEST",
      },
    });

    superAdminToken = signAccessToken(superAdminUser.id);
    managerToken = signAccessToken(managerUser.id);
    memberToken = signAccessToken(memberUser.id);
    member2Token = signAccessToken(member2User.id);
    viewerToken = signAccessToken(viewerUser.id);
    guestToken = signAccessToken(guestUser.id);
    foreignToken = signAccessToken(foreignUser.id);
  });

  after(async () => {
    // 1. Delete created access requests
    for (const reqId of createdAccessRequestIds) {
      await prisma.accessRequest.delete({ where: { id: reqId } }).catch(() => {});
    }

    // 2. Delete created custom fields & values
    for (const cfId of createdCustomFieldIds) {
      await prisma.customFieldValue.deleteMany({ where: { customFieldId: cfId } }).catch(() => {});
      await prisma.customField.delete({ where: { id: cfId } }).catch(() => {});
    }

    // 3. Delete created tasks
    for (const tId of createdTaskIds) {
      await prisma.customFieldValue.deleteMany({ where: { taskId: tId } }).catch(() => {});
      await prisma.task.delete({ where: { id: tId } }).catch(() => {});
    }

    // 4. Delete created projects
    for (const pId of createdProjectIds) {
      await prisma.task.deleteMany({ where: { projectId: pId } }).catch(() => {});
      await prisma.project.delete({ where: { id: pId } }).catch(() => {});
    }

    // 5. Delete created spaces
    for (const spId of createdSpaceIds) {
      await prisma.spaceMember.deleteMany({ where: { spaceId: spId } }).catch(() => {});
      await prisma.space.delete({ where: { id: spId } }).catch(() => {});
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetAuthRateLimiter();
  });

  // =========================================================================
  // CHALLENGE 1: Resource Hiding on Private Spaces (Concealment vs Enumeration)
  // =========================================================================

  test("CHALLENGE 1.1: Direct GET /api/spaces/:id on private space by non-member returns strictly HTTP 404 (NEVER 403)", async () => {
    // Super Admin creates a highly confidential private space
    const slug = `adv-priv-space-${Date.now()}`;
    const spaceRes = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Confidential M&A Vault",
        slug,
        isPrivate: true,
      },
    });
    assert.equal(spaceRes.status, 201);
    const space = spaceRes.data.space;
    createdSpaceIds.push(space.id);

    // Regular Member (in Acme Corp, but NOT in this private space) attempts direct GET probe
    const probe = await api(`/api/spaces/${space.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(
      probe.status,
      404,
      `Non-space-member probe on private space must return HTTP 404 to conceal resource existence; got ${probe.status}`
    );
    assert.equal(probe.data.error, "Space not found");
  });

  test("CHALLENGE 1.2: Mutation probes (PATCH, PUT, DELETE, POST/DELETE /members) on private space by non-member return strictly HTTP 404", async () => {
    const spaceId = createdSpaceIds[0];

    // Probe 1: PATCH
    const patchRes = await api(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Hijacked Space" },
    });
    assert.equal(patchRes.status, 404, "PATCH on private space by non-member must return 404");

    // Probe 2: PUT
    const putRes = await api(`/api/spaces/${spaceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { name: "Hijacked Space 2" },
    });
    assert.equal(putRes.status, 404, "PUT on private space by non-member must return 404");

    // Probe 3: DELETE
    const delRes = await api(`/api/spaces/${spaceId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(delRes.status, 404, "DELETE on private space by non-member must return 404");

    // Probe 4: POST /members
    const addMemRes = await api(`/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { membershipId: acmeMemberMembership.id, accessLevel: "FULL" },
    });
    assert.equal(addMemRes.status, 404, "POST /members on private space by non-member must return 404");

    // Probe 5: DELETE /members/:membershipId
    const delMemRes = await api(`/api/spaces/${spaceId}/members/999`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(delMemRes.status, 404, "DELETE /members on private space by non-member must return 404");
  });

  test("CHALLENGE 1.3: Cross-tenant private space probing returns strictly HTTP 404", async () => {
    // Create a private space in Nova Labs
    const novaSpace = await prisma.space.create({
      data: {
        organizationId: novaOrg.id,
        creatorId: (await prisma.membership.findFirst({ where: { organizationId: novaOrg.id } })).id,
        name: "Nova Secret Lab Space",
        slug: `nova-secret-${Date.now()}`,
        isPrivate: true,
      },
    });
    createdSpaceIds.push(novaSpace.id);

    // Acme Corp member probes Nova Labs space using Acme Corp tenant header
    const crossProbe = await api(`/api/spaces/${novaSpace.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(crossProbe.status, 404, "Cross-tenant space probe must return 404 Not Found");
  });

  test("CHALLENGE 1.4: Direct space probe with non-existent space ID returns HTTP 404", async () => {
    const res = await api("/api/spaces/9999999", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res.status, 404, "Non-existent space must return 404");
  });

  test("CHALLENGE 1.5: GET /api/spaces strictly conceals private spaces where caller has no membership", async () => {
    const spaceId = createdSpaceIds[0];

    const listRes = await api("/api/spaces", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(listRes.status, 200);
    const spaces = Array.isArray(listRes.data) ? listRes.data : (listRes.data.spaces || []);
    const leaked = spaces.some((s) => s.id === spaceId);
    assert.equal(leaked, false, "GET /api/spaces must not leak private spaces to unauthorized members");
  });

  // =========================================================================
  // CHALLENGE 2: Cross-Tenant Access Request Boundaries
  // =========================================================================

  test("CHALLENGE 2.1: Probing cross-tenant SPACE resource via POST /api/access-requests returns HTTP 404", async () => {
    const novaSpace = await prisma.space.findFirst({ where: { organizationId: novaOrg.id } });
    assert.ok(novaSpace, "Nova space must exist");

    const res = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: novaSpace.id,
        requestedLevel: "VIEW",
        justification: "Adversarial cross-tenant space probe",
      },
    });

    assert.equal(
      res.status,
      404,
      `Requesting access to cross-tenant space must return HTTP 404; got ${res.status}`
    );
    assert.equal(res.data.error, "Target resource not found in current organization");
  });

  test("CHALLENGE 2.2: Probing cross-tenant PROJECT resource via POST /api/access-requests returns HTTP 404", async () => {
    const novaProject = await prisma.project.findFirst({ where: { organizationId: novaOrg.id } });
    assert.ok(novaProject, "Nova project must exist");

    const res = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "PROJECT",
        resourceId: novaProject.id,
        requestedLevel: "VIEW",
        justification: "Adversarial cross-tenant project probe",
      },
    });

    assert.equal(
      res.status,
      404,
      `Requesting access to cross-tenant project must return HTTP 404; got ${res.status}`
    );
    assert.equal(res.data.error, "Target resource not found in current organization");
  });

  test("CHALLENGE 2.3: Probing non-existent resource ID via POST /api/access-requests returns HTTP 404", async () => {
    const res = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: 88888888,
        requestedLevel: "VIEW",
        justification: "Non-existent resource ID probe",
      },
    });

    assert.equal(res.status, 404);
  });

  test("CHALLENGE 2.4: Probing soft-deleted project via POST /api/access-requests returns HTTP 404", async () => {
    // Create a deleted project in Acme Corp
    const delProj = await prisma.project.create({
      data: {
        organizationId: acmeOrg.id,
        name: `Soft Deleted Project ${Date.now()}`,
        status: "ARCHIVED",
        deletedAt: new Date(),
      },
    });
    createdProjectIds.push(delProj.id);

    const res = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "PROJECT",
        resourceId: delProj.id,
        requestedLevel: "VIEW",
        justification: "Probe deleted project",
      },
    });

    assert.equal(res.status, 404, "Soft-deleted project must return 404 Not Found");
  });

  test("CHALLENGE 2.5: Cross-tenant access request inspection / review returns HTTP 404", async () => {
    // Create an access request in Nova Labs
    const novaMembership = await prisma.membership.findFirst({ where: { organizationId: novaOrg.id } });
    const novaReq = await prisma.accessRequest.create({
      data: {
        organizationId: novaOrg.id,
        requesterMembershipId: novaMembership.id,
        resourceType: "SPACE",
        resourceId: 1,
        requestedLevel: "VIEW",
        justification: "Nova internal request",
      },
    });
    createdAccessRequestIds.push(novaReq.id);

    // Acme Corp admin probes Nova request with Acme tenant context
    const getRes = await api(`/api/access-requests/${novaReq.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(getRes.status, 404, "Cross-tenant access request view must return 404");

    const patchRes = await api(`/api/access-requests/${novaReq.id}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "APPROVED" },
    });
    assert.equal(patchRes.status, 404, "Cross-tenant access request review must return 404");
  });

  // =========================================================================
  // CHALLENGE 3: Guest Directory Barrier & Spatial Sandboxing
  // =========================================================================

  test("CHALLENGE 3.1: Guest caller to GET /api/members is blocked with HTTP 403 Forbidden", async () => {
    const res = await api("/api/members", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 403, "Guests must receive HTTP 403 when attempting to access member directory");
  });

  test("CHALLENGE 3.2: Guest directory evasion attempts using query params are all blocked with HTTP 403", async () => {
    const queryVariants = [
      "?status=ACTIVE",
      "?status=ALL",
      "?role=super-admin",
      "?role=admin",
      "?search=admin",
      "?search=*",
      "?department=Engineering",
      "?department=ALL",
    ];

    for (const q of queryVariants) {
      const res = await api(`/api/members${q}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${guestToken}`,
          "x-organization-id": String(acmeOrg.id),
        },
      });

      assert.equal(
        res.status,
        403,
        `Guest query bypass attempt with '${q}' must be blocked with HTTP 403; got ${res.status}`
      );
    }
  });

  test("CHALLENGE 3.3: Guest member administrative mutations are rejected with HTTP 403", async () => {
    const targetMemId = acmeMemberMembership.id;

    // Mutation 1: Role reassignment (PATCH /api/members/:id/role)
    const roleRes = await api(`/api/members/${targetMemId}/role`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { roleSlug: "super-admin" },
    });
    assert.equal(roleRes.status, 403, "Guest role mutation must return 403");

    // Mutation 2: Status update
    const statusRes = await api(`/api/members/${targetMemId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "SUSPENDED" },
    });
    assert.equal(statusRes.status, 403, "Guest status update must return 403");

    // Mutation 3: Remove member
    const remRes = await api(`/api/members/${targetMemId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(remRes.status, 403, "Guest member removal must return 403");
  });

  test("CHALLENGE 3.4: Guest calling GET /api/spaces receives HTTP 200 with empty array []", async () => {
    const res = await api("/api/spaces", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 200);
    const spaces = Array.isArray(res.data) ? res.data : (res.data.spaces || []);
    assert.deepEqual(spaces, [], "Guest space listing must strictly return []");
  });

  test("CHALLENGE 3.5: Guest calling GET /api/spaces/:id directly receives HTTP 403 Forbidden", async () => {
    const spaceId = createdSpaceIds[0] || 1;
    const res = await api(`/api/spaces/${spaceId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(res.status, 403, "Guest direct space access must return HTTP 403");
    assert.equal(res.data.code, "GUEST_SPACE_ACCESS_DENIED");
  });

  test("CHALLENGE 3.6: Guest attempting space creation POST /api/spaces receives HTTP 403 Forbidden", async () => {
    const res = await api("/api/spaces", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: "Guest Rogue Space",
        slug: `guest-space-${Date.now()}`,
        isPrivate: false,
      },
    });

    assert.equal(res.status, 403, "Guest space creation must return HTTP 403 Forbidden");
  });

  // =========================================================================
  // CHALLENGE 4: Field-Level ABAC Masking & Zero Leakage Probes
  // =========================================================================

  test("CHALLENGE 4.1: Guest accesses assigned task: sensitive custom fields are completely purged with zero string leakage", async () => {
    // 1. Create a project
    const projRes = await api("/api/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: `Adversarial Masking Proj ${Date.now()}`,
        status: "ACTIVE",
      },
    });
    const proj = projRes.data.project || projRes.data;
    createdProjectIds.push(proj.id);

    // 2. Create custom fields
    const cfPublic = await prisma.customField.upsert({
      where: { organizationId_fieldKey: { organizationId: acmeOrg.id, fieldKey: "cf_adv_public" } },
      update: {},
      create: {
        organizationId: acmeOrg.id,
        name: "Public Sprint Tag",
        fieldKey: "cf_adv_public",
        fieldType: "TEXT",
        hideFromGuests: false,
        adminOnly: false,
      },
    });
    createdCustomFieldIds.push(cfPublic.id);

    const cfGuestHidden = await prisma.customField.upsert({
      where: { organizationId_fieldKey: { organizationId: acmeOrg.id, fieldKey: "cf_adv_contractor_rate" } },
      update: {},
      create: {
        organizationId: acmeOrg.id,
        name: "Secret Contractor Hourly Rate",
        fieldKey: "cf_adv_contractor_rate",
        fieldType: "CURRENCY",
        hideFromGuests: true,
        adminOnly: false,
      },
    });
    createdCustomFieldIds.push(cfGuestHidden.id);

    const cfAdminOnly = await prisma.customField.upsert({
      where: { organizationId_fieldKey: { organizationId: acmeOrg.id, fieldKey: "cf_adv_gross_margin" } },
      update: {},
      create: {
        organizationId: acmeOrg.id,
        name: "Executive Gross Margin Pct",
        fieldKey: "cf_adv_gross_margin",
        fieldType: "NUMBER",
        hideFromGuests: true,
        adminOnly: true,
      },
    });
    createdCustomFieldIds.push(cfAdminOnly.id);

    // 3. Create task assigned to guest
    const taskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: proj.id,
        title: `Confidential Deliverable with Sensitive Fields ${Date.now()}`,
        priority: "HIGH",
        status: "TODO",
        assigneeId: guestUser.id,
      },
    });
    const task = taskRes.data.task || taskRes.data;
    createdTaskIds.push(task.id);

    // 4. Attach values
    const SENSITIVE_RATE_VAL = 249.75;
    const SENSITIVE_MARGIN_VAL = 42.8;
    const PUBLIC_TAG_VAL = "release-candidate-v9";

    await prisma.customFieldValue.upsert({
      where: { customFieldId_taskId: { customFieldId: cfPublic.id, taskId: task.id } },
      update: { valueText: PUBLIC_TAG_VAL },
      create: { customFieldId: cfPublic.id, taskId: task.id, valueText: PUBLIC_TAG_VAL },
    });
    await prisma.customFieldValue.upsert({
      where: { customFieldId_taskId: { customFieldId: cfGuestHidden.id, taskId: task.id } },
      update: { valueNumber: SENSITIVE_RATE_VAL },
      create: { customFieldId: cfGuestHidden.id, taskId: task.id, valueNumber: SENSITIVE_RATE_VAL },
    });
    await prisma.customFieldValue.upsert({
      where: { customFieldId_taskId: { customFieldId: cfAdminOnly.id, taskId: task.id } },
      update: { valueNumber: SENSITIVE_MARGIN_VAL },
      create: { customFieldId: cfAdminOnly.id, taskId: task.id, valueNumber: SENSITIVE_MARGIN_VAL },
    });

    // 5. Guest reads task via GET /api/tasks/:id
    const guestRead = await api(`/api/tasks/${task.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(guestRead.status, 200);
    const guestTask = guestRead.data.task;

    // Check customFieldValues array in parsed object
    assert.ok(Array.isArray(guestTask.customFieldValues));
    assert.equal(guestTask.customFieldValues.length, 1, "Guest must strictly receive exactly 1 non-hidden field");
    assert.equal(guestTask.customFieldValues[0].customField.fieldKey, "cf_adv_public");
    assert.equal(guestTask.customFieldValues[0].valueText, PUBLIC_TAG_VAL);

    // Deep adversarial inspection: Zero verbatim leakage in raw response text
    assert.equal(guestRead.rawText.includes(String(SENSITIVE_RATE_VAL)), false, "Raw response must NOT contain contractor rate value");
    assert.equal(guestRead.rawText.includes("cf_adv_contractor_rate"), false, "Raw response must NOT leak contractor rate key");
    assert.equal(guestRead.rawText.includes("Secret Contractor Hourly Rate"), false, "Raw response must NOT leak contractor rate name");

    assert.equal(guestRead.rawText.includes(String(SENSITIVE_MARGIN_VAL)), false, "Raw response must NOT contain gross margin value");
    assert.equal(guestRead.rawText.includes("cf_adv_gross_margin"), false, "Raw response must NOT leak gross margin key");
    assert.equal(guestRead.rawText.includes("Executive Gross Margin Pct"), false, "Raw response must NOT leak gross margin name");
  });

  test("CHALLENGE 4.2: Regular member receives non-admin fields but NOT adminOnly fields (Zero String Leakage)", async () => {
    const taskId = createdTaskIds[createdTaskIds.length - 1];

    const memberRead = await api(`/api/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(memberRead.status, 200);
    const memberTask = memberRead.data.task;

    // Member sees cf_adv_public and cf_adv_contractor_rate (hideFromGuests: true, adminOnly: false)
    assert.ok(Array.isArray(memberTask.customFieldValues));
    assert.equal(memberTask.customFieldValues.length, 2, "Member should see public and guest-hidden non-admin fields");

    const keys = memberTask.customFieldValues.map((cfv) => cfv.customField.fieldKey);
    assert.ok(keys.includes("cf_adv_public"));
    assert.ok(keys.includes("cf_adv_contractor_rate"));
    assert.ok(!keys.includes("cf_adv_gross_margin"), "Member must NOT receive adminOnly key");

    // Zero raw text leakage of admin-only secrets
    assert.equal(memberRead.rawText.includes("42.8"), false, "Raw response must NOT contain adminOnly value 42.8");
    assert.equal(memberRead.rawText.includes("cf_adv_gross_margin"), false, "Raw response must NOT leak adminOnly fieldKey");
    assert.equal(memberRead.rawText.includes("Executive Gross Margin Pct"), false, "Raw response must NOT leak adminOnly field name");
  });

  test("CHALLENGE 4.3: Task listing GET /api/tasks strictly masks fields for guest and regular member", async () => {
    const projId = createdProjectIds[createdProjectIds.length - 1];

    // Guest lists tasks in project
    const guestList = await api(`/api/tasks?projectId=${projId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(guestList.status, 200);
    assert.equal(guestList.rawText.includes("cf_adv_contractor_rate"), false, "Guest list must not leak contractor rate");
    assert.equal(guestList.rawText.includes("cf_adv_gross_margin"), false, "Guest list must not leak gross margin");

    // Member lists tasks in project
    const memberList = await api(`/api/tasks?projectId=${projId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(memberList.status, 200);
    assert.equal(memberList.rawText.includes("cf_adv_gross_margin"), false, "Member list must not leak gross margin");
  });

  test("CHALLENGE 4.4: Super Admin receives ALL custom fields without any masking", async () => {
    const taskId = createdTaskIds[createdTaskIds.length - 1];

    const adminRead = await api(`/api/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(adminRead.status, 200);
    const adminTask = adminRead.data.task;
    assert.ok(Array.isArray(adminTask.customFieldValues));
    assert.equal(adminTask.customFieldValues.length, 3, "Admin must receive all 3 attached fields");
    const keys = adminTask.customFieldValues.map((cfv) => cfv.customField.fieldKey);
    assert.ok(keys.includes("cf_adv_public"));
    assert.ok(keys.includes("cf_adv_contractor_rate"));
    assert.ok(keys.includes("cf_adv_gross_margin"));
  });

  test("CHALLENGE 4.5: Masking of financialBudget, securityTier, and internalCostCode on tasks when fetched by guest accounts", async () => {
    // 1. Create a dedicated project
    const projRes = await api("/api/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        name: `Adversarial Sensitive Fields Proj ${Date.now()}`,
        status: "ACTIVE",
      },
    });
    const proj = projRes.data.project || projRes.data;
    createdProjectIds.push(proj.id);

    // 2. Create the exact sensitive custom fields named in specification:
    // - financialBudget (hideFromGuests: true, adminOnly: false)
    // - securityTier (hideFromGuests: true, adminOnly: true)
    // - internalCostCode (hideFromGuests: true, adminOnly: false)
    // Plus a non-sensitive public field
    const cfBudget = await prisma.customField.upsert({
      where: { organizationId_fieldKey: { organizationId: acmeOrg.id, fieldKey: "financialBudget" } },
      update: { hideFromGuests: true, adminOnly: false },
      create: {
        organizationId: acmeOrg.id,
        name: "Financial Budget",
        fieldKey: "financialBudget",
        fieldType: "NUMBER",
        hideFromGuests: true,
        adminOnly: false,
      },
    });
    createdCustomFieldIds.push(cfBudget.id);

    const cfSecurity = await prisma.customField.upsert({
      where: { organizationId_fieldKey: { organizationId: acmeOrg.id, fieldKey: "securityTier" } },
      update: { hideFromGuests: true, adminOnly: true },
      create: {
        organizationId: acmeOrg.id,
        name: "Security Tier",
        fieldKey: "securityTier",
        fieldType: "TEXT",
        hideFromGuests: true,
        adminOnly: true,
      },
    });
    createdCustomFieldIds.push(cfSecurity.id);

    const cfCostCode = await prisma.customField.upsert({
      where: { organizationId_fieldKey: { organizationId: acmeOrg.id, fieldKey: "internalCostCode" } },
      update: { hideFromGuests: true, adminOnly: false },
      create: {
        organizationId: acmeOrg.id,
        name: "Internal Cost Code",
        fieldKey: "internalCostCode",
        fieldType: "TEXT",
        hideFromGuests: true,
        adminOnly: false,
      },
    });
    createdCustomFieldIds.push(cfCostCode.id);

    const cfPublicTag = await prisma.customField.upsert({
      where: { organizationId_fieldKey: { organizationId: acmeOrg.id, fieldKey: "publicSprintTag" } },
      update: { hideFromGuests: false, adminOnly: false },
      create: {
        organizationId: acmeOrg.id,
        name: "Public Sprint Tag",
        fieldKey: "publicSprintTag",
        fieldType: "TEXT",
        hideFromGuests: false,
        adminOnly: false,
      },
    });
    createdCustomFieldIds.push(cfPublicTag.id);

    // 3. Create task assigned to guest
    const taskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        projectId: proj.id,
        title: `Enterprise Deliverable with Sensitive Financial Attributes ${Date.now()}`,
        priority: "URGENT",
        status: "IN_PROGRESS",
        assigneeId: guestUser.id,
      },
    });
    const task = taskRes.data.task || taskRes.data;
    createdTaskIds.push(task.id);

    // 4. Attach values
    const SENSITIVE_BUDGET_VAL = 850000.5;
    const SENSITIVE_SECURITY_VAL = "TOP-SECRET-TIER-5";
    const SENSITIVE_COSTCODE_VAL = "CC-90210-INTERNAL";
    const PUBLIC_TAG_VAL = "public-v1.0";

    await prisma.customFieldValue.upsert({
      where: { customFieldId_taskId: { customFieldId: cfBudget.id, taskId: task.id } },
      update: { valueNumber: SENSITIVE_BUDGET_VAL },
      create: { customFieldId: cfBudget.id, taskId: task.id, valueNumber: SENSITIVE_BUDGET_VAL },
    });
    await prisma.customFieldValue.upsert({
      where: { customFieldId_taskId: { customFieldId: cfSecurity.id, taskId: task.id } },
      update: { valueText: SENSITIVE_SECURITY_VAL },
      create: { customFieldId: cfSecurity.id, taskId: task.id, valueText: SENSITIVE_SECURITY_VAL },
    });
    await prisma.customFieldValue.upsert({
      where: { customFieldId_taskId: { customFieldId: cfCostCode.id, taskId: task.id } },
      update: { valueText: SENSITIVE_COSTCODE_VAL },
      create: { customFieldId: cfCostCode.id, taskId: task.id, valueText: SENSITIVE_COSTCODE_VAL },
    });
    await prisma.customFieldValue.upsert({
      where: { customFieldId_taskId: { customFieldId: cfPublicTag.id, taskId: task.id } },
      update: { valueText: PUBLIC_TAG_VAL },
      create: { customFieldId: cfPublicTag.id, taskId: task.id, valueText: PUBLIC_TAG_VAL },
    });

    // 5. Guest accesses task via GET /api/tasks/:id
    const guestRead = await api(`/api/tasks/${task.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(guestRead.status, 200);
    const guestTask = guestRead.data.task;

    // Check customFieldValues array in parsed JSON
    assert.ok(Array.isArray(guestTask.customFieldValues));
    assert.equal(guestTask.customFieldValues.length, 1, "Guest must strictly receive only public fields");
    assert.equal(guestTask.customFieldValues[0].customField.fieldKey, "publicSprintTag");
    assert.equal(guestTask.customFieldValues[0].valueText, PUBLIC_TAG_VAL);

    // Deep adversarial inspection: Zero string leakage in raw response
    assert.equal(guestRead.rawText.includes(String(SENSITIVE_BUDGET_VAL)), false, "Raw response must NOT contain financialBudget value");
    assert.equal(guestRead.rawText.includes("financialBudget"), false, "Raw response must NOT contain financialBudget fieldKey");
    assert.equal(guestRead.rawText.includes("Financial Budget"), false, "Raw response must NOT contain financialBudget name");

    assert.equal(guestRead.rawText.includes(SENSITIVE_SECURITY_VAL), false, "Raw response must NOT contain securityTier value");
    assert.equal(guestRead.rawText.includes("securityTier"), false, "Raw response must NOT contain securityTier fieldKey");
    assert.equal(guestRead.rawText.includes("Security Tier"), false, "Raw response must NOT contain securityTier name");

    assert.equal(guestRead.rawText.includes(SENSITIVE_COSTCODE_VAL), false, "Raw response must NOT contain internalCostCode value");
    assert.equal(guestRead.rawText.includes("internalCostCode"), false, "Raw response must NOT contain internalCostCode fieldKey");
    assert.equal(guestRead.rawText.includes("Internal Cost Code"), false, "Raw response must NOT contain internalCostCode name");

    // 6. Guest accesses tasks via GET /api/tasks?projectId=...
    const guestList = await api(`/api/tasks?projectId=${proj.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(guestList.status, 200);
    assert.equal(guestList.rawText.includes(String(SENSITIVE_BUDGET_VAL)), false, "List response must NOT contain financialBudget value");
    assert.equal(guestList.rawText.includes(SENSITIVE_SECURITY_VAL), false, "List response must NOT contain securityTier value");
    assert.equal(guestList.rawText.includes(SENSITIVE_COSTCODE_VAL), false, "List response must NOT contain internalCostCode value");

    // 7. Regular Member reads task: sees financialBudget and internalCostCode, but NOT securityTier (adminOnly)
    const memberRead = await api(`/api/tasks/${task.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(memberRead.status, 200);
    const memberTask = memberRead.data.task;
    assert.ok(Array.isArray(memberTask.customFieldValues));
    assert.equal(memberTask.customFieldValues.length, 3, "Member sees public, budget, and cost code, but NOT securityTier");
    const memberKeys = memberTask.customFieldValues.map((cfv) => cfv.customField.fieldKey);
    assert.ok(memberKeys.includes("publicSprintTag"));
    assert.ok(memberKeys.includes("financialBudget"));
    assert.ok(memberKeys.includes("internalCostCode"));
    assert.ok(!memberKeys.includes("securityTier"), "Member must NOT receive adminOnly securityTier");
    assert.equal(memberRead.rawText.includes(SENSITIVE_SECURITY_VAL), false, "Member raw response must NOT contain securityTier secret");

    // 8. Super Admin reads task: sees all 4 fields verbatim
    const adminRead = await api(`/api/tasks/${task.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(adminRead.status, 200);
    const adminTask = adminRead.data.task;
    assert.ok(Array.isArray(adminTask.customFieldValues));
    assert.equal(adminTask.customFieldValues.length, 4, "Admin must receive all 4 fields");
  });

  // =========================================================================
  // CHALLENGE 5: Access Request Review Authorization & Self-Approval Prevention
  // =========================================================================

  test("CHALLENGE 5.1: Non-admin member attempting to self-approve their own access request receives HTTP 403 Forbidden", async () => {
    let targetSpaceId = createdSpaceIds[0];
    if (!targetSpaceId) {
      const sp = await prisma.space.findFirst({ where: { organizationId: acmeOrg.id } });
      targetSpaceId = sp?.id;
    }
    if (!targetSpaceId) {
      const sp = await prisma.space.create({
        data: {
          organizationId: acmeOrg.id,
          name: "Adv Probe Space",
          slug: `adv-probe-space-${Date.now()}`,
          isPrivate: true,
        },
      });
      targetSpaceId = sp.id;
      createdSpaceIds.push(sp.id);
    }

    // Member submits access request
    const reqRes = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: targetSpaceId,
        requestedLevel: "FULL",
        justification: "Trying to self-escalate privileges to FULL",
      },
    });
    assert.ok([200, 201].includes(reqRes.status));
    const reqData = reqRes.data.accessRequest || reqRes.data;
    createdAccessRequestIds.push(reqData.id);

    // CRITICAL EXPLOIT PROBE: Member attempts to approve their OWN access request
    const exploitRes = await api(`/api/access-requests/${reqData.id}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "APPROVED",
      },
    });

    assert.equal(
      exploitRes.status,
      403,
      `Non-admin member self-approval attempt must be rejected with HTTP 403 Forbidden; got ${exploitRes.status}`
    );
    assert.equal(exploitRes.data.error, "Forbidden: You do not have permission to review access requests");
  });

  test("CHALLENGE 5.2: Non-admin member attempting to review (approve/reject) another member's access request receives HTTP 403 Forbidden", async () => {
    let targetSpaceId = createdSpaceIds[0];
    if (!targetSpaceId) {
      const sp = await prisma.space.findFirst({ where: { organizationId: acmeOrg.id } });
      targetSpaceId = sp?.id;
    }
    if (!targetSpaceId) {
      const sp = await prisma.space.create({
        data: {
          organizationId: acmeOrg.id,
          name: "Adv Probe Space",
          slug: `adv-probe-space-${Date.now()}`,
          isPrivate: true,
        },
      });
      targetSpaceId = sp.id;
      createdSpaceIds.push(sp.id);
    }

    // Member 1 submits request
    const reqRes = await api("/api/access-requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${memberToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        resourceType: "SPACE",
        resourceId: targetSpaceId,
        requestedLevel: "EDIT",
        justification: "Peer review exploit test",
      },
    });
    const reqData = reqRes.data.accessRequest || reqRes.data;
    createdAccessRequestIds.push(reqData.id);

    // Member 2 (different non-admin user) attempts to approve Member 1's request
    const peerRes = await api(`/api/access-requests/${reqData.id}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        status: "APPROVED",
      },
    });

    assert.equal(
      peerRes.status,
      403,
      `Non-admin peer review attempt must be rejected with HTTP 403 Forbidden; got ${peerRes.status}`
    );
  });

  test("CHALLENGE 5.3: Viewer user attempting review receives HTTP 403 Forbidden", async () => {
    const reqId = createdAccessRequestIds[0];

    const viewerRes = await api(`/api/access-requests/${reqId}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "REJECTED", rejectionReason: "Rejected by viewer" },
    });

    assert.equal(viewerRes.status, 403, "Viewer user review attempt must return HTTP 403 Forbidden");
  });

  test("CHALLENGE 5.4: Guest collaborator attempting review receives HTTP 403 Forbidden", async () => {
    const reqId = createdAccessRequestIds[0];

    const guestRes = await api(`/api/access-requests/${reqId}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: { status: "APPROVED" },
    });

    assert.equal(guestRes.status, 403, "Guest user review attempt must return HTTP 403 Forbidden");
  });

  test("CHALLENGE 5.5: Non-admin member listing access requests only sees their own requests", async () => {
    // Member 2 lists access requests in Acme Corp
    const listRes = await api("/api/access-requests", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(listRes.status, 200);
    const requests = Array.isArray(listRes.data) ? listRes.data : (listRes.data.accessRequests || []);
    // Member 2 should not see Member 1's requests
    for (const r of requests) {
      assert.equal(
        r.requesterMembershipId,
        acmeMember2Membership.id,
        "Non-admin member must only see their own access requests in GET /api/access-requests"
      );
    }
  });

  test("CHALLENGE 5.6: Non-admin member probing GET /api/access-requests/:id of another member receives HTTP 403 Forbidden", async () => {
    // Explicitly create an access request by Member 1 in Acme Corp
    let targetSpaceId = createdSpaceIds[0];
    if (!targetSpaceId) {
      const sp = await prisma.space.findFirst({ where: { organizationId: acmeOrg.id } });
      targetSpaceId = sp?.id;
    }
    if (!targetSpaceId) {
      const sp = await prisma.space.create({
        data: {
          organizationId: acmeOrg.id,
          name: "Adv Probe Space",
          slug: `adv-probe-space-${Date.now()}`,
          isPrivate: true,
        },
      });
      targetSpaceId = sp.id;
      createdSpaceIds.push(sp.id);
    }
    const member1Req = await prisma.accessRequest.create({
      data: {
        organizationId: acmeOrg.id,
        requesterMembershipId: acmeMemberMembership.id,
        resourceType: "SPACE",
        resourceId: targetSpaceId,
        requestedLevel: "VIEW",
        justification: "Confidential audit request by Member 1",
      },
    });
    createdAccessRequestIds.push(member1Req.id);

    // Member 2 (different non-admin user in same org) attempts direct inspection
    const probe = await api(`/api/access-requests/${member1Req.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member2Token}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    assert.equal(
      probe.status,
      403,
      `Non-admin member probing another member's access request must receive HTTP 403 Forbidden; got ${probe.status}`
    );
    assert.equal(probe.data.error, "Forbidden: You cannot view this access request");
  });
});
