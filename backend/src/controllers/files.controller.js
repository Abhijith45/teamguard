import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";

const createFileSchema = z.object({
  projectId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().min(0).default(1024),
  fileType: z.string().trim().default("FILE"),
  url: z.string().url().optional(),
});

const bulkActionSchema = z.object({
  fileIds: z.array(z.number().int().positive()).min(1),
});

export async function listFiles(req, res, next) {
  try {
    const orgId = req.organizationId;
    const { q, projectId } = req.query;

    const where = { organizationId: orgId };
    if (projectId) where.projectId = Number(projectId);
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { fileType: { contains: q, mode: "insensitive" } },
      ];
    }

    const files = await prisma.fileAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });

    return res.json({ files });
  } catch (error) {
    next(error);
  }
}

export async function createFile(req, res, next) {
  try {
    const input = createFileSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const file = await prisma.fileAsset.create({
      data: {
        organizationId: orgId,
        projectId: input.projectId ?? null,
        name: input.name,
        sizeBytes: input.sizeBytes,
        fileType: input.fileType,
        url: input.url ?? null,
        uploadedById: actorId,
      },
      include: {
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true, avatarUrl: true, email: true } },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "files:upload",
      resourceType: "FileAsset",
      resourceId: String(file.id),
      details: { name: file.name, fileType: file.fileType },
    });

    return res.status(201).json({ file });
  } catch (error) {
    next(error);
  }
}

export async function bulkDeleteFiles(req, res, next) {
  try {
    const { fileIds } = bulkActionSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const result = await prisma.fileAsset.deleteMany({
      where: {
        id: { in: fileIds },
        organizationId: orgId,
      },
    });

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
          name: `Copy of ${f.name}`,
          sizeBytes: f.sizeBytes,
          fileType: f.fileType,
          url: f.url,
          uploadedById: actorId,
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

    await prisma.fileAsset.delete({ where: { id: fileId } });

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
