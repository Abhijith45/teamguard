import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";
import {
  createPresignedUploadUrl,
  verifyS3ObjectExistence,
  createPresignedDownloadUrl,
  deleteS3Object,
  validateFileSafety,
} from "../services/storage.service.js";

const createFileSchema = z.object({
  projectId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(0).default(1024),
  fileType: z.string().trim().default("FILE"),
  mimeType: z.string().trim().optional(),
  storageKey: z.string().trim().optional(),
  url: z.string().url().optional(),
});

const requestUploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().trim().optional().default("application/octet-stream"),
  projectId: z.number().int().positive().nullable().optional(),
});

const confirmUploadSchema = z.object({
  fileId: z.number().int().positive().optional(),
  storageKey: z.string().trim().min(1).optional(),
});

const updateFileSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  projectId: z.number().int().positive().nullable().optional(),
});

const bulkActionSchema = z.object({
  fileIds: z.array(z.number().int().positive()).min(1),
});

/**
 * Appends ' (Copy)' suffix to a file name, placing it before the extension if present.
 * e.g., 'design.fig' -> 'design (Copy).fig', 'README' -> 'README (Copy)'
 */
export function getDuplicateFileName(name) {
  if (!name || typeof name !== "string") return "Untitled (Copy)";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    const base = name.slice(0, dotIndex);
    const ext = name.slice(dotIndex);
    return `${base} (Copy)${ext}`;
  }
  return `${name} (Copy)`;
}

export async function listFiles(req, res, next) {
  try {
    const orgId = req.organizationId;
    const { q, projectId, status, sortBy = "createdAt", sortOrder = "desc", page = "1", limit = "50" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where = { organizationId: orgId };
    if (projectId !== undefined && projectId !== "") {
      if (projectId === "null" || projectId === "0") {
        where.projectId = null;
      } else {
        where.projectId = Number(projectId);
      }
    }

    if (status) {
      where.status = status;
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { fileType: { contains: q, mode: "insensitive" } },
      ];
    }

    const validSortFields = ["name", "sizeBytes", "createdAt", "fileType"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDir = sortOrder.toLowerCase() === "asc" ? "asc" : "desc";

    const [total, files] = await prisma.$transaction([
      prisma.fileAsset.count({ where }),
      prisma.fileAsset.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: limitNum,
        include: {
          project: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
        },
      }),
    ]);

    return res.json({
      files,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    next(error);
  }
}

export async function getFile(req, res, next) {
  try {
    const fileId = Number(req.params.fileId);
    const orgId = req.organizationId;

    const file = await prisma.fileAsset.findFirst({
      where: { id: fileId, organizationId: orgId },
      include: {
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });

    if (!file) {
      return res.status(404).json({ error: "File not found in this organization" });
    }

    return res.json({ file });
  } catch (error) {
    next(error);
  }
}

/**
 * Request S3 Presigned Upload URL (US-STOR-001 AC 1, 2)
 */
export async function requestUploadUrl(req, res, next) {
  try {
    const input = requestUploadUrlSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: orgId, deletedAt: null },
      });
      if (!project) {
        return res.status(404).json({ error: "Target project not found in this organization" });
      }
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { storageQuotaBytes: true, usedStorageBytes: true },
    });
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const remainingQuota = Number(org.storageQuotaBytes) - Number(org.usedStorageBytes);
    if (input.sizeBytes > remainingQuota) {
      return res.status(400).json({
        error: "Storage quota exceeded for this organization",
        code: "STORAGE_QUOTA_EXCEEDED",
        remainingBytes: remainingQuota,
        requestedBytes: input.sizeBytes,
      });
    }

    const presigned = await createPresignedUploadUrl({
      organizationId: orgId,
      projectId: input.projectId,
      filename: input.filename,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      remainingStorageQuotaBytes: remainingQuota,
    });

    const file = await prisma.fileAsset.create({
      data: {
        organizationId: orgId,
        projectId: input.projectId ?? null,
        name: presigned.sanitizedFilename,
        sizeBytes: input.sizeBytes,
        fileType: presigned.sanitizedFilename.split(".").pop()?.toUpperCase() || "FILE",
        mimeType: input.mimeType,
        storageKey: presigned.storageKey,
        status: "PENDING_UPLOAD",
        uploadedById: actorId,
      },
      include: {
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });

    return res.status(200).json({
      uploadUrl: presigned.uploadUrl,
      storageKey: presigned.storageKey,
      fileId: file.id,
      file,
      expiresIn: presigned.expiresIn,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    next(error);
  }
}

/**
 * Confirm Direct S3 Upload with Server-Side HeadObject Gate (UD-002 Option A)
 */
export async function confirmUpload(req, res, next) {
  try {
    const input = confirmUploadSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const where = { organizationId: orgId };
    if (input.fileId) {
      where.id = input.fileId;
    } else if (input.storageKey) {
      where.storageKey = input.storageKey;
    } else {
      return res.status(400).json({ error: "fileId or storageKey is required" });
    }

    const file = await prisma.fileAsset.findFirst({ where });
    if (!file) {
      return res.status(404).json({ error: "File asset not found in this organization" });
    }

    if (file.status === "READY") {
      return res.json({ success: true, file, message: "File already confirmed" });
    }

    // Server-side HeadObject verification
    const headResult = await verifyS3ObjectExistence(file.storageKey, orgId);

    // Row-level lock on Organization to prevent concurrent quota race conditions
    const updatedFile = await prisma.$transaction(async (tx) => {
      const [lockedOrg] = await tx.$queryRaw`
        SELECT id, "storageQuotaBytes", "usedStorageBytes"
        FROM "Organization"
        WHERE id = ${orgId}
        FOR UPDATE;
      `;

      if (!lockedOrg) {
        throw new Error("Organization not found");
      }

      const currentUsed = BigInt(lockedOrg.usedStorageBytes || 0);
      const quota = BigInt(lockedOrg.storageQuotaBytes || 0);
      const actualSize = BigInt(headResult.contentLength ?? file.sizeBytes);

      if (currentUsed + actualSize > quota) {
        const quotaErr = new Error("Storage quota exceeded for this organization");
        quotaErr.status = 400;
        quotaErr.code = "STORAGE_QUOTA_EXCEEDED";
        throw quotaErr;
      }

      await tx.organization.update({
        where: { id: orgId },
        data: {
          usedStorageBytes: currentUsed + actualSize,
        },
      });

      return await tx.fileAsset.update({
        where: { id: file.id },
        data: {
          status: "READY",
          confirmedAt: new Date(),
          etag: headResult.etag ?? null,
          sizeBytes: Number(actualSize),
          mimeType: headResult.contentType ?? file.mimeType,
        },
        include: {
          project: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
        },
      });
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "files:upload",
      resourceType: "FileAsset",
      resourceId: String(updatedFile.id),
      details: {
        name: updatedFile.name,
        storageKey: updatedFile.storageKey,
        sizeBytes: updatedFile.sizeBytes,
        etag: updatedFile.etag,
      },
    });

    return res.json({ success: true, file: updatedFile });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    next(error);
  }
}

/**
 * Generate Presigned Download GET URL (US-STOR-001 AC 3, 4)
 */
export async function getDownloadUrl(req, res, next) {
  try {
    const fileId = Number(req.params.fileId);
    const orgId = req.organizationId;

    const file = await prisma.fileAsset.findFirst({
      where: { id: fileId, organizationId: orgId },
    });

    if (!file) {
      return res.status(404).json({ error: "File not found in this organization" });
    }

    const storageKey = file.storageKey || `tenants/${orgId}/files/${file.id}-${file.name}`;
    const downloadUrl = await createPresignedDownloadUrl({
      storageKey,
      filename: file.name,
    });

    return res.json({
      downloadUrl,
      expiresIn: 300,
      filename: file.name,
      fileId: file.id,
      mimeType: file.mimeType || "application/octet-stream",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get Organization Storage Quota & Usage (TG-STOR-001)
 */
export async function getStorageQuota(req, res, next) {
  try {
    const orgId = req.organizationId;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { storageQuotaBytes: true, usedStorageBytes: true },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const fileCount = await prisma.fileAsset.count({
      where: { organizationId: orgId, status: "READY" },
    });

    const quotaBytes = Number(org.storageQuotaBytes);
    const usedBytes = Number(org.usedStorageBytes);
    const remainingBytes = Math.max(0, quotaBytes - usedBytes);
    const usedPercentage = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10) : 0;

    return res.json({
      storageQuotaBytes: quotaBytes,
      usedStorageBytes: usedBytes,
      remainingStorageBytes: remainingBytes,
      usedPercentage,
      fileCount,
    });
  } catch (error) {
    next(error);
  }
}

export async function createFile(req, res, next) {
  try {
    const input = createFileSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: orgId, deletedAt: null },
      });
      if (!project) {
        return res.status(404).json({ error: "Target project not found in this organization" });
      }
    }

    const file = await prisma.fileAsset.create({
      data: {
        organizationId: orgId,
        projectId: input.projectId ?? null,
        name: input.name,
        sizeBytes: input.sizeBytes,
        fileType: input.fileType,
        mimeType: input.mimeType,
        storageKey: input.storageKey,
        status: "READY",
        url: input.url ?? null,
        uploadedById: actorId,
      },
      include: {
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });

    // Update organization usedStorageBytes
    if (input.sizeBytes > 0) {
      await prisma.organization.update({
        where: { id: orgId },
        data: {
          usedStorageBytes: {
            increment: input.sizeBytes,
          },
        },
      });
    }

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "files:upload",
      resourceType: "FileAsset",
      resourceId: String(file.id),
      details: { name: file.name, fileType: file.fileType, projectId: file.projectId },
    });

    return res.status(201).json({ file });
  } catch (error) {
    next(error);
  }
}

export async function updateFile(req, res, next) {
  try {
    const fileId = Number(req.params.fileId);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;
    const input = updateFileSchema.parse(req.body);

    const existing = await prisma.fileAsset.findFirst({
      where: { id: fileId, organizationId: orgId },
    });
    if (!existing) {
      return res.status(404).json({ error: "File not found in this organization" });
    }

    if (input.projectId !== undefined && input.projectId !== null) {
      const targetProject = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: orgId, deletedAt: null },
      });
      if (!targetProject) {
        return res.status(404).json({ error: "Target project not found in this organization" });
      }
    }

    const updated = await prisma.fileAsset.update({
      where: { id: fileId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "files:update",
      resourceType: "FileAsset",
      resourceId: String(fileId),
      details: {
        fileId,
        previousName: existing.name,
        newName: updated.name,
        previousProjectId: existing.projectId,
        newProjectId: updated.projectId,
      },
    });

    return res.json({ file: updated });
  } catch (error) {
    next(error);
  }
}

export async function bulkDeleteFiles(req, res, next) {
  try {
    const { fileIds } = bulkActionSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const filesToDel = await prisma.fileAsset.findMany({
      where: { id: { in: fileIds }, organizationId: orgId },
      select: { id: true, storageKey: true, sizeBytes: true },
    });

    for (const f of filesToDel) {
      if (f.storageKey) {
        try {
          await deleteS3Object(f.storageKey);
        } catch {
          // Continue cleanup
        }
      }
    }

    const totalBytesToSubtract = filesToDel.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { usedStorageBytes: true },
    });
    const newUsed = Math.max(0, Number(org?.usedStorageBytes || 0) - totalBytesToSubtract);

    const [result] = await prisma.$transaction([
      prisma.fileAsset.deleteMany({
        where: {
          id: { in: fileIds },
          organizationId: orgId,
        },
      }),
      prisma.organization.update({
        where: { id: orgId },
        data: { usedStorageBytes: BigInt(newUsed) },
      }),
    ]);

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "files:bulk_delete",
      resourceType: "FileAsset",
      resourceId: fileIds.join(","),
      details: { deletedCount: result.count, requestedIds: fileIds },
    });

    return res.json({ success: true, count: result.count });
  } catch (error) {
    next(error);
  }
}

export async function bulkDuplicateFiles(req, res, next) {
  try {
    const { fileIds } = bulkActionSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const filesToCopy = await prisma.fileAsset.findMany({
      where: {
        id: { in: fileIds },
        organizationId: orgId,
      },
    });

    const duplicates = [];
    for (const f of filesToCopy) {
      const copy = await prisma.fileAsset.create({
        data: {
          organizationId: orgId,
          projectId: f.projectId,
          name: getDuplicateFileName(f.name),
          sizeBytes: f.sizeBytes,
          fileType: f.fileType,
          mimeType: f.mimeType,
          storageKey: f.storageKey,
          status: f.status,
          url: f.url,
          uploadedById: actorId,
        },
        include: {
          project: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
        },
      });
      duplicates.push(copy);
    }

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "files:bulk_duplicate",
      resourceType: "FileAsset",
      resourceId: fileIds.join(","),
      details: { duplicatedCount: duplicates.length },
    });

    return res.json({ success: true, duplicates });
  } catch (error) {
    next(error);
  }
}

export async function deleteFile(req, res, next) {
  try {
    const fileId = Number(req.params.fileId);
    const orgId = req.organizationId;

    const existing = await prisma.fileAsset.findFirst({
      where: { id: fileId, organizationId: orgId },
    });
    if (!existing) {
      return res.status(404).json({ error: "File not found in this organization" });
    }

    if (existing.storageKey) {
      try {
        await deleteS3Object(existing.storageKey);
      } catch {
        // Continue cleanup
      }
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { usedStorageBytes: true },
    });
    const newUsed = Math.max(0, Number(org?.usedStorageBytes || 0) - (existing.sizeBytes || 0));

    await prisma.$transaction([
      prisma.fileAsset.delete({ where: { id: fileId } }),
      prisma.organization.update({
        where: { id: orgId },
        data: { usedStorageBytes: BigInt(newUsed) },
      }),
    ]);

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.auth.userId,
      action: "files:delete",
      resourceType: "FileAsset",
      resourceId: String(fileId),
      details: { name: existing.name },
    });

    return res.status(204).end();
  } catch (error) {
    next(error);
  }
}

