import { cache } from "../lib/cache.js";
import { z } from "zod";
import {
  checkPrototypePollution,
  createTaskService,
  deleteTaskService,
  getTaskService,
  listTasksService,
  updateTaskService,
} from "../services/tasks.service.js";

import { validateDescriptionSize } from "../utils/sanitize.js";
import { maskTaskPayloadForGuest } from "../utils/mask-guest-fields.js";

const createTaskSchema = z.object({
  projectId: z.number().int().positive(),
  title: z.string().trim().min(2, "Task title must have at least 2 characters").max(200, "Task title cannot exceed 200 characters"),
  description: z.string().optional().default(""),
  status: z.enum(["TODO", "IN_PROGRESS", "REVISION", "REVIEW", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assigneeId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().optional(),
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
    const result = await listTasksService({
      organizationId: orgId,
      query: req.query,
    });

    if (result?.tasks) {
      result.tasks = maskTaskPayloadForGuest(
        result.tasks,
        req.membership?.accountType,
        req.userPermissions,
        req.membership?.roles
      );
    }

    return res.json(result);
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
    const maskedTask = maskTaskPayloadForGuest(
      task,
      req.membership?.accountType,
      req.userPermissions,
      req.membership?.roles
    );

    cache.invalidateTags([`dashboard:${req.organizationId}`, `reports:${req.organizationId}`]);
    return res.json({ task: maskedTask });
  } catch (error) {
    next(error);
  }
}

export async function createTask(req, res, next) {
  try {
    if (req.body?.description !== undefined && !validateDescriptionSize(req.body.description)) {
      return res.status(400).json({ error: "Description exceeds maximum allowed size of 64KB" });
    }
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

    const maskedTask = maskTaskPayloadForGuest(
      task,
      req.membership?.accountType,
      req.userPermissions,
      req.membership?.roles
    );

    cache.invalidateTags([`dashboard:${orgId}`, `reports:${orgId}`]);
    return res.status(201).json({ task: maskedTask });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.field ? { field: error.field } : {}),
      });
    }
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

    if (req.body?.description !== undefined && !validateDescriptionSize(req.body.description)) {
      return res.status(400).json({ error: "Description exceeds maximum allowed size of 64KB" });
    }

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

    const maskedTask = maskTaskPayloadForGuest(
      updated,
      req.membership?.accountType,
      req.userPermissions,
      req.membership?.roles
    );

    return res.json({ task: maskedTask });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.field ? { field: error.field } : {}),
      });
    }
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
      membership: req.membership,
    });

    return cache.invalidateTags([`dashboard:${req.organizationId}`, `reports:${req.organizationId}`]);
    res.status(204).end();
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
    }
    next(error);
  }
}
