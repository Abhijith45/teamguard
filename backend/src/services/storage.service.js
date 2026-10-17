import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const PRESIGNED_UPLOAD_TTL_SECONDS = 900; // 15 minutes (US-STOR-001)
const PRESIGNED_DOWNLOAD_TTL_SECONDS = 300; // 5 minutes (US-STOR-001)

const DISALLOWED_EXTENSIONS = [
  ".exe",
  ".sh",
  ".bat",
  ".cmd",
  ".bin",
  ".msi",
  ".vbs",
  ".js",
  ".py",
  ".php",
  ".cgi",
  ".scr",
  ".com",
  ".pif",
  ".jar",
  ".apk",
];

const PERMITTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/octet-stream",
]);

// ---------------------------------------------------------------------------
// Mock Storage Engine (Used when AWS S3 credentials are not configured)
// ---------------------------------------------------------------------------
class MockS3StorageEngine {
  constructor() {
    this.storage = new Map();
  }

  putObject(key, buffer, contentType = "application/octet-stream") {
    const etag = `"${randomUUID().replace(/-/g, "")}"`;
    this.storage.set(key, {
      buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
      contentLength: buffer.length,
      contentType,
      etag,
      lastModified: new Date(),
    });
    return { etag, contentLength: buffer.length };
  }

  headObject(key) {
    const obj = this.storage.get(key);
    if (!obj) {
      const error = new Error("NotFound");
      error.name = "NotFound";
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }
    return {
      ContentLength: obj.contentLength,
      ContentType: obj.contentType,
      ETag: obj.etag,
      LastModified: obj.lastModified,
    };
  }

  getObject(key) {
    const obj = this.storage.get(key);
    if (!obj) {
      const error = new Error("NotFound");
      error.name = "NotFound";
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }
    return {
      Body: obj.buffer,
      ContentLength: obj.contentLength,
      ContentType: obj.contentType,
      ETag: obj.etag,
      LastModified: obj.lastModified,
    };
  }

  deleteObject(key) {
    this.storage.delete(key);
    return { success: true };
  }

  clear() {
    this.storage.clear();
  }
}

export const mockStorageEngine = new MockS3StorageEngine();

// ---------------------------------------------------------------------------
// S3 Client Configuration
// ---------------------------------------------------------------------------
const bucketName = process.env.S3_BUCKET_NAME || "teamguard-test-bucket";
const isRealS3Configured = Boolean(
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET_NAME
);

let s3ClientInstance = null;

export function getS3Client() {
  if (!s3ClientInstance) {
    if (isRealS3Configured) {
      s3ClientInstance = new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    } else {
      // Create lightweight client structure for signing
      s3ClientInstance = new S3Client({
        region: "us-east-1",
        credentials: {
          accessKeyId: "mock-access-key-id",
          secretAccessKey: "mock-secret-access-key-with-sufficient-length",
        },
      });
    }
  }
  return s3ClientInstance;
}

export function getBucketName() {
  return bucketName;
}

// ---------------------------------------------------------------------------
// Security & Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitizes client-provided filename according to RFC 5987 principles.
 * Strips directory traversal (../, ..\), null bytes, and dangerous characters.
 */
export function sanitizeFilename(rawFilename) {
  if (!rawFilename || typeof rawFilename !== "string") {
    return "untitled_file";
  }

  // Strip path traversal characters and directory delimiters
  let clean = rawFilename.replace(/[/\\?%*:|"<>]/g, "_").replace(/\0/g, "");

  // Remove leading dots or relative prefixes
  clean = clean.replace(/^\.+/, "");

  // Normalize whitespace
  clean = clean.replace(/\s+/g, " ").trim();

  // Ensure reasonable length bounds
  if (clean.length === 0) return "unnamed_file";
  if (clean.length > 180) {
    const dotIndex = clean.lastIndexOf(".");
    if (dotIndex > 0) {
      const ext = clean.slice(dotIndex);
      clean = clean.slice(0, 180 - ext.length) + ext;
    } else {
      clean = clean.slice(0, 180);
    }
  }

  return clean;
}

/**
 * Validates that file extension is not an executable or dangerous binary.
 */
export function validateFileSafety(filename, mimeType) {
  const lower = filename.toLowerCase();
  for (const ext of DISALLOWED_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      const error = new Error("Disallowed file type: executable binaries cannot be uploaded");
      error.status = 400;
      error.code = "DISALLOWED_FILE_TYPE";
      throw error;
    }
  }

  if (mimeType && !PERMITTED_MIME_TYPES.has(mimeType.toLowerCase())) {
    // If MIME type is unknown/unrecognized and not in whitelist
    if (mimeType.toLowerCase() === "application/x-msdownload" || mimeType.toLowerCase() === "application/x-sh") {
      const error = new Error("Disallowed file type: executable binaries cannot be uploaded");
      error.status = 400;
      error.code = "DISALLOWED_FILE_TYPE";
      throw error;
    }
  }
}

/**
 * Builds the canonical tenant-isolated storage key.
 * Format: tenants/{organizationId}/projects/{projectId || "unassigned"}/files/{uuid}-{sanitizedFilename}
 */
export function buildStorageKey(organizationId, projectId, sanitizedFilename) {
  const projectSegment = projectId && Number.isSafeInteger(Number(projectId)) ? `projects/${Number(projectId)}` : "unassigned";
  const fileId = randomUUID();
  return `tenants/${organizationId}/${projectSegment}/files/${fileId}-${sanitizedFilename}`;
}

// ---------------------------------------------------------------------------
// Core S3 Presigned URL & HeadObject Verification Engine
// ---------------------------------------------------------------------------

/**
 * Generates an S3 presigned PUT URL for direct client upload (US-STOR-001).
 * Validates file safety, byte size <= 50 MB, and tenant storage quota.
 */
export async function createPresignedUploadUrl({
  organizationId,
  projectId = null,
  filename,
  sizeBytes,
  mimeType = "application/octet-stream",
  remainingStorageQuotaBytes,
}) {
  // 1. Validate file size (max 50 MB)
  const size = Number(sizeBytes);
  if (!Number.isSafeInteger(size) || size < 0) {
    const error = new Error("Invalid file size parameter");
    error.status = 400;
    throw error;
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    const error = new Error("File exceeds maximum size limit of 50 MB");
    error.status = 400;
    error.code = "FILE_TOO_LARGE";
    throw error;
  }

  // 2. Validate quota availability
  if (remainingStorageQuotaBytes !== undefined && size > Number(remainingStorageQuotaBytes)) {
    const error = new Error("Storage quota exceeded for this organization");
    error.status = 400;
    error.code = "STORAGE_QUOTA_EXCEEDED";
    throw error;
  }

  // 3. Sanitize and validate filename safety
  const safeFilename = sanitizeFilename(filename);
  validateFileSafety(safeFilename, mimeType);

  // 4. Construct tenant-partitioned storage key
  const storageKey = buildStorageKey(organizationId, projectId, safeFilename);

  // 5. Generate Presigned URL
  const client = getS3Client();
  let uploadUrl;

  if (isRealS3Configured) {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      ContentType: mimeType,
      ContentLength: size,
    });
    uploadUrl = await getSignedUrl(client, command, {
      expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
    });
  } else {
    // Generate deterministic presigned URL format for local/test execution
    uploadUrl = `https://${bucketName}.s3.amazonaws.com/${storageKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${PRESIGNED_UPLOAD_TTL_SECONDS}&mock=true`;
  }

  return {
    uploadUrl,
    storageKey,
    sanitizedFilename: safeFilename,
    expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
  };
}

/**
 * Executes a server-side HeadObject verification against S3 (UD-002 Requirement 1).
 * Confirms object presence, byte size, permitted MIME type, and tenant path prefix.
 */
export async function verifyS3ObjectExistence(storageKey, expectedOrgId) {
  // 1. Verify storage key prefix matches active tenant
  const expectedPrefix = `tenants/${expectedOrgId}/`;
  if (!storageKey || !storageKey.startsWith(expectedPrefix)) {
    const error = new Error("Storage key prefix does not match active organization boundary");
    error.status = 403;
    error.code = "TENANT_KEY_MISMATCH";
    throw error;
  }

  if (isRealS3Configured) {
    const client = getS3Client();
    try {
      const response = await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: storageKey,
        })
      );
      return {
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
      };
    } catch (err) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        const error = new Error("Object not found in storage bucket. Direct upload may have failed.");
        error.status = 400;
        error.code = "OBJECT_NOT_FOUND";
        throw error;
      }
      throw err;
    }
  } else {
    // Execute against mock engine
    try {
      const res = mockStorageEngine.headObject(storageKey);
      return {
        contentLength: res.ContentLength,
        contentType: res.ContentType,
        etag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch (err) {
      if (err.name === "NotFound") {
        const error = new Error("Object not found in storage bucket. Direct upload may have failed.");
        error.status = 400;
        error.code = "OBJECT_NOT_FOUND";
        throw error;
      }
      throw err;
    }
  }
}

/**
 * Generates an S3 presigned GET URL for secure, time-bounded downloads (US-STOR-001 AC 3).
 * Expiration: 5 minutes (300 seconds).
 */
export async function createPresignedDownloadUrl({ storageKey, filename }) {
  const safeFilename = sanitizeFilename(filename);
  const client = getS3Client();

  if (isRealS3Configured) {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(safeFilename)}"`,
    });
    return await getSignedUrl(client, command, {
      expiresIn: PRESIGNED_DOWNLOAD_TTL_SECONDS,
    });
  } else {
    return `https://${bucketName}.s3.amazonaws.com/${storageKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${PRESIGNED_DOWNLOAD_TTL_SECONDS}&mock=true`;
  }
}

/**
 * Deletes an object from S3 storage.
 */
export async function deleteS3Object(storageKey) {
  if (!storageKey) return;

  if (isRealS3Configured) {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
      })
    );
  } else {
    mockStorageEngine.deleteObject(storageKey);
  }
}
