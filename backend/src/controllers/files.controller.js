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
    const { q, projectId, sortBy = "createdAt", sortOrder = "desc", page = "1", limit = "50" } = req.query;

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
          name: getDuplicateFileName(f.name),
          sizeBytes: f.sizeBytes,
          fileType: f.fileType,
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
