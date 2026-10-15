import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "./audit.service.js";

/**
 * Projects Service (TASK-201 / US-PROJ-001 / US-PROJ-004)
 * Provides tenant-scoped project lifecycle management with soft-deletion and cascade scoping.
 */

export async function listProjectsService({ organizationId, includeDeleted = false }) {
  const where = {
    organizationId,
    ...(includeDeleted ? {} : { deletedAt: null }),
  };

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          tasks: true,
          files: true,
        },
      },
    },
  });

  return projects;
}

export async function getProjectService({ projectId, organizationId, includeDeleted = false }) {
  const where = {
    id: projectId,
    organizationId,
    ...(includeDeleted ? {} : { deletedAt: null }),
  };

  const project = await prisma.project.findFirst({
    where,
    include: {
      tasks: {
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      files: true,
      _count: {
        select: { tasks: true, files: true },
      },
    },
  });

  return project;
}

export async function createProjectService({ organizationId, actorId, input }) {
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description || "",
        priority: input.priority || "MEDIUM",
        status: input.status || "ACTIVE",
        progress: 0,
        deletedAt: null,
      },
    });

    if (Array.isArray(input.initialTasks) && input.initialTasks.length > 0) {
      for (const t of input.initialTasks) {
        await tx.task.create({
          data: {
            organizationId,
            projectId: created.id,
            title: t.title,
            status: t.status || "TODO",
            priority: t.priority || "MEDIUM",
            creatorId: actorId,
          },
        });
      }
    }

    return created;
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "project:create",
    resourceType: "Project",
    resourceId: String(project.id),
    details: {
      name: project.name,
      priority: project.priority,
      initialTasksCount: input.initialTasks?.length || 0,
    },
  });

  return getProjectService({ projectId: project.id, organizationId });
}

export async function updateProjectService({ projectId, organizationId, actorId, input }) {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
  });

  if (!existing) {
    return null;
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.progress !== undefined ? { progress: input.progress } : {}),
    },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "project:update",
    resourceType: "Project",
    resourceId: String(projectId),
    details: input,
  });

  return updated;
}

export async function softDeleteProjectService({ projectId, organizationId, actorId }) {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
  });

  if (!existing) {
    return null;
  }

  const softDeleted = await prisma.project.update({
    where: { id: projectId },
    data: {
      deletedAt: new Date(),
    },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "project:delete",
    resourceType: "Project",
    resourceId: String(projectId),
    details: {
      name: existing.name,
      softDeleted: true,
    },
  });

  return softDeleted;
}

export async function restoreProjectService({ projectId, organizationId, actorId }) {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: { not: null } },
  });

  if (!existing) {
    return null;
  }

  const restored = await prisma.project.update({
    where: { id: projectId },
    data: {
      deletedAt: null,
    },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "project:restore",
    resourceType: "Project",
    resourceId: String(projectId),
    details: {
      name: existing.name,
    },
  });

  return restored;
}
