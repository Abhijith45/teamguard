import {
  createSubtaskService,
  deleteSubtaskService,
  listSubtasksService,
  reorderSubtasksService,
  updateSubtaskService,
} from "../services/subtasks.service.js";

/**
 * Lists all subtasks for a given task.
 */
export async function listSubtasks(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const result = await listSubtasksService({
      taskId,
      organizationId: orgId,
    });

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
}

/**
 * Creates a new subtask under a task.
 */
export async function createSubtask(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }

    const { title, order } = req.body || {};
    const orgId = req.organizationId;
    const userId = req.auth.userId;
    const permissions = req.userPermissions || new Set();

    const result = await createSubtaskService({
      taskId,
      organizationId: orgId,
      userId,
      title,
      order,
      permissions,
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
}

/**
 * Updates a subtask (title, isCompleted, order).
 */
export async function updateSubtask(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    const subtaskId = Number(req.params.subtaskId);

    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }
    if (!Number.isSafeInteger(subtaskId) || subtaskId <= 0) {
      return res.status(400).json({ error: "Invalid subtask ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const userId = req.auth.userId;
    const permissions = req.userPermissions || new Set();

    const result = await updateSubtaskService({
      subtaskId,
      taskId,
      organizationId: orgId,
      userId,
      data: req.body || {},
      permissions,
    });

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
}

/**
 * Deletes a subtask item.
 */
export async function deleteSubtask(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    const subtaskId = Number(req.params.subtaskId);

    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }
    if (!Number.isSafeInteger(subtaskId) || subtaskId <= 0) {
      return res.status(400).json({ error: "Invalid subtask ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const userId = req.auth.userId;
    const permissions = req.userPermissions || new Set();

    const result = await deleteSubtaskService({
      subtaskId,
      taskId,
      organizationId: orgId,
      userId,
      permissions,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
}

/**
 * Reorders an array of subtask items by sequence.
 */
export async function reorderSubtasks(req, res, next) {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isSafeInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }

    const { subtaskIds } = req.body || {};
    const orgId = req.organizationId;
    const userId = req.auth.userId;
    const permissions = req.userPermissions || new Set();

    const result = await reorderSubtasksService({
      taskId,
      organizationId: orgId,
      userId,
      subtaskIds,
      permissions,
    });

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    next(error);
  }
}
