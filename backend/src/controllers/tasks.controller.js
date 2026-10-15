import { z } from "zod";
import {
  checkPrototypePollution,
  createTaskService,
  deleteTaskService,
  getTaskService,
  listTasksService,
  updateTaskService,
} from "../services/tasks.service.js";

const createTaskSchema = z.object({
  projectId: z.number().int().positive(),
  title: z.string().trim().min(2, "Task title must have at least 2 characters").max(200, "Task title cannot exceed 200 characters"),
  description: z.string().trim().max(1000).optional().default(""),
  status: z.enum(["TODO", "IN_PROGRESS", "REVISION", "REVIEW", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assigneeId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVISION", "REVIEW", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  order: z.number().int().optional(),
});

export async function listTasks(req, res, next) {
  try {
    const orgId = req.organizationId;
    const tasks = await listTasksService({
      organizationId: orgId,
      query: req.query,
    });

    return res.json({ tasks });
  } catch (error) {
    next(error);
  }
}

export async function getTask(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const task = await getTaskService({ organizationId: orgId, taskId });

    return res.json({ task });
  } catch (error) {
    next(error);
  }
}

export async function createTask(req, res, next) {
  try {
    const input = createTaskSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;
    const permissions = req.userPermissions || new Set();

    const task = await createTaskService({
      organizationId: orgId,
      actorId,
      input,
      permissions,
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

    // Check prototype pollution on raw keys before any stripping
    const rawKeys = [
      ...Object.keys(req.body || {}),
      ...Object.keys(req.query || {}),
    ];
    checkPrototypePollution(req.body, req.query, rawKeys);

    // Normalize incoming snake_case aliases if authorized
    const bodyPayload = { ...req.body };
    if (bodyPayload.assignee_id !== undefined && bodyPayload.assigneeId === undefined) {
      bodyPayload.assigneeId = bodyPayload.assignee_id;
    }
    if (bodyPayload.project_id !== undefined && bodyPayload.projectId === undefined) {
      bodyPayload.projectId = bodyPayload.project_id;
    }

    const input = updateTaskSchema.parse(bodyPayload);

    const updated = await updateTaskService({
      organizationId: orgId,
      actorId,
      taskId,
      input,
      rawKeys,
      permissions,
    });

    return res.json({ task: updated });
  } catch (error) {
    next(error);
  }
}

export async function deleteTask(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const actorId = req.auth.userId;
    const permissions = req.userPermissions || new Set();

    await deleteTaskService({
      organizationId: orgId,
      actorId,
      taskId,
      permissions,
    });

    return res.status(204).end();
  } catch (error) {
    next(error);
  }
}
