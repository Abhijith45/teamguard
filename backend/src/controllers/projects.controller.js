import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().default(""),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  status: z.enum(["ACTIVE", "PLANNING", "COMPLETED", "ARCHIVED"]).default("ACTIVE"),
  teamMembers: z.array(z.object({
    email: z.string().email(),
    role: z.string().optional(),
    department: z.string().optional(),
    personalMessage: z.string().optional(),
  })).optional().default([]),
  initialTasks: z.array(z.object({
    title: z.string().min(1),
    status: z.enum(["TODO", "IN_PROGRESS", "REVISION", "DONE"]).default("TODO"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  })).optional().default([]),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["ACTIVE", "PLANNING", "COMPLETED", "ARCHIVED"]).optional(),
});

export async function listProjects(req, res, next) {
  try {
    const projects = await prisma.project.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { tasks: true, files: true },
        },
      },
    });

    return res.json({ projects });
  } catch (error) {
    next(error);
  }
}

export async function getProject(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: req.organizationId },
      include: {
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        files: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found in this organization" });
    }

    return res.json({ project });
  } catch (error) {
    next(error);
  }
}

export async function createProject(req, res, next) {
  try {
    const input = createProjectSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const project = await prisma.$transaction(async (tx) => {
      // 1. Create project
      const created = await tx.project.create({
        data: {
          organizationId: orgId,
          name: input.name,
          description: input.description,
          priority: input.priority,
          status: input.status,
          progress: 0,
        },
      });

      // 2. Add initial tasks if wizard provided any
      if (input.initialTasks.length > 0) {
        for (const task of input.initialTasks) {
          await tx.task.create({
            data: {
              organizationId: orgId,
              projectId: created.id,
              title: task.title,
              status: task.status,
              priority: task.priority,
              creatorId: actorId,
            },
          });
        }
      }

      return created;
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "project:create",
      resourceType: "Project",
      resourceId: String(project.id),
      details: { name: project.name, priority: project.priority },
    });

    return res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
}

export async function updateProject(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    const input = updateProjectSchema.parse(req.body);

    const existing = await prisma.project.findFirst({
      where: { id: projectId, organizationId: req.organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Project not found in this organization" });
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: input,
    });

    await logAuditEvent({
      organizationId: req.organizationId,
      actorId: req.auth.userId,
      action: "project:update",
      resourceType: "Project",
      resourceId: String(projectId),
      details: input,
    });

    return res.json({ project: updated });
  } catch (error) {
    next(error);
  }
}

export async function deleteProject(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);

    const existing = await prisma.project.findFirst({
      where: { id: projectId, organizationId: req.organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Project not found in this organization" });
    }

    await prisma.project.delete({
      where: { id: projectId },
    });

    await logAuditEvent({
      organizationId: req.organizationId,
      actorId: req.auth.userId,
      action: "project:delete",
      resourceType: "Project",
      resourceId: String(projectId),
      details: { name: existing.name },
    });

    return res.status(204).end();
  } catch (error) {
    next(error);
  }
}
