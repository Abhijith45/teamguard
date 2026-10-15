import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";

const createTaskSchema = z.object({
  projectId: z.number().int().positive(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().default(""),
  status: z.enum(["TODO", "IN_PROGRESS", "REVISION", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  assigneeId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVISION", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  order: z.number().int().optional(),
});

export async function listTasks(req, res, next) {
  try {
    const orgId = req.organizationId;
    const { projectId, status, priority } = req.query;

    const where = {
      organizationId: orgId,
      project: { deletedAt: null },
    };
    if (projectId) where.projectId = Number(projectId);
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
        project: { select: { id: true, name: true, key: true, isArchived: true } },
      },
    });

    return res.json({ tasks });
  } catch (error) {
    next(error);
  }
}

export async function createTask(req, res, next) {
  try {
    const input = createTaskSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    // Verify project belongs to organization and is active (not soft-deleted)
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId: orgId, deletedAt: null },
    });
    if (!project) {
      return res.status(404).json({ error: "Project not found in this organization" });
    }

    // TASK-202: Project Archival Freezing (US-PROJ-005 / BR-009)
    if (project.isArchived || project.status === "ARCHIVED") {
      return res.status(400).json({
        error: "Cannot create tasks in an archived project",
        code: "PROJECT_ARCHIVED",
      });
    }

    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        creatorId: actorId,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
        project: { select: { id: true, name: true, key: true, isArchived: true } },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "task:create",
      resourceType: "Task",
      resourceId: String(task.id),
      details: { title: task.title, status: task.status, priority: task.priority },
    });

    return res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
}

export async function updateTask(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const actorId = req.auth.userId;
    const permissions = req.userPermissions || new Set();

    // 1. Prototype Pollution Check
    if (
      req.body &&
      typeof req.body === "object" &&
      (Object.prototype.hasOwnProperty.call(req.body, "__proto__") ||
        Object.prototype.hasOwnProperty.call(req.body, "constructor") ||
        Object.prototype.hasOwnProperty.call(req.body, "prototype"))
    ) {
      return res.status(403).json({
        error: "Security violation: prototype pollution attempt detected",
        code: "PROTOTYPE_POLLUTION_DETECTED",
      });
    }

    const rawKeys = [
      ...Object.keys(req.body || {}),
      ...Object.keys(req.query || {}),
    ];
    for (const k of rawKeys) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") {
        return res.status(403).json({
          error: "Security violation: prototype pollution attempt detected",
          code: "PROTOTYPE_POLLUTION_DETECTED",
        });
      }
    }

    // 2. Protected Governance Fields Mutation Barrier (TASK-002 / US-ABAC-003 / SEC-07)
    for (const key of rawKeys) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Creator mutation attempt
      if (normalized === "creatorid") {
        if (!permissions.has("task:manage")) {
          return res.status(403).json({
            error: "Cannot modify protected task field: creatorId is immutable",
            code: "PROTECTED_FIELD_MUTATION",
            field: "creatorId",
          });
        }
      }

      // Project re-parenting mutation attempt
      if (normalized === "projectid") {
        if (!permissions.has("project:manage") && !permissions.has("task:manage")) {
          return res.status(403).json({
            error: "Cannot modify protected task field: projectId requires project management permissions",
            code: "PROTECTED_FIELD_MUTATION",
            field: "projectId",
          });
        }
      }

      // Assignee mutation attempt
      if (normalized === "assigneeid") {
        const canAssign =
          permissions.has("task:assign") ||
          permissions.has("task:manage") ||
          permissions.has("task:update:any");
        if (!canAssign) {
          return res.status(403).json({
            error: "Cannot modify protected task field: modifying assignee requires task:assign permission",
            code: "PROTECTED_FIELD_MUTATION",
            field: "assigneeId",
          });
        }
      }
    }

    // Normalize incoming snake_case aliases if authorized
    const bodyPayload = { ...req.body };
    if (bodyPayload.assignee_id !== undefined && bodyPayload.assigneeId === undefined) {
      bodyPayload.assigneeId = bodyPayload.assignee_id;
    }
    if (bodyPayload.project_id !== undefined && bodyPayload.projectId === undefined) {
      bodyPayload.projectId = bodyPayload.project_id;
    }

    const input = updateTaskSchema.parse(bodyPayload);

    // Verify task exists in current organization and belongs to an active project
    const existing = await prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: orgId,
        project: { deletedAt: null },
      },
      include: {
        project: { select: { id: true, isArchived: true, status: true } },
      },
    });
    if (!existing) {
      return res.status(404).json({ error: "Task not found in this organization" });
    }

    // TASK-202: Project Archival Freezing (US-PROJ-005 / BR-009)
    if (existing.project?.isArchived || existing.project?.status === "ARCHIVED") {
      return res.status(400).json({
        error: "Cannot modify tasks in an archived project",
        code: "PROJECT_ARCHIVED",
      });
    }

    // ABAC Resource Policy Check:
    // Can update if:
    // 1. Has 'task:update:any' or 'task:manage'
    // 2. OR has 'task:update:own' AND the task is assigned to or created by the actor
    const hasAnyUpdate = permissions.has("task:update:any") || permissions.has("task:manage");
    const hasOwnUpdate = permissions.has("task:update:own");
    const isOwnerOrAssignee = existing.assigneeId === actorId || existing.creatorId === actorId;

    if (!hasAnyUpdate && (!hasOwnUpdate || !isOwnerOrAssignee)) {
      return res.status(403).json({
        error: "ABAC Policy Violation: You can only update tasks assigned to or created by you.",
        code: "CANNOT_UPDATE_OTHERS_TASK",
      });
    }

    // Target project verification if project is being re-parented by manager
    if (input.projectId !== undefined && input.projectId !== existing.projectId) {
      const targetProject = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: orgId, deletedAt: null },
      });
      if (!targetProject) {
        return res.status(404).json({ error: "Target project not found in this organization" });
      }
      if (targetProject.isArchived || targetProject.status === "ARCHIVED") {
        return res.status(400).json({
          error: "Cannot move tasks to an archived project",
          code: "PROJECT_ARCHIVED",
        });
      }
    }

    // Assignee verification if assignee is being changed by authorized actor
    if (input.assigneeId !== undefined && input.assigneeId !== null && input.assigneeId !== existing.assigneeId) {
      const targetMembership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: input.assigneeId,
            organizationId: orgId,
          },
        },
      });
      if (!targetMembership || targetMembership.status !== "ACTIVE") {
        return res.status(400).json({ error: "Assignee must be an active member of this organization" });
      }
    }

    const updateData = { ...input };
    if (input.dueDate !== undefined) {
      updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
        project: { select: { id: true, name: true, key: true, isArchived: true } },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "task:update",
      resourceType: "Task",
      resourceId: String(taskId),
      details: input,
    });

    return res.json({ task: updated });
  } catch (error) {
    next(error);
  }
}

export async function deleteTask(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    const orgId = req.organizationId;

    const existing = await prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: orgId,
        project: { deletedAt: null },
      },
      include: {
        project: { select: { id: true, isArchived: true, status: true } },
      },
    });
    if (!existing) {
      return res.status(404).json({ error: "Task not found in this organization" });
    }

    // TASK-202: Project Archival Freezing (US-PROJ-005 / BR-009)
    if (existing.project?.isArchived || existing.project?.status === "ARCHIVED") {
      return res.status(400).json({
        error: "Cannot delete tasks in an archived project",
        code: "PROJECT_ARCHIVED",
      });
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId: req.auth.userId,
      action: "task:delete",
      resourceType: "Task",
      resourceId: String(taskId),
      details: { title: existing.title },
    });

    return res.status(204).end();
  } catch (error) {
    next(error);
  }
}
