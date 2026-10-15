import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "./audit.service.js";

/**
 * Tasks Service (TASK-203 — Task Core CRUD, Validation, Status Workflow & Priority Engine)
 * Provides comprehensive task management, status transitions with completedAt stamping,
 * priority engine validation, ABAC ownership verification, and archival freezing.
 */

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVISION", "DONE"];
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const DEFAULT_TASK_STATUS = "TODO";
export const DEFAULT_TASK_PRIORITY = "MEDIUM";

/**
 * Normalizes status strings (accepts "REVIEW" as an alias for "REVISION").
 */
export function normalizeTaskStatus(status) {
  if (!status) return DEFAULT_TASK_STATUS;
  const upper = String(status).trim().toUpperCase();
  if (upper === "REVIEW") return "REVISION";
  return upper;
}

/**
 * Normalizes priority strings.
 */
export function normalizeTaskPriority(priority) {
  if (!priority) return DEFAULT_TASK_PRIORITY;
  return String(priority).trim().toUpperCase();
}

/**
 * Calculates completedAt timestamp based on status transitions.
 * When status changes to DONE: returns current Date.
 * When status changes away from DONE: returns null.
 * When status stays DONE: preserves existing completedAt (or sets Date if null).
 * Otherwise: preserves existing completedAt.
 */
export function determineCompletedAt(newStatus, existingStatus, existingCompletedAt) {
  if (newStatus === "DONE") {
    return existingStatus === "DONE" && existingCompletedAt ? existingCompletedAt : new Date();
  }
  if (existingStatus === "DONE" && newStatus !== "DONE") {
    return null;
  }
  return existingCompletedAt ?? null;
}

/**
 * Checks for prototype pollution attack vectors in object payloads.
 */
export function checkPrototypePollution(body = {}, query = {}, rawKeys = []) {
  if (
    body &&
    typeof body === "object" &&
    (Object.prototype.hasOwnProperty.call(body, "__proto__") ||
      Object.prototype.hasOwnProperty.call(body, "constructor") ||
      Object.prototype.hasOwnProperty.call(body, "prototype"))
  ) {
    const err = new Error("Security violation: prototype pollution attempt detected");
    err.statusCode = 403;
    err.code = "PROTOTYPE_POLLUTION_DETECTED";
    throw err;
  }

  const allKeys = [
    ...Object.keys(body || {}),
    ...Object.keys(query || {}),
    ...rawKeys,
  ];
  for (const k of allKeys) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") {
      const err = new Error("Security violation: prototype pollution attempt detected");
      err.statusCode = 403;
      err.code = "PROTOTYPE_POLLUTION_DETECTED";
      throw err;
    }
  }
}

/**
 * Enforces protected governance fields mutation barrier (TASK-002 / US-ABAC-003 / SEC-07).
 */
export function validateProtectedFieldsMutation(rawKeys, permissions = new Set()) {
  for (const key of rawKeys) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Creator mutation attempt
    if (normalized === "creatorid") {
      if (!permissions.has("task:manage")) {
        const err = new Error("Cannot modify protected task field: creatorId is immutable");
        err.statusCode = 403;
        err.code = "PROTECTED_FIELD_MUTATION";
        err.field = "creatorId";
        throw err;
      }
    }

    // 2. Project re-parenting mutation attempt
    if (normalized === "projectid") {
      if (!permissions.has("project:manage") && !permissions.has("task:manage")) {
        const err = new Error("Cannot modify protected task field: projectId requires project management permissions");
        err.statusCode = 403;
        err.code = "PROTECTED_FIELD_MUTATION";
        err.field = "projectId";
        throw err;
      }
    }

    // 3. Assignee mutation attempt
    if (normalized === "assigneeid") {
      const canAssign =
        permissions.has("task:assign") ||
        permissions.has("task:manage") ||
        permissions.has("task:update:any");
      if (!canAssign) {
        const err = new Error("Cannot modify protected task field: modifying assignee requires task:assign permission");
        err.statusCode = 403;
        err.code = "PROTECTED_FIELD_MUTATION";
        err.field = "assigneeId";
        throw err;
      }
    }
  }
}

/**
 * Evaluates ABAC ownership policies on task update.
 */
export function verifyTaskUpdateABAC(existingTask, actorId, permissions = new Set()) {
  const hasAnyUpdate = permissions.has("task:update:any") || permissions.has("task:manage");
  const hasOwnUpdate = permissions.has("task:update:own");
  const isOwnerOrAssignee =
    existingTask.assigneeId === actorId || existingTask.creatorId === actorId;

  if (!hasAnyUpdate && (!hasOwnUpdate || !isOwnerOrAssignee)) {
    const err = new Error("ABAC Policy Violation: You can only update tasks assigned to or created by you.");
    err.statusCode = 403;
    err.code = "CANNOT_UPDATE_OTHERS_TASK";
    throw err;
  }
}

/**
 * Enforces project archival mutation freezing (US-PROJ-005 / BR-009).
 */
export function verifyProjectNotArchived(project, action = "modify tasks") {
  if (project?.isArchived || project?.status === "ARCHIVED") {
    let msg = `Cannot ${action} in an archived project`;
    if (action.includes("archived project")) {
      msg = `Cannot ${action}`;
    }
    const err = new Error(msg);
    err.statusCode = 400;
    err.code = "PROJECT_ARCHIVED";
    throw err;
  }
}

/**
 * Lists tasks for an organization with multi-parameter search, filtering, sorting, and pagination (TASK-206).
 */
export async function listTasksService({ organizationId, query = {} }) {
  const {
    projectId,
    status,
    priority,
    assigneeId,
    search,
    sortBy,
    sortOrder,
    order,
    page,
    limit,
  } = query;

  const where = {
    organizationId,
    project: { deletedAt: null },
  };

  if (projectId) {
    const pId = Number(projectId);
    if (!isNaN(pId)) where.projectId = pId;
  }

  if (status) {
    const normalizedStatus = normalizeTaskStatus(status);
    if (TASK_STATUSES.includes(normalizedStatus)) {
      where.status = normalizedStatus;
    }
  }

  if (priority) {
    const normalizedPriority = normalizeTaskPriority(priority);
    if (TASK_PRIORITIES.includes(normalizedPriority)) {
      where.priority = normalizedPriority;
    }
  }

  if (assigneeId !== undefined && assigneeId !== null && assigneeId !== "") {
    const str = String(assigneeId).trim().toLowerCase();
    if (str === "unassigned" || str === "null") {
      where.assigneeId = null;
    } else {
      const aId = Number(assigneeId);
      if (!isNaN(aId)) where.assigneeId = aId;
    }
  }

  if (search && typeof search === "string" && search.trim()) {
    const searchTerm = search.trim();
    const searchConditions = [
      { title: { contains: searchTerm, mode: "insensitive" } },
      { description: { contains: searchTerm, mode: "insensitive" } },
    ];

    // If search term matches a numeric id or key like "PROJ-12"
    const keyMatch = searchTerm.match(/(?:[a-zA-Z]+-)?(\d+)/);
    if (keyMatch && keyMatch[1]) {
      const parsedId = Number(keyMatch[1]);
      if (Number.isSafeInteger(parsedId) && parsedId > 0) {
        searchConditions.push({ id: parsedId });
      }
    }

    where.OR = searchConditions;
  }

  // Sorting
  let orderBy = [{ order: "asc" }, { updatedAt: "desc" }];
  if (sortBy) {
    let field = sortBy;
    let direction = (sortOrder || order || "asc").toLowerCase();

    if (field.includes(":")) {
      const parts = field.split(":");
      field = parts[0];
      direction = parts[1].toLowerCase();
    }

    direction = direction === "desc" ? "desc" : "asc";

    switch (field) {
      case "id":
        orderBy = [{ id: direction }];
        break;
      case "title":
        orderBy = [{ title: direction }];
        break;
      case "dueDate":
        orderBy = [{ dueDate: direction }];
        break;
      case "createdAt":
        orderBy = [{ createdAt: direction }];
        break;
      case "updatedAt":
        orderBy = [{ updatedAt: direction }];
        break;
      case "priority":
        orderBy = [{ priority: direction }];
        break;
      case "status":
        orderBy = [{ status: direction }];
        break;
      case "order":
        orderBy = [{ order: direction }];
        break;
      default:
        orderBy = [{ order: "asc" }, { updatedAt: "desc" }];
    }
  }

  const total = await prisma.task.count({ where });

  // Pagination
  const isPaginated = page !== undefined || limit !== undefined;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = limit ? Math.max(1, Math.min(100, parseInt(limit, 10))) : 20;
  const totalPages = isPaginated ? Math.ceil(total / limitNum) || 1 : 1;

  const findArgs = {
    where,
    orderBy,
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
      creator: { select: { id: true, name: true, avatarUrl: true, email: true } },
      project: { select: { id: true, name: true, key: true, isArchived: true, status: true } },
      subtasks: {
        select: { id: true, title: true, isCompleted: true, order: true },
        orderBy: { order: "asc" },
      },
    },
  };

  if (isPaginated) {
    findArgs.skip = (pageNum - 1) * limitNum;
    findArgs.take = limitNum;
  }

  const tasks = await prisma.task.findMany(findArgs);

  return {
    tasks,
    total,
    page: isPaginated ? pageNum : 1,
    limit: isPaginated ? limitNum : total,
    totalPages,
  };
}

/**
 * Fetches a single task by ID scoped to active organization.
 */
export async function getTaskService({ organizationId, taskId }) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId,
      project: { deletedAt: null },
    },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
      creator: { select: { id: true, name: true, avatarUrl: true, email: true } },
      project: { select: { id: true, name: true, key: true, isArchived: true, status: true } },
      subtasks: {
        select: { id: true, title: true, isCompleted: true, order: true, createdAt: true },
        orderBy: { order: "asc" },
      },
      comments: {
        select: {
          id: true,
          content: true,
          editedAt: true,
          createdAt: true,
          author: {
            select: { id: true, name: true, username: true, email: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!task) {
    const err = new Error("Task not found in this organization");
    err.statusCode = 404;
    throw err;
  }

  return task;
}

/**
 * Creates a new task in the specified organization and project.
 */
export async function createTaskService({ organizationId, actorId, input, permissions = new Set() }) {
  // 1. Verify project exists in organization and is active
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, organizationId, deletedAt: null },
  });
  if (!project) {
    const err = new Error("Project not found in this organization");
    err.statusCode = 404;
    throw err;
  }

  // 2. Check project archival
  verifyProjectNotArchived(project, "create tasks");

  // 3. Validate assignee if provided
  if (input.assigneeId !== undefined && input.assigneeId !== null) {
    const assigneeMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: input.assigneeId,
          organizationId,
        },
      },
    });
    if (!assigneeMembership || assigneeMembership.status !== "ACTIVE") {
      const err = new Error("Assignee must be an active member of this organization");
      err.statusCode = 400;
      throw err;
    }
  }

  const normalizedStatus = normalizeTaskStatus(input.status);
  const normalizedPriority = normalizeTaskPriority(input.priority);
  const completedAt = normalizedStatus === "DONE" ? new Date() : null;

  const task = await prisma.task.create({
    data: {
      organizationId,
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? "",
      status: normalizedStatus,
      priority: normalizedPriority,
      assigneeId: input.assigneeId ?? null,
      creatorId: actorId,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      completedAt,
    },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
      creator: { select: { id: true, name: true, avatarUrl: true, email: true } },
      project: { select: { id: true, name: true, key: true, isArchived: true, status: true } },
      subtasks: {
        select: { id: true, title: true, isCompleted: true, order: true },
        orderBy: { order: "asc" },
      },
    },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "task:create",
    resourceType: "Task",
    resourceId: String(task.id),
    details: {
      title: task.title,
      status: task.status,
      priority: task.priority,
      projectId: task.projectId,
      completedAt: task.completedAt,
    },
  });

  return task;
}

/**
 * Updates a task with ABAC validation, status transition handling, and governance protection.
 */
export async function updateTaskService({
  organizationId,
  actorId,
  taskId,
  input,
  rawKeys = [],
  permissions = new Set(),
}) {
  // 1. Prototype pollution check
  checkPrototypePollution({ ...input }, {}, rawKeys);

  // 2. Validate protected fields mutation
  validateProtectedFieldsMutation(rawKeys, permissions);

  // 3. Find existing task
  const existing = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId,
      project: { deletedAt: null },
    },
    include: {
      project: { select: { id: true, isArchived: true, status: true } },
    },
  });

  if (!existing) {
    const err = new Error("Task not found in this organization");
    err.statusCode = 404;
    throw err;
  }

  // 4. Archival protection
  verifyProjectNotArchived(existing.project, "modify tasks");

  // 5. ABAC resource policy check
  verifyTaskUpdateABAC(existing, actorId, permissions);

  // 6. Project re-parenting verification if projectId is changing
  if (input.projectId !== undefined && input.projectId !== existing.projectId) {
    const targetProject = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId, deletedAt: null },
    });
    if (!targetProject) {
      const err = new Error("Target project not found in this organization");
      err.statusCode = 404;
      throw err;
    }
    verifyProjectNotArchived(targetProject, "move tasks to an archived project");
  }

  // 7. Assignee verification if assigneeId is changing
  if (input.assigneeId !== undefined && input.assigneeId !== null && input.assigneeId !== existing.assigneeId) {
    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: input.assigneeId,
          organizationId,
        },
      },
    });
    if (!targetMembership || targetMembership.status !== "ACTIVE") {
      const err = new Error("Assignee must be an active member of this organization");
      err.statusCode = 400;
      throw err;
    }
  }

  const updateData = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.priority !== undefined) updateData.priority = normalizeTaskPriority(input.priority);
  if (input.assigneeId !== undefined) updateData.assigneeId = input.assigneeId;
  if (input.projectId !== undefined) updateData.projectId = input.projectId;
  if (input.order !== undefined) updateData.order = input.order;

  // Status & completedAt state machine transition
  if (input.status !== undefined) {
    const newStatus = normalizeTaskStatus(input.status);
    updateData.status = newStatus;
    updateData.completedAt = determineCompletedAt(newStatus, existing.status, existing.completedAt);
  }

  if (input.dueDate !== undefined) {
    updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: updateData,
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
      creator: { select: { id: true, name: true, avatarUrl: true, email: true } },
      project: { select: { id: true, name: true, key: true, isArchived: true, status: true } },
      subtasks: {
        select: { id: true, title: true, isCompleted: true, order: true },
        orderBy: { order: "asc" },
      },
    },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "task:update",
    resourceType: "Task",
    resourceId: String(taskId),
    details: input,
  });

  return updated;
}

/**
 * Deletes a task scoped to active organization.
 */
export async function deleteTaskService({ organizationId, actorId, taskId, permissions = new Set() }) {
  const existing = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId,
      project: { deletedAt: null },
    },
    include: {
      project: { select: { id: true, isArchived: true, status: true } },
    },
  });

  if (!existing) {
    const err = new Error("Task not found in this organization");
    err.statusCode = 404;
    throw err;
  }

  // Archival protection
  verifyProjectNotArchived(existing.project, "delete tasks");

  await prisma.task.delete({
    where: { id: taskId },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "task:delete",
    resourceType: "Task",
    resourceId: String(taskId),
    details: { title: existing.title },
  });

  return true;
}
