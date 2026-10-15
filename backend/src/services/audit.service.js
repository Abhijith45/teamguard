import { prisma } from "../../config/prisma.js";

/**
 * Categorizes an activity action for UI filtering and badging.
 */
export function categorizeActivity(action, resourceType) {
  if (!action) return "general";
  const upper = action.toUpperCase();
  if (upper.startsWith("COMMENT")) return "comment";
  if (upper.startsWith("SUBTASK")) return "checklist";
  if (upper === "TASK:UPDATE") return "update";
  if (upper === "TASK:CREATE") return "creation";
  if (upper === "TASK:DELETE") return "deletion";
  if (upper.startsWith("ROLE:") || upper.startsWith("PERMISSION:") || upper.startsWith("MEMBER:")) return "governance";
  return "general";
}

/**
 * Formats structured audit action and details into a human-readable event summary.
 */
export function formatActivitySummary(action, resourceType, details, actorName = "User") {
  const upper = (action || "").toUpperCase();

  if (upper === "TASK:CREATE" || upper === "TASK_CREATE") {
    return details?.title ? `created task "${details.title}"` : "created this task";
  }

  if (upper === "TASK:UPDATE" || upper === "TASK_UPDATE") {
    if (!details || typeof details !== "object") return "updated task details";
    const changes = [];
    if (details.status) changes.push(`status to ${details.status}`);
    if (details.priority) changes.push(`priority to ${details.priority}`);
    if (details.assigneeId !== undefined) {
      changes.push(details.assigneeId ? `assigned to member #${details.assigneeId}` : "unassigned task");
    }
    if (details.title) changes.push(`title to "${details.title}"`);
    if (details.dueDate !== undefined) {
      changes.push(
        details.dueDate
          ? `due date to ${new Date(details.dueDate).toISOString().slice(0, 10)}`
          : "cleared due date"
      );
    }
    if (details.description !== undefined) changes.push("description");
    if (details.projectId !== undefined) changes.push(`moved to project #${details.projectId}`);

    if (changes.length > 0) {
      return `changed ${changes.join(", ")}`;
    }
    return "updated task details";
  }

  if (upper === "TASK:DELETE" || upper === "TASK_DELETE") {
    return details?.title ? `deleted task "${details.title}"` : "deleted task";
  }

  if (upper === "SUBTASK:CREATE" || upper === "SUBTASK_CREATE") {
    return `added checklist item "${details?.title || "item"}"`;
  }

  if (upper === "SUBTASK:UPDATE" || upper === "SUBTASK_UPDATE") {
    if (details?.updates?.isCompleted === true) {
      return `completed checklist item "${details?.title || "item"}"`;
    }
    if (details?.updates?.isCompleted === false) {
      return `unmarked checklist item "${details?.title || "item"}"`;
    }
    if (details?.updates?.title) {
      return `renamed checklist item to "${details.updates.title}"`;
    }
    return `updated checklist item "${details?.title || "item"}"`;
  }

  if (upper === "SUBTASK:DELETE" || upper === "SUBTASK_DELETE") {
    return `removed checklist item "${details?.title || "item"}"`;
  }

  if (upper === "SUBTASK:REORDER" || upper === "SUBTASK_REORDER") {
    return "reordered checklist items";
  }

  if (upper === "COMMENT:CREATE" || upper === "COMMENT_CREATE") {
    return "posted a comment";
  }

  if (upper === "COMMENT:UPDATE" || upper === "COMMENT_UPDATE") {
    return "edited their comment";
  }

  if (upper === "COMMENT:DELETE" || upper === "COMMENT_DELETE") {
    return (details?.deletedByModerator || details?.wasModeratorAction)
      ? "moderated (deleted) a comment"
      : "deleted a comment";
  }

  if (action === "project:create") {
    return details?.name ? `created project "${details.name}"` : "created project";
  }

  if (action === "project:archive") {
    return "archived the project";
  }

  if (action === "project:unarchive") {
    return "unarchived the project";
  }

  if (action === "project:delete") {
    return details?.name ? `deleted project "${details.name}"` : "deleted project";
  }

  if (action === "member:invite") {
    return details?.email ? `invited member ${details.email}` : "invited new member";
  }

  if (action === "member:remove") {
    return "removed member from organization";
  }

  return `${action} on ${resourceType}`;
}

/**
 * Audit Logging Service.
 * Logs security and operational actions with tenant isolation.
 * Never logs sensitive credentials, tokens, or hashes.
 */
export async function logAuditEvent({
  organizationId,
  actorId,
  action,
  resourceType,
  resourceId,
  details,
  outcome = "SUCCESS",
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: actorId ?? null,
        action,
        resourceType,
        resourceId: resourceId ? String(resourceId) : null,
        details: typeof details === "object" ? JSON.stringify(details) : (details ?? null),
        outcome,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log entry:", error.message);
    return null;
  }
}

/**
 * Retrieves the activity feed for a specific task scoped to the active organization tenant.
 * Queries audit entries targeting the task, its subtasks, or comments.
 */
export async function getTaskActivityService({ organizationId, taskId }) {
  const numericTaskId = parseInt(taskId, 10);
  if (isNaN(numericTaskId) || numericTaskId <= 0) {
    const err = new Error("Invalid task ID");
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify parent task exists within the active tenant and project is not deleted
  const task = await prisma.task.findFirst({
    where: {
      id: numericTaskId,
      organizationId,
      project: { deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      projectId: true,
      project: { select: { id: true, name: true, key: true } },
    },
  });

  if (!task) {
    const err = new Error("Task not found in active organization");
    err.statusCode = 404;
    throw err;
  }

  const taskIdStr = String(numericTaskId);

  // 2. Fetch all matching audit records:
  // - Direct task events: resourceType === 'Task' AND resourceId === taskIdStr
  // - Subtask / Comment events referencing taskId in their details payload
  const rawLogs = await prisma.auditLog.findMany({
    where: {
      organizationId,
      OR: [
        { resourceType: { in: ["Task", "TASK"] }, resourceId: taskIdStr },
        { details: { contains: `"taskId":${numericTaskId}` } },
        { details: { contains: `"taskId": "${numericTaskId}"` } },
        { details: { contains: `"taskId":${taskIdStr}` } },
      ],
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // 3. Format into structured activity timeline items
  const activities = rawLogs.map((log) => {
    let parsedDetails = null;
    try {
      parsedDetails = log.details ? JSON.parse(log.details) : null;
    } catch {
      parsedDetails = log.details;
    }

    const summary = formatActivitySummary(
      log.action,
      log.resourceType,
      parsedDetails,
      log.actor?.name || "Someone"
    );
    const category = categorizeActivity(log.action, log.resourceType);

    return {
      id: log.id,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      actor: log.actor || {
        id: null,
        name: "System",
        username: "system",
        email: null,
        avatarUrl: null,
      },
      details: parsedDetails,
      outcome: log.outcome,
      summary,
      category,
      createdAt: log.createdAt,
    };
  });

  return {
    taskId: task.id,
    taskTitle: task.title,
    project: task.project,
    data: activities,
    total: activities.length,
  };
}

/**
 * Queries organization-level audit log entries with multi-attribute filtering,
 * pagination, and strict tenant boundary validation. Guarded by audit:read.
 */
export async function listAuditLogsService({
  organizationId,
  page = 1,
  limit = 20,
  action,
  resourceType,
  actorId,
  search,
  startDate,
  endDate,
}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * take;

  const where = {
    organizationId,
  };

  if (action && typeof action === "string" && action.trim()) {
    where.action = action.trim();
  }

  if (resourceType && typeof resourceType === "string" && resourceType.trim()) {
    where.resourceType = resourceType.trim();
  }

  if (actorId) {
    const parsedActorId = parseInt(actorId, 10);
    if (!isNaN(parsedActorId)) {
      where.actorId = parsedActorId;
    }
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  if (search && typeof search === "string" && search.trim()) {
    const s = search.trim();
    where.OR = [
      { action: { contains: s, mode: "insensitive" } },
      { resourceType: { contains: s, mode: "insensitive" } },
      { details: { contains: s, mode: "insensitive" } },
    ];
  }

  const [total, rawLogs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / take) || 1;

  const logs = rawLogs.map((log) => {
    let parsedDetails = null;
    try {
      parsedDetails = log.details ? JSON.parse(log.details) : null;
    } catch {
      parsedDetails = log.details;
    }

    const summary = formatActivitySummary(
      log.action,
      log.resourceType,
      parsedDetails,
      log.actor?.name || "Someone"
    );

    return {
      id: log.id,
      organizationId: log.organizationId,
      actorId: log.actorId,
      actor: log.actor || {
        id: null,
        name: "System",
        username: "system",
        email: null,
        avatarUrl: null,
      },
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      details: parsedDetails,
      outcome: log.outcome,
      summary,
      createdAt: log.createdAt,
    };
  });

  return {
    data: logs,
    pagination: {
      page: pageNum,
      limit: take,
      total,
      totalPages,
    },
  };
}

/**
 * Returns distinct action types recorded for the active organization.
 */
export async function getAuditActionsService({ organizationId }) {
  const distinctRows = await prisma.auditLog.findMany({
    where: { organizationId },
    select: { action: true },
    distinct: ["action"],
    orderBy: { action: "asc" },
  });

  return distinctRows.map((r) => r.action);
}

/**
 * Returns aggregate audit statistics for compliance reporting in the active organization.
 */
export async function getAuditStatsService({ organizationId }) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalEvents, todayEvents, last7DaysEvents, distinctActions] = await Promise.all([
    prisma.auditLog.count({ where: { organizationId } }),
    prisma.auditLog.count({
      where: {
        organizationId,
        createdAt: { gte: startOfToday },
      },
    }),
    prisma.auditLog.count({
      where: {
        organizationId,
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.auditLog.findMany({
      where: { organizationId },
      select: { action: true },
      distinct: ["action"],
    }),
  ]);

  return {
    totalEvents,
    todayEvents,
    last7DaysEvents,
    uniqueActionTypes: distinctActions.length,
  };
}
