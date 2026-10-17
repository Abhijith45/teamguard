import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { mockStorageEngine } from "../src/services/storage.service.js";

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

test("TASK-502: Persistent S3-Compatible Object Storage Engine & Quotas (UD-002)", async (t) => {
  const adminAcme = await getAuthSession("super-admin", "acme-corp");
  const memberAcme = await getAuthSession("team-member", "acme-corp");
  const viewerAcme = await getAuthSession("stakeholder", "acme-corp");
  const adminNova = await getAuthSession("super-admin", "nova-labs");

  // Ensure test projects exist
  let projectAcme = await prisma.project.findFirst({
    where: { organizationId: adminAcme.orgId, deletedAt: null },
  });
  if (!projectAcme) {
    projectAcme = await prisma.project.create({
      data: {
        organizationId: adminAcme.orgId,
        name: "Storage Test Project Acme",
        key: "STPA",
      },
    });
  }

  let projectNova = await prisma.project.findFirst({
    where: { organizationId: adminNova.orgId, deletedAt: null },
  });
  if (!projectNova) {
    projectNova = await prisma.project.create({
      data: {
        organizationId: adminNova.orgId,
        name: "Storage Test Project Nova",
        key: "STPN",
      },
    });
  }

  await t.test("REQ 1 [US-STOR-001 AC 1 / TG-STOR-001]: Generate 15-minute presigned upload PUT URL with tenant-partitioned key", async () => {
    const res = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "architecture-design.pdf",
        sizeBytes: 5 * 1024 * 1024, // 5 MB
        mimeType: "application/pdf",
        projectId: projectAcme.id,
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.uploadUrl, "Expected uploadUrl in response");
    assert.equal(res.data.expiresIn, 900, "Expected 15-minute TTL (900 seconds)");
    assert.ok(
      res.data.storageKey.startsWith(`tenants/${adminAcme.orgId}/projects/${projectAcme.id}/files/`),
      `Expected storage key to match tenant partition pattern, got: ${res.data.storageKey}`
    );
    assert.ok(res.data.fileId, "Expected fileId in response");
    assert.equal(res.data.file.status, "PENDING_UPLOAD", "Expected initial status to be PENDING_UPLOAD");
    assert.equal(res.data.file.sizeBytes, 5 * 1024 * 1024);
  });

  await t.test("REQ 2 [US-STOR-001 / Versioning]: Dual endpoint support for /api/v1/files/upload-url", async () => {
    const res = await api("/api/v1/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "dataset-v1.csv",
        sizeBytes: 1024,
        mimeType: "text/csv",
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.uploadUrl);
    assert.ok(res.data.storageKey.startsWith(`tenants/${adminAcme.orgId}/unassigned/files/`));
  });

  await t.test("REQ 3 [US-STOR-001 / Sanitization]: Sanitize path traversal characters from filenames", async () => {
    const res = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "../../../etc/passwd.png",
        sizeBytes: 2048,
        mimeType: "image/png",
      },
    });

    assert.equal(res.status, 200);
    assert.ok(!res.data.storageKey.includes("../"), "Storage key must not contain relative path traversal");
    assert.ok(res.data.file.name.includes("etc_passwd.png") || !res.data.file.name.includes("../"));
  });

  await t.test("REQ 4 [US-STOR-001 AC 2 / Security]: Disallow executable binary files with HTTP 400", async () => {
    const dangerousExtensions = ["malware.exe", "install.sh", "script.bat", "payload.cmd", "agent.bin"];

    for (const filename of dangerousExtensions) {
      const res = await api("/api/files/upload-url", {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
        body: {
          filename,
          sizeBytes: 1024,
          mimeType: "application/octet-stream",
        },
      });

      assert.equal(res.status, 400, `Expected 400 for ${filename}`);
      assert.equal(res.data.error, "Disallowed file type: executable binaries cannot be uploaded");
    }
  });

  await t.test("REQ 5 [US-STOR-001 / Quota]: Reject files exceeding 50 MB with HTTP 400", async () => {
    const res = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "huge-archive.zip",
        sizeBytes: 52428801, // 50 MB + 1 byte
        mimeType: "application/zip",
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.error, "File exceeds maximum size limit of 50 MB");
  });

  await t.test("REQ 6 [US-STOR-001 / Quota]: Reject requests exceeding remaining organization quota", async () => {
    // Temporarily reduce organization storage quota to 10 KB
    const orgBefore = await prisma.organization.findUnique({
      where: { id: adminAcme.orgId },
    });

    await prisma.organization.update({
      where: { id: adminAcme.orgId },
      data: { storageQuotaBytes: BigInt(10000), usedStorageBytes: BigInt(9000) },
    });

    try {
      const res = await api("/api/files/upload-url", {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminAcme.token}`,
          "x-organization-id": String(adminAcme.orgId),
        },
        body: {
          filename: "report.pdf",
          sizeBytes: 2000, // Exceeds remaining 1000 bytes
          mimeType: "application/pdf",
        },
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.error, "Storage quota exceeded for this organization");
      assert.equal(res.data.code, "STORAGE_QUOTA_EXCEEDED");
    } finally {
      // Restore original quota
      await prisma.organization.update({
        where: { id: adminAcme.orgId },
        data: {
          storageQuotaBytes: orgBefore.storageQuotaBytes,
          usedStorageBytes: orgBefore.usedStorageBytes,
        },
      });
    }
  });

  await t.test("REQ 7 [US-STOR-001 / Tenant Isolation]: Reject upload URL request with foreign projectId (HTTP 404)", async () => {
    const res = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "cross-project.pdf",
        sizeBytes: 1024,
        mimeType: "application/pdf",
        projectId: projectNova.id, // Belongs to Nova Labs!
      },
    });

    assert.equal(res.status, 404);
    assert.equal(res.data.error, "Target project not found in this organization");
  });

  await t.test("REQ 8 [UD-002 Option A / Confirmation Gate]: Confirm fails if object missing in S3 bucket (HTTP 400)", async () => {
    const uploadRes = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "unuploaded-file.png",
        sizeBytes: 2048,
        mimeType: "image/png",
      },
    });
    assert.equal(uploadRes.status, 200);

    // Call confirm without uploading binary to S3
    const confirmRes = await api("/api/files/confirm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        fileId: uploadRes.data.fileId,
      },
    });

    assert.equal(confirmRes.status, 400);
    assert.equal(confirmRes.data.error, "Object not found in storage bucket. Direct upload may have failed.");
  });

  await t.test("REQ 9 [UD-002 Option A / Confirmation Gate]: Successful confirmation updates status to READY, sets etag, and increments usedStorageBytes", async () => {
    const orgBefore = await prisma.organization.findUnique({
      where: { id: adminAcme.orgId },
    });
    const usedBefore = Number(orgBefore.usedStorageBytes);

    const uploadRes = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "verified-document.pdf",
        sizeBytes: 4096,
        mimeType: "application/pdf",
      },
    });
    assert.equal(uploadRes.status, 200);

    // Simulate direct client PUT upload into S3 storage
    const fakeBuffer = Buffer.alloc(4096, "A");
    mockStorageEngine.putObject(uploadRes.data.storageKey, fakeBuffer, "application/pdf");

    // Call confirm endpoint
    const confirmRes = await api("/api/files/confirm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        fileId: uploadRes.data.fileId,
      },
    });

    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.data.file.status, "READY");
    assert.ok(confirmRes.data.file.confirmedAt, "Expected confirmedAt timestamp");
    assert.ok(confirmRes.data.file.etag, "Expected ETag on confirmed file");
    assert.equal(confirmRes.data.file.sizeBytes, 4096);

    // Verify Organization usedStorageBytes incremented
    const orgAfter = await prisma.organization.findUnique({
      where: { id: adminAcme.orgId },
    });
    assert.equal(Number(orgAfter.usedStorageBytes), usedBefore + 4096);
  });

  await t.test("REQ 10 [UD-002 / Idempotency]: Re-confirming an already READY file does not double-charge storage quota", async () => {
    const uploadRes = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "idempotent-doc.pdf",
        sizeBytes: 2048,
        mimeType: "application/pdf",
      },
    });
    mockStorageEngine.putObject(uploadRes.data.storageKey, Buffer.alloc(2048, "B"), "application/pdf");

    await api("/api/files/confirm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { fileId: uploadRes.data.fileId },
    });

    const orgMid = await prisma.organization.findUnique({ where: { id: adminAcme.orgId } });
    const usedMid = Number(orgMid.usedStorageBytes);

    // Second confirmation call
    const res2 = await api("/api/files/confirm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { fileId: uploadRes.data.fileId },
    });
    assert.equal(res2.status, 200);

    const orgAfter = await prisma.organization.findUnique({ where: { id: adminAcme.orgId } });
    assert.equal(Number(orgAfter.usedStorageBytes), usedMid, "Used storage must remain identical on idempotent confirmation");
  });

  await t.test("REQ 11 [US-STOR-001 AC 3 / TG-STOR-001]: Generate 5-minute presigned download GET URL for tenant members", async () => {
    const uploadRes = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "downloadable-spec.pdf",
        sizeBytes: 1024,
        mimeType: "application/pdf",
      },
    });
    mockStorageEngine.putObject(uploadRes.data.storageKey, Buffer.alloc(1024), "application/pdf");
    await api("/api/files/confirm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { fileId: uploadRes.data.fileId },
    });

    // Request download URL as Team Member
    const downloadRes = await api(`/api/files/${uploadRes.data.fileId}/download-url`, {
      headers: {
        authorization: `Bearer ${memberAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });

    assert.equal(downloadRes.status, 200);
    assert.ok(downloadRes.data.downloadUrl, "Expected downloadUrl");
    assert.equal(downloadRes.data.expiresIn, 300, "Expected 5-minute TTL (300 seconds)");
    assert.equal(downloadRes.data.fileId, uploadRes.data.fileId);
  });

  await t.test("REQ 12 [US-STOR-001 AC 4 / Tenant Isolation]: Download URL request for file in another tenant returns HTTP 404", async () => {
    // Create file in Acme Corp
    const acmeFile = await prisma.fileAsset.create({
      data: {
        organizationId: adminAcme.orgId,
        name: "confidential-acme.pdf",
        sizeBytes: 1024,
        uploadedById: adminAcme.user.id,
        storageKey: `tenants/${adminAcme.orgId}/files/confidential.pdf`,
        status: "READY",
      },
    });

    // Admin of Nova Labs attempts to fetch download URL for Acme Corp file
    const res = await api(`/api/files/${acmeFile.id}/download-url`, {
      headers: {
        authorization: `Bearer ${adminNova.token}`,
        "x-organization-id": String(adminNova.orgId), // Nova tenant context
      },
    });

    assert.equal(res.status, 404, "Must fail closed with HTTP 404 without disclosing file existence");
    assert.equal(res.data.error, "File not found in this organization");
  });

  await t.test("REQ 13 [TG-STOR-001 / Quota Overview]: GET /api/files/quota returns accurate quota statistics", async () => {
    const res = await api("/api/files/quota", {
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });

    assert.equal(res.status, 200);
    assert.equal(typeof res.data.storageQuotaBytes, "number");
    assert.equal(typeof res.data.usedStorageBytes, "number");
    assert.equal(typeof res.data.remainingStorageBytes, "number");
    assert.equal(typeof res.data.usedPercentage, "number");
    assert.equal(typeof res.data.fileCount, "number");
    assert.ok(res.data.storageQuotaBytes > 0);
  });

  await t.test("REQ 14 [TG-STOR-001 / Lifecycle]: Deleting a file removes object from storage and decrements usedStorageBytes", async () => {
    const uploadRes = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        filename: "temp-to-delete.pdf",
        sizeBytes: 8192,
        mimeType: "application/pdf",
      },
    });
    mockStorageEngine.putObject(uploadRes.data.storageKey, Buffer.alloc(8192), "application/pdf");
    await api("/api/files/confirm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { fileId: uploadRes.data.fileId },
    });

    const orgBeforeDel = await prisma.organization.findUnique({ where: { id: adminAcme.orgId } });
    const usedBeforeDel = Number(orgBeforeDel.usedStorageBytes);

    // Delete file
    const delRes = await api(`/api/files/${uploadRes.data.fileId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
    });
    assert.equal(delRes.status, 204);

    // Verify object removed from storage engine
    assert.throws(() => {
      mockStorageEngine.headObject(uploadRes.data.storageKey);
    });

    // Verify usedStorageBytes decremented
    const orgAfterDel = await prisma.organization.findUnique({ where: { id: adminAcme.orgId } });
    assert.equal(Number(orgAfterDel.usedStorageBytes), usedBeforeDel - 8192);
  });

  await t.test("REQ 15 [TG-STOR-001 / Bulk Deletion]: Bulk deleting files decrements usedStorageBytes and cleans up storage objects", async () => {
    const file1Res = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { filename: "bulk-1.pdf", sizeBytes: 1000, mimeType: "application/pdf" },
    });
    mockStorageEngine.putObject(file1Res.data.storageKey, Buffer.alloc(1000), "application/pdf");
    await api("/api/files/confirm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { fileId: file1Res.data.fileId },
    });

    const file2Res = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { filename: "bulk-2.pdf", sizeBytes: 2000, mimeType: "application/pdf" },
    });
    mockStorageEngine.putObject(file2Res.data.storageKey, Buffer.alloc(2000), "application/pdf");
    await api("/api/files/confirm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: { fileId: file2Res.data.fileId },
    });

    const orgBefore = await prisma.organization.findUnique({ where: { id: adminAcme.orgId } });
    const usedBefore = Number(orgBefore.usedStorageBytes);

    const bulkRes = await api("/api/files/bulk-delete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminAcme.token}`,
        "x-organization-id": String(adminAcme.orgId),
      },
      body: {
        fileIds: [file1Res.data.fileId, file2Res.data.fileId],
      },
    });

    assert.equal(bulkRes.status, 200);
    assert.equal(bulkRes.data.count, 2);

    const orgAfter = await prisma.organization.findUnique({ where: { id: adminAcme.orgId } });
    assert.equal(Number(orgAfter.usedStorageBytes), usedBefore - 3000);
  });

  await t.test("REQ 16 [Negative Authorization]: Stakeholder lacking files:upload receives HTTP 403", async () => {
    const res = await api("/api/files/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${viewerAcme.token}`,
        "x-organization-id": String(viewerAcme.orgId),
      },
      body: {
        filename: "unauthorized.pdf",
        sizeBytes: 1024,
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.error, "Permission denied");
    assert.equal(res.data.requiredPermission, "files:upload");
  });
});
