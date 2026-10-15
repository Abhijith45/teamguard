import {
  getAuditActionsService,
  getAuditStatsService,
  getTaskActivityService,
  listAuditLogsService,
} from "../services/audit.service.js";

/**
 * GET /api/tasks/:taskId/activity
 * Retrieves the activity history stream for a specific task.
 */
export async function getTaskActivity(req, res, next) {
  try {
    const rawTaskId = req.params.taskId;
    const taskId = parseInt(rawTaskId, 10);
    if (isNaN(taskId) || taskId <= 0) {
      return res.status(400).json({ error: "Invalid task ID: must be a positive integer" });
    }

    const result = await getTaskActivityService({
      organizationId: req.organizationId,
      taskId,
    });

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
}

/**
 * GET /api/audit
 * Lists organization audit logs with filtering and pagination. Guarded by audit:read.
 */
export async function listAuditLogs(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      action,
      resourceType,
      actorId,
      search,
      startDate,
      endDate,
    } = req.query;

    const result = await listAuditLogsService({
      organizationId: req.organizationId,
      page,
      limit,
      action,
      resourceType,
      actorId,
      search,
      startDate,
      endDate,
    });

    return res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/audit/actions
 * Returns list of unique recorded action types for filter controls.
 */
export async function getAuditActions(req, res, next) {
  try {
    const actions = await getAuditActionsService({
      organizationId: req.organizationId,
    });
    return res.json({ actions });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/audit/stats
 * Returns high-level compliance and event counts for the active workspace.
 */
export async function getAuditStats(req, res, next) {
  try {
    const stats = await getAuditStatsService({
      organizationId: req.organizationId,
    });
    return res.json(stats);
  } catch (error) {
    next(error);
  }
}
