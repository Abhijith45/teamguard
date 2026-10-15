import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "./audit.service.js";
import { sanitizeCommentContent } from "../utils/sanitize.js";

export const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * Checks whether an actor has moderation authority to delete any comment at any time.
 * Matches: roles:manage, members:manage, task:delete, task:manage, or administrative roles.
 */
export function isUserModerator({ permissions = new Set(), membership = null }) {
  if (
    permissions.has("roles:manage") ||
    permissions.has("members:manage") ||
    permissions.has("task:delete") ||
    permissions.has("task:manage")
  ) {
    return true;
  }

  if (membership?.roles) {
    const isModRole = membership.roles.some((mr) => {
      const slug = mr.role?.slug?.toLowerCase();
      const name = mr.role?.name?.toLowerCase();
      return (
        slug === "super-admin" ||
        slug === "admin" ||
        slug === "project-manager" ||
        slug === "owner" ||
        name === "super admin" ||
        name === "admin" ||
        name === "project manager" ||
        name === "owner"
      );
    });
    if (isModRole) return true;
  }

  return false;
}

/**
 * Helper to verify parent task existence, tenant scoping, and project archival status.
 */
async function verifyParentTaskForComment({
  taskId,
  organizationId,
  checkArchived = false,
  actionName = "post comments on",
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

  if (checkArchived && task.project?.isArchived) {
    const error = new Error(`Cannot ${actionName} an archived project`);
    error.statusCode = 400;
    error.code = "PROJECT_ARCHIVED";
    throw error;
  }

  return task;
}

/**
 * Lists comments for a task chronologically (oldest to newest).
 */
export async function listCommentsService({ taskId, organizationId }) {
  await verifyParentTaskForComment({ taskId, organizationId });

  const comments = await prisma.comment.findMany({
    where: {
      taskId,
      organizationId,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

  return {
    comments,
    total: comments.length,
  };
}

/**
 * Posts a new comment to a task discussion thread.
 */
export async function createCommentService({
  taskId,
  organizationId,
  userId,
  content,
  ipAddress = null,
  userAgent = null,
}) {
  if (typeof content !== "string" || !content.trim()) {
    const error = new Error("Comment content is required");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  if (content.length > 5000) {
    const error = new Error("Comment content cannot exceed 5000 characters");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  await verifyParentTaskForComment({
    taskId,
    organizationId,
    checkArchived: true,
    actionName: "post comments on",
  });

  const sanitized = sanitizeCommentContent(content);
  if (!sanitized) {
    const error = new Error("Comment content cannot be empty after sanitization");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        organizationId,
        taskId,
        authorId: userId,
        content: sanitized,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    await tx.task.update({
      where: { id: taskId },
      data: {
        commentsCount: { increment: 1 },
      },
    });

    return created;
  });

  await logAuditEvent({
    organizationId,
    actorId: userId,
    action: "COMMENT_CREATE",
    resourceType: "TASK",
    resourceId: String(taskId),
    details: {
      commentId: comment.id,
      taskId,
    },
    outcome: "SUCCESS",
    ipAddress,
    userAgent,
  });

  return { comment };
}

/**
 * Updates a comment within the 15-minute author window.
 */
export async function updateCommentService({
  taskId,
  commentId,
  organizationId,
  userId,
  content,
  ipAddress = null,
  userAgent = null,
}) {
  if (typeof content !== "string" || !content.trim()) {
    const error = new Error("Comment content is required");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  if (content.length > 5000) {
    const error = new Error("Comment content cannot exceed 5000 characters");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  await verifyParentTaskForComment({
    taskId,
    organizationId,
    checkArchived: true,
    actionName: "edit comments on",
  });

  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      taskId,
      organizationId,
    },
  });

  if (!comment) {
    const error = new Error("Comment not found in this task");
    error.statusCode = 404;
    throw error;
  }

  // Author restriction
  if (comment.authorId !== userId) {
    const error = new Error("Forbidden: You cannot edit comments authored by other members");
    error.statusCode = 403;
    error.code = "CANNOT_EDIT_OTHERS_COMMENT";
    throw error;
  }

  // 15-minute window check
  const elapsedMs = Date.now() - new Date(comment.createdAt).getTime();
  if (elapsedMs > EDIT_WINDOW_MS) {
    const error = new Error(
      "Forbidden: Comments can only be edited within 15 minutes of posting"
    );
    error.statusCode = 403;
    error.code = "COMMENT_EDIT_WINDOW_EXPIRED";
    throw error;
  }

  const sanitized = sanitizeCommentContent(content);
  if (!sanitized) {
    const error = new Error("Comment content cannot be empty after sanitization");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: {
      content: sanitized,
      editedAt: new Date(),
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

  await logAuditEvent({
    organizationId,
    actorId: userId,
    action: "COMMENT_UPDATE",
    resourceType: "TASK",
    resourceId: String(taskId),
    details: {
      commentId: updated.id,
      taskId,
    },
    outcome: "SUCCESS",
    ipAddress,
    userAgent,
  });

  return { comment: updated };
}

/**
 * Deletes a comment: author (within 15 minutes) or moderator (any time).
 */
export async function deleteCommentService({
  taskId,
  commentId,
  organizationId,
  userId,
  permissions = new Set(),
  membership = null,
  ipAddress = null,
  userAgent = null,
}) {
  await verifyParentTaskForComment({
    taskId,
    organizationId,
    checkArchived: true,
    actionName: "delete comments on",
  });

  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      taskId,
      organizationId,
    },
  });

  if (!comment) {
    const error = new Error("Comment not found in this task");
    error.statusCode = 404;
    throw error;
  }

  const isMod = isUserModerator({ permissions, membership });
  const isAuthor = comment.authorId === userId;
  const elapsedMs = Date.now() - new Date(comment.createdAt).getTime();

  if (!isMod) {
    if (!isAuthor) {
      const error = new Error(
        "Forbidden: You cannot delete comments authored by other members"
      );
      error.statusCode = 403;
      error.code = "CANNOT_DELETE_OTHERS_COMMENT";
      throw error;
    }

    if (elapsedMs > EDIT_WINDOW_MS) {
      const error = new Error(
        "Forbidden: Comments can only be deleted within 15 minutes of posting unless you have moderator privileges"
      );
      error.statusCode = 403;
      error.code = "COMMENT_DELETE_WINDOW_EXPIRED";
      throw error;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.comment.delete({
      where: { id: commentId },
    });

    const remainingCount = await tx.comment.count({
      where: { taskId, organizationId },
    });

    await tx.task.update({
      where: { id: taskId },
      data: {
        commentsCount: remainingCount,
      },
    });
  });

  await logAuditEvent({
    organizationId,
    actorId: userId,
    action: "COMMENT_DELETE",
    resourceType: "TASK",
    resourceId: String(taskId),
    details: {
      commentId,
      taskId,
      wasModeratorAction: isMod && !isAuthor,
    },
    outcome: "SUCCESS",
    ipAddress,
    userAgent,
  });

  return { success: true, deletedCommentId: commentId };
}
