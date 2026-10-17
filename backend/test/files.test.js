import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
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
  let bodyPayload;
  if (typeof options.body === "string") {
    bodyPayload = options.body;
  } else if (options.body !== undefined) {
    bodyPayload = JSON.stringify(options.body);
  }
  const response = await fetch(url, {
    ...options,
    headers,
    body: bodyPayload,
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

async function getAuthSession(persona = "super-admin", organizationSlug = "acme-corp") {
  const res = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona, organizationSlug },
  });
  assert.equal(res.status, 200, `Failed to authenticate persona: ${persona}`);
  return {
    token: res.data.accessToken,
    orgId: res.data.activeOrganization.id,
    user: res.data.user,
  };
}

test("TASK-405: File Asset Directory, Project Association & Bulk Metadata Operations", async (t) => {
  const adminAcme = await getAuthSession("super-admin", "acme-corp");
  const memberAcme = await getAuthSession("team-member", "acme-corp");
  const viewerAcme = await getAuthSession("stakeholder", "acme-corp");
  const adminNova = await getAuthSession("super-admin", "nova-labs");

  // Fetch or create sample projects in Acme
  let projectA = await prisma.project.findFirst({
    where: { organizationId: adminAcme.orgId, deletedAt: null },
  });
  if (!projectA) {
    projectA = await prisma.project.create({
      data: {
        organizationId: adminAcme.orgId,
        name: "Test Project A",
        key: "TPA",
      },
    });
  }

  let projectB = await prisma.project.create({
    data: {
      organizationId: adminAcme.orgId,
      name: `Test Project B ${Date.now()}`,
      key: `TPB${Date.now()}`.slice(0, 10),
    },
  });

  // Project in Nova (for cross-tenant checks)
  let projectNova = await prisma.project.findFirst({
    where: { organizationId: adminNova.orgId, deletedAt: null },
  });
  if (!projectNova) {
    projectNova = await prisma.project.create({
      data: {
        organizationId: adminNova.orgId,
        name: "Nova Project",
        key: "NVP",
      },
    });
  }

  await t.test("REQ 1 [US-FILE-001 / Tenant Isolation]: List files strictly scoped to tenant", async () => {
    const res = await api("/api/files", {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.files));
    assert.equal(typeof res.data.total, "number");
    for (const f of res.data.files) {
      assert.equal(f.organizationId, adminAcme.orgId);
    }
  });

  await t.test("REQ 2 [US-FILE-001 / Upload]: Create file asset with project association", async () => {
    const res = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        name: "architecture_diagram_v1.png",
        projectId: projectA.id,
        sizeBytes: 1048576,
        fileType: "Image",
      },
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.file);
    assert.equal(res.data.file.name, "architecture_diagram_v1.png");
    assert.equal(res.data.file.projectId, projectA.id);
    assert.equal(res.data.file.project.name, projectA.name);
  });

  await t.test("REQ 3 [US-FILE-001 / Project Filter & Search]: Filter by projectId and query q", async () => {
    // Create another file in Project B
    await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        name: "database_schema.sql",
        projectId: projectB.id,
        sizeBytes: 2048,
        fileType: "SQL File",
      },
    });

    // Query filtered by Project B
    const filterRes = await api(`/api/files?projectId=${projectB.id}`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(filterRes.status, 200);
    assert.ok(filterRes.data.files.length >= 1);
    for (const f of filterRes.data.files) {
      assert.equal(f.projectId, projectB.id);
    }

    // Query searched by 'schema'
    const searchRes = await api("/api/files?q=schema", {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.data.files.some((f) => f.name.includes("schema")));
  });

  await t.test("REQ 4 [US-FILE-004 / Sorting & Pagination]: Returns pagination metadata and sorts cleanly", async () => {
    const res = await api("/api/files?sortBy=name&sortOrder=asc&page=1&limit=5", {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.total >= 1);
    assert.equal(res.data.page, 1);
    assert.equal(res.data.limit, 5);
    assert.ok(res.data.totalPages >= 1);
    assert.ok(Array.isArray(res.data.files));
  });

  await t.test("REQ 5 [US-FILE-001 / Cross-Tenant Rejection]: Reject file creation with project from another tenant", async () => {
    const res = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        name: "infiltrator.pdf",
        projectId: projectNova.id, // Belonging to Nova Labs!
        sizeBytes: 512,
        fileType: "PDF",
      },
    });
    assert.equal(res.status, 404);
  });

  await t.test("REQ 6 [US-FILE-005 / Reassignment]: Update file name and reassign to different project", async () => {
    // Create test file
    const createRes = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        name: "draft_spec.md",
        projectId: projectA.id,
        sizeBytes: 1024,
        fileType: "Markdown",
      },
    });
    const fileId = createRes.data.file.id;

    // Update name and reassign to Project B
    const updateRes = await api(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        name: "final_spec.md",
        projectId: projectB.id,
      },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.file.name, "final_spec.md");
    assert.equal(updateRes.data.file.projectId, projectB.id);
  });

  await t.test("REQ 7 [US-FILE-005 / Cross-Tenant Move Rejection]: Reject moving file to project in another organization", async () => {
    const createRes = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        name: "confidential_asset.zip",
        projectId: projectA.id,
        sizeBytes: 4096,
        fileType: "ZIP File",
      },
    });
    const fileId = createRes.data.file.id;

    // Attempt moving to Nova project
    const updateRes = await api(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        projectId: projectNova.id,
      },
    });
    assert.equal(updateRes.status, 404);
  });

  await t.test("REQ 8 [US-FILE-003 / Bulk Duplicate]: Duplicates files appending (Copy) suffix", async () => {
    // Create source files
    const file1Res = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        name: "design_system.fig",
        projectId: projectA.id,
        sizeBytes: 524288,
        fileType: "Figma File",
      },
    });
    const file2Res = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        name: "LICENSE",
        projectId: projectA.id,
        sizeBytes: 1024,
        fileType: "Markdown",
      },
    });

    const fileIds = [file1Res.data.file.id, file2Res.data.file.id];

    const dupRes = await api("/api/files/bulk-duplicate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { fileIds },
    });

    assert.equal(dupRes.status, 200);
    assert.equal(dupRes.data.success, true);
    assert.equal(dupRes.data.duplicates.length, 2);

    const dup1 = dupRes.data.duplicates.find((d) => d.name.includes("design_system"));
    const dup2 = dupRes.data.duplicates.find((d) => d.name.includes("LICENSE"));

    assert.equal(dup1.name, "design_system (Copy).fig");
    assert.equal(dup2.name, "LICENSE (Copy)");
    assert.equal(dup1.organizationId, adminAcme.orgId);
  });

  await t.test("REQ 9 [US-FILE-004 / Bulk Delete]: Deletes multiple files in single batch", async () => {
    // Create 2 files to delete
    const f1 = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { name: "temp_del_1.tmp", sizeBytes: 100, fileType: "FILE" },
    });
    const f2 = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { name: "temp_del_2.tmp", sizeBytes: 100, fileType: "FILE" },
    });

    const fileIds = [f1.data.file.id, f2.data.file.id];

    const delRes = await api("/api/files/bulk-delete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { fileIds },
    });

    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.success, true);
    assert.equal(delRes.data.count, 2);

    // Verify they are deleted
    const check1 = await api(`/api/files/${f1.data.file.id}`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(check1.status, 404);
  });

  await t.test("REQ 10 [US-FILE-004 / Single Delete]: Deletes single file asset returning HTTP 204", async () => {
    const f = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { name: "single_delete.txt", sizeBytes: 256, fileType: "FILE" },
    });

    const delRes = await api(`/api/files/${f.data.file.id}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(delRes.status, 204);

    const check = await api(`/api/files/${f.data.file.id}`, {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(check.status, 404);
  });

  await t.test("REQ 11 [TG-FILE-004 / Negative Authorization]: Viewer lacking files:upload receives HTTP 403", async () => {
    const res = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${viewerAcme.token}`,
        "x-organization-id": String(viewerAcme.orgId),
      },
      body: { name: "unauthorized.pdf", sizeBytes: 100, fileType: "PDF" },
    });
    assert.equal(res.status, 403);
  });

  await t.test("REQ 12 [TG-FILE-004 / Negative Authorization]: Team Member lacking files:delete receives HTTP 403", async () => {
    const res = await api("/api/files/bulk-delete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${memberAcme.token}`,
        "x-organization-id": String(memberAcme.orgId),
      },
      body: { fileIds: [99999] },
    });
    assert.equal(res.status, 403);
  });

  await t.test("REQ 13 [TG-FILE-004 / Negative Authorization]: Team Member lacking files:update receives HTTP 403", async () => {
    const res = await api("/api/files/bulk-duplicate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${memberAcme.token}`,
        "x-organization-id": String(memberAcme.orgId),
      },
      body: { fileIds: [99999] },
    });
    assert.equal(res.status, 403);
  });

  await t.test("REQ 14 [TG-FILE-004 / Cross-Tenant Boundary]: Nova user cannot delete or reassign Acme file", async () => {
    // Create file in Acme
    const acmeFile = await api("/api/files", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { name: "acme_secret.pdf", sizeBytes: 1024, fileType: "PDF" },
    });
    const fileId = acmeFile.data.file.id;

    // Nova admin attempts to delete Acme file using Nova org header
    const delRes = await api(`/api/files/${fileId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${adminNova.token}`,
        "x-organization-id": String(adminNova.orgId),
      },
    });
    assert.equal(delRes.status, 404);

    // Nova admin attempts to reassign Acme file
    const patchRes = await api(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminNova.token}`,
        "x-organization-id": String(adminNova.orgId),
      },
      body: { name: "hijacked.pdf" },
    });
    assert.equal(patchRes.status, 404);
  });

  await t.test("REQ 15 [TG-FILE-001 / Audit Logging]: AuditLog records file lifecycle events", async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId: adminAcme.orgId,
        resourceType: "FileAsset",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    assert.ok(logs.length >= 1);
    const actions = logs.map((l) => l.action);
    assert.ok(actions.includes("files:upload") || actions.includes("files:bulk_duplicate") || actions.includes("files:delete"));
  });
});
