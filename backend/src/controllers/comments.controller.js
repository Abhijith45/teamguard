import {
  listCommentsService,
  createCommentService,
  updateCommentService,
  deleteCommentService,
} from "../services/comments.service.js";

function parsePositiveInt(val, fieldName) {
  if (!val || typeof val !== "string" || !/^[1-9]\d*$/.test(val.trim())) {
    const error = new Error(`Invalid ${fieldName}: must be a positive integer`);
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return Number(val.trim());
}

/**
 * GET /api/tasks/:taskId/comments
 */
export async function listComments(req, res, next) {
  try {
    const taskId = parsePositiveInt(req.params.taskId, "task ID");
    const organizationId = req.organizationId;

    const result = await listCommentsService({ taskId, organizationId });
    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
}

/**
 * POST /api/tasks/:taskId/comments
 */
export async function createComment(req, res, next) {
  try {
    const taskId = parsePositiveInt(req.params.taskId, "task ID");
    const organizationId = req.organizationId;
    const userId = req.auth?.userId || req.user?.id;
    const { content } = req.body || {};

    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get("user-agent") || null;

    const result = await createCommentService({
      taskId,
      organizationId,
      userId,
      content,
      ipAddress,
      userAgent,
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
}

/**
 * PATCH /api/tasks/:taskId/comments/:commentId
 */
export async function updateComment(req, res, next) {
  try {
    const taskId = parsePositiveInt(req.params.taskId, "task ID");
    const commentId = parsePositiveInt(req.params.commentId, "comment ID");
    const organizationId = req.organizationId;
    const userId = req.auth?.userId || req.user?.id;
    const { content } = req.body || {};

    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get("user-agent") || null;

    const result = await updateCommentService({
      taskId,
      commentId,
      organizationId,
      userId,
      content,
      ipAddress,
      userAgent,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
}

/**
 * DELETE /api/tasks/:taskId/comments/:commentId
 */
export async function deleteComment(req, res, next) {
  try {
    const taskId = parsePositiveInt(req.params.taskId, "task ID");
    const commentId = parsePositiveInt(req.params.commentId, "comment ID");
    const organizationId = req.organizationId;
    const userId = req.auth?.userId || req.user?.id;

    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get("user-agent") || null;

    const result = await deleteCommentService({
      taskId,
      commentId,
      organizationId,
      userId,
      permissions: req.userPermissions,
      membership: req.membership,
      ipAddress,
      userAgent,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
}
