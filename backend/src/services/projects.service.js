import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "./audit.service.js";

/**
 * Projects Service (TASK-201 & TASK-202)
 * Provides tenant-scoped project lifecycle management, JIRA-style key generation,
 * dynamic progress calculation, soft-deletion, and archival protection.
 */

export const PROJECT_KEY_REGEX = /^[A-Z][A-Z0-9_]{1,9}$/;

/**
 * Derives a base project key candidate from project title/name.
 * Follows Jira/Linear conventions: initials from words, or uppercase letters.
 * Matches ^[A-Z][A-Z0-9_]{1,9}$
 */
export function deriveProjectKeyCandidate(name) {
  if (!name || typeof name !== "string") return "PROJ";
  const cleaned = name.trim();
  const words = cleaned.split(/[\s\-_]+/).filter(Boolean);
  let candidate = "";

  if (words.length >= 2) {
    // Collect first alphanumeric letter of each word
    candidate = words
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, "")[0] || "")
      .join("")
      .toUpperCase();

    // If initials are too short (1 char), append letters from the first word
    if (candidate.length < 2) {
      const first = words[0].replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      candidate = (first.slice(0, 3) + (words[1] ? words[1][0].toUpperCase() : "")).slice(0, 5);
    }
  } else if (words.length === 1) {
    const single = words[0].replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    candidate = single.slice(0, Math.min(single.length, 5));
  }

  // Ensure candidate starts with [A-Z]
  if (!/^[A-Z]/.test(candidate)) {
    candidate = `P${candidate}`.replace(/[^A-Z0-9_]/g, "");
  }

  // Ensure candidate has at least 2 characters
  if (candidate.length === 1) {
    candidate = `${candidate}X`;
  } else if (candidate.length === 0) {
    candidate = "PROJ";
  }

  // Cap at 10 characters
  return candidate.slice(0, 10);
}

/**
 * Generates an uppercase project key guaranteed to be unique within the tenant.
 */
export async function generateUniqueProjectKey(organizationId, name, tx = prisma) {
  const baseCandidate = deriveProjectKeyCandidate(name);
  let candidate = baseCandidate;
  let counter = 2;

  while (true) {
    const existing = await tx.project.findFirst({
      where: { organizationId, key: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    const suffix = String(counter);
    const prefix = baseCandidate.slice(0, 10 - suffix.length);
    candidate = `${prefix}${suffix}`;
    counter += 1;
  }
}

/**
 * Calculates dynamic project completion percentage:
 * (DONE tasks / total tasks) * 100, rounded to nearest integer.
 * If total tasks is 0, falls back to stored project progress (defaults to 0).
 */
export function calculateProjectProgress(tasks = [], fallbackProgress = 0) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return fallbackProgress;
  }
  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  return Math.round((doneCount / tasks.length) * 100);
}

export async function listProjectsService({ organizationId, includeDeleted = false, includeArchived = true }) {
  const where = {
    organizationId,
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(includeArchived ? {} : { isArchived: false }),
  };

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      tasks: {
        select: { id: true, status: true },
      },
      _count: {
        select: {
          tasks: true,
          files: true,
        },
      },
    },
  });

  return projects.map((p) => {
    const progress = p.tasks?.length > 0
      ? calculateProjectProgress(p.tasks)
      : (p.progress ?? 0);
    const { tasks, ...rest } = p;
    return {
      ...rest,
      progress,
    };
  });
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

  if (!project) {
    return null;
  }

  const progress = project.tasks?.length > 0
    ? calculateProjectProgress(project.tasks)
    : (project.progress ?? 0);

  return {
    ...project,
    progress,
  };
}

export async function createProjectService({ organizationId, actorId, input }) {
  let projectKey = null;

  if (input.key) {
    const trimmed = String(input.key).trim().toUpperCase();
    if (!PROJECT_KEY_REGEX.test(trimmed)) {
      const err = new Error("Invalid project key: must match ^[A-Z][A-Z0-9_]{1,9}$");
      err.status = 400;
      err.code = "INVALID_PROJECT_KEY";
      throw err;
    }

    const collision = await prisma.project.findFirst({
      where: { organizationId, key: trimmed },
    });
    if (collision) {
      const err = new Error("A project with this key already exists in this organization");
      err.status = 409;
      err.code = "PROJECT_KEY_CONFLICT";
      throw err;
    }
    projectKey = trimmed;
  }

  const project = await prisma.$transaction(async (tx) => {
    if (!projectKey) {
      projectKey = await generateUniqueProjectKey(organizationId, input.name, tx);
    }

    const isArchived = Boolean(input.isArchived || input.status === "ARCHIVED");
    const status = input.status || (isArchived ? "ARCHIVED" : "ACTIVE");

    const created = await tx.project.create({
      data: {
        organizationId,
        name: input.name,
        key: projectKey,
        description: input.description || "",
        priority: input.priority || "MEDIUM",
        status,
        isArchived,
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
      key: project.key,
      priority: project.priority,
      isArchived: project.isArchived,
      initialTasksCount: input.initialTasks?.length || 0,
    },
  });

  return getProjectService({ projectId: project.id, organizationId });
}

export async function updateProjectService({ projectId, organizationId, actorId, input }) {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
    include: {
      _count: { select: { tasks: true } },
    },
  });

  if (!existing) {
    return null;
  }

  let updatedKey = undefined;
  if (input.key !== undefined) {
    const key = String(input.key).trim().toUpperCase();
    if (key !== existing.key) {
      // BR-008: Once tasks exist, keys become immutable
      if (existing._count.tasks > 0) {
        const err = new Error("Project key cannot be modified once tasks exist");
        err.status = 400;
        err.code = "KEY_IMMUTABLE_TASKS_EXIST";
        throw err;
      }

      if (!PROJECT_KEY_REGEX.test(key)) {
        const err = new Error("Invalid project key: must match ^[A-Z][A-Z0-9_]{1,9}$");
        err.status = 400;
        err.code = "INVALID_PROJECT_KEY";
        throw err;
      }

      const collision = await prisma.project.findFirst({
        where: {
          organizationId,
          key,
          id: { not: projectId },
        },
      });
      if (collision) {
        const err = new Error("A project with this key already exists in this organization");
        err.status = 409;
        err.code = "PROJECT_KEY_CONFLICT";
        throw err;
      }

      updatedKey = key;
    }
  }

  // Synchronize status and isArchived
  let isArchived = undefined;
  let status = input.status;
  if (input.isArchived !== undefined) {
    isArchived = Boolean(input.isArchived);
    if (isArchived && !status) status = "ARCHIVED";
    if (!isArchived && status === "ARCHIVED") status = "ACTIVE";
  } else if (input.status !== undefined) {
    if (input.status === "ARCHIVED") {
      isArchived = true;
    } else if (existing.isArchived && input.status !== "ARCHIVED") {
      isArchived = false;
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(updatedKey !== undefined ? { key: updatedKey } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(status ? { status } : {}),
      ...(isArchived !== undefined ? { isArchived } : {}),
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

  return getProjectService({ projectId, organizationId });
}

export async function archiveProjectService({ projectId, organizationId, actorId }) {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
  });

  if (!existing) {
    return null;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      isArchived: true,
      status: "ARCHIVED",
    },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "project:archive",
    resourceType: "Project",
    resourceId: String(projectId),
    details: {
      name: existing.name,
      key: existing.key,
      isArchived: true,
    },
  });

  return getProjectService({ projectId, organizationId });
}

export async function unarchiveProjectService({ projectId, organizationId, actorId }) {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, organizationId, deletedAt: null },
  });

  if (!existing) {
    return null;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      isArchived: false,
      status: "ACTIVE",
    },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "project:unarchive",
    resourceType: "Project",
    resourceId: String(projectId),
    details: {
      name: existing.name,
      key: existing.key,
      isArchived: false,
    },
  });

  return getProjectService({ projectId, organizationId });
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
      key: existing.key,
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
      key: existing.key,
    },
  });

  return getProjectService({ projectId, organizationId });
}
