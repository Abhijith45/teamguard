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
  dueDate: z.string().datetime().nullable().optional(),
  order: z.number().int().optional(),
});

export async function listTasks(req, res, next) {
  try {
    const orgId = req.organizationId;
    const { projectId, status, priority } = req.query;

    const where = { organizationId: orgId };
    if (projectId) where.projectId = Number(projectId);
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true, email: true } },
        project: { select: { id: true, name: true } },
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

    // Verify project belongs to organization
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId: orgId },
    });
    if (!project) {
      return res.status(404).json({ error: "Project not found in this organization" });
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
        project: { select: { id: true, name: true } },
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
    const input = updateTaskSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;
    const permissions = req.userPermissions;

    // Verify task exists in current organization
    const existing = await prisma.task.findFirst({
      where: { id: taskId, organizationId: orgId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Task not found in this organization" });
    }

    // ABAC Resource Policy Check:
    // Can update if:
    // 1. Has 'task:update:any' or 'task:manage'
    // 2. OR has 'task:update:own' AND the task is assigned to the actor
    const hasAnyUpdate = permissions.has("task:update:any") || permissions.has("task:manage");
    const hasOwnUpdate = permissions.has("task:update:own");
    const isOwnerOrAssignee = existing.assigneeId === actorId || existing.creatorId === actorId;

    if (!hasAnyUpdate && (!hasOwnUpdate || !isOwnerOrAssignee)) {
      return res.status(403).json({
        error: "ABAC Policy Violation: You can only update tasks assigned to or created by you.",
        code: "CANNOT_UPDATE_OTHERS_TASK",
      });
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
        project: { select: { id: true, name: true } },
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
      where: { id: taskId, organizationId: orgId },
    });
    if (!existing) {
      return res.status(404).json({ error: "Task not found in this organization" });
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
