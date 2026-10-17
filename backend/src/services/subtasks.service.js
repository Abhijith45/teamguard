import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "./audit.service.js";
import { dispatchWorkspaceEvent } from "./event-dispatcher.service.js";

/**
 * Calculates completion progress for an array of subtask items.
 * Returns { total, completed, progress (percentage 0-100) }.
 */
export function calculateSubtaskProgress(subtasks = []) {
  if (!subtasks || subtasks.length === 0) {
    return { total: 0, completed: 0, progress: 0 };
  }
  const total = subtasks.length;
  const completed = subtasks.filter((s) => Boolean(s.isCompleted)).length;
  const progress = Math.round((completed / total) * 100);
  return { total, completed, progress };
}

/**
 * Internal helper to verify parent task existence, tenant scope, archival protection, and ABAC permissions.
 */
async function verifyParentTaskAccess({
  taskId,
  organizationId,
  userId,
  permissions = new Set(),
  actionName = "modify subtasks of",
}) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId,
      project: { deletedAt: null },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          key: true,
          isArchived: true,
          status: true,
        },
      },
    },
  });

  if (!task) {
    const error = new Error("Task not found in this organization");
    error.statusCode = 404;
    throw error;
  }

  // Archival protection (BR-009)
  if (task.project?.isArchived) {
    const error = new Error(`Cannot ${actionName} an archived project`);
    error.statusCode = 400;
    error.code = "PROJECT_ARCHIVED";
    throw error;
  }

  // ABAC Ownership Boundary (BR-005 / DP-TASK-001)
  // Check if caller can update this specific task
  const canUpdateAny =
    permissions.has("task:update:any") || permissions.has("task:manage");
  const canUpdateOwn = permissions.has("task:update:own");
  const canUpdateAssigned = permissions.has("task:update:assigned");
  const isAssignee = task.assigneeId === userId;
  const isCreator = task.creatorId === userId;

  if (!canUpdateAny) {
    const isAuthorizedCreator = canUpdateOwn && isCreator;
    const isAuthorizedAssignee = canUpdateAssigned && isAssignee;
    if (!isAuthorizedCreator && !isAuthorizedAssignee) {
      const error = new Error(
        "Forbidden: You cannot modify subtasks for tasks assigned to other members"
      );
      error.statusCode = 403;
      error.code = "CANNOT_UPDATE_OTHERS_TASK";
      throw error;
    }
  }

  return task;
}

/**
 * Lists all subtasks for a task with dynamic completion progress rollup.
 */
export async function listSubtasksService({ taskId, organizationId }) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId,
      project: { deletedAt: null },
    },
  });

  if (!task) {
    const error = new Error("Task not found in this organization");
    error.statusCode = 404;
    throw error;
  }

  const subtasks = await prisma.subtask.findMany({
    where: {
      taskId,
      organizationId,
    },
    orderBy: {
      order: "asc",
    },
  });

  const stats = calculateSubtaskProgress(subtasks);

  return {
    subtasks,
    ...stats,
  };
}

/**
 * Creates a new subtask checklist item under a task.
 */
export async function createSubtaskService({
  taskId,
  organizationId,
  userId,
  title,
  order,
  permissions = new Set(),
}) {
  if (typeof title !== "string" || title.trim().length === 0) {
    const error = new Error("Subtask title is required");
    error.statusCode = 400;
    throw error;
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length > 200) {
    const error = new Error("Subtask title cannot exceed 200 characters");
    error.statusCode = 400;
    throw error;
  }

  // Verify parent task and ABAC
  await verifyParentTaskAccess({
    taskId,
    organizationId,
    userId,
    permissions,
    actionName: "create subtasks on",
  });

  // Calculate next order if not supplied
  let assignedOrder = order;
  if (typeof assignedOrder !== "number") {
    const count = await prisma.subtask.count({
      where: { taskId, organizationId },
    });
    assignedOrder = count;
  }

  const subtask = await prisma.subtask.create({
    data: {
      organizationId,
      taskId,
      title: trimmedTitle,
      order: assignedOrder,
      isCompleted: false,
    },
  });

  // Calculate updated parent task subtask progress rollup
  const allSubtasks = await prisma.subtask.findMany({
    where: { taskId, organizationId },
    orderBy: { order: "asc" },
  });
  const stats = calculateSubtaskProgress(allSubtasks);

  await logAuditEvent({
    organizationId,
    actorId: userId,
    action: "subtask:create",
    resourceType: "Subtask",
    resourceId: String(subtask.id),
    details: { taskId, title: subtask.title, order: subtask.order },
    outcome: "SUCCESS",
  });

  return {
    subtask,
    stats,
  };
}

/**
 * Updates a subtask (title, isCompleted toggle, order).
 */
export async function updateSubtaskService({
  subtaskId,
  taskId,
  organizationId,
  userId,
  data = {},
  permissions = new Set(),
}) {
  // Verify parent task and ABAC
  await verifyParentTaskAccess({
    taskId,
    organizationId,
    userId,
    permissions,
    actionName: "update subtasks on",
  });

  const existing = await prisma.subtask.findFirst({
    where: {
      id: subtaskId,
      taskId,
      organizationId,
    },
  });

  if (!existing) {
    const error = new Error("Subtask not found in this task");
    error.statusCode = 404;
    throw error;
  }

  const updateData = {};

  if (data.title !== undefined) {
    if (typeof data.title !== "string" || data.title.trim().length === 0) {
      const error = new Error("Subtask title is required");
      error.statusCode = 400;
      throw error;
    }
    const trimmedTitle = data.title.trim();
    if (trimmedTitle.length > 200) {
      const error = new Error("Subtask title cannot exceed 200 characters");
      error.statusCode = 400;
      throw error;
    }
    updateData.title = trimmedTitle;
  }

  if (typeof data.isCompleted === "boolean") {
    updateData.isCompleted = data.isCompleted;
  }

  if (typeof data.order === "number") {
    updateData.order = Math.max(0, Math.floor(data.order));
  }

  const updated = await prisma.subtask.update({
    where: { id: subtaskId },
    data: updateData,
  });

  // Recalculate parent progress
  const allSubtasks = await prisma.subtask.findMany({
    where: { taskId, organizationId },
    orderBy: { order: "asc" },
  });
  const stats = calculateSubtaskProgress(allSubtasks);

  await logAuditEvent({
    organizationId,
    actorId: userId,
    action: "subtask:update",
    resourceType: "Subtask",
    resourceId: String(subtaskId),
    details: { taskId, isCompleted: updated.isCompleted, title: updated.title },
    outcome: "SUCCESS",
  });

  if (updated.isCompleted && !existing.isCompleted) {
    const parentTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, creatorId: true, assigneeId: true, organizationId: true },
    });
    if (parentTask) {
      dispatchWorkspaceEvent("subtask:completed", {
        organizationId,
        taskId,
        subtaskId: updated.id,
        actorId: userId,
        subtask: updated,
        task: parentTask,
      });
    }
  }

  return {
    subtask: updated,
    stats,
  };
}

/**
 * Deletes a subtask item.
 */
export async function deleteSubtaskService({
  subtaskId,
  taskId,
  organizationId,
  userId,
  permissions = new Set(),
}) {
  // Verify parent task and ABAC
  await verifyParentTaskAccess({
    taskId,
    organizationId,
    userId,
    permissions,
    actionName: "delete subtasks on",
  });

  const existing = await prisma.subtask.findFirst({
    where: {
      id: subtaskId,
      taskId,
      organizationId,
    },
  });

  if (!existing) {
    const error = new Error("Subtask not found in this task");
    error.statusCode = 404;
    throw error;
  }

  await prisma.subtask.delete({
    where: { id: subtaskId },
  });

  // Recalculate parent progress
  const allSubtasks = await prisma.subtask.findMany({
    where: { taskId, organizationId },
    orderBy: { order: "asc" },
  });
  const stats = calculateSubtaskProgress(allSubtasks);

  await logAuditEvent({
    organizationId,
    actorId: userId,
    action: "subtask:delete",
    resourceType: "Subtask",
    resourceId: String(subtaskId),
    details: { taskId, subtaskId, title: existing.title },
    outcome: "SUCCESS",
  });

  return {
    success: true,
    stats,
  };
}

/**
 * Reorders an array of subtask items by ID sequence.
 */
export async function reorderSubtasksService({
  taskId,
  organizationId,
  userId,
  subtaskIds = [],
  permissions = new Set(),
}) {
  if (!Array.isArray(subtaskIds) || subtaskIds.length === 0) {
    const error = new Error("subtaskIds array is required");
    error.statusCode = 400;
    throw error;
  }

  // Verify parent task and ABAC
  await verifyParentTaskAccess({
    taskId,
    organizationId,
    userId,
    permissions,
    actionName: "reorder subtasks on",
  });

  await prisma.$transaction(
    subtaskIds.map((id, index) =>
      prisma.subtask.updateMany({
        where: {
          id: Number(id),
          taskId,
          organizationId,
        },
        data: {
          order: index,
        },
      })
    )
  );

  const subtasks = await prisma.subtask.findMany({
    where: { taskId, organizationId },
    orderBy: { order: "asc" },
  });
  const stats = calculateSubtaskProgress(subtasks);

  await logAuditEvent({
    organizationId,
    actorId: userId,
    action: "subtask:reorder",
    resourceType: "Subtask",
    resourceId: String(taskId),
    details: { taskId, count: subtaskIds.length },
    outcome: "SUCCESS",
  });

  return {
    subtasks,
    stats,
  };
}
