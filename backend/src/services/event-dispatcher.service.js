import { EventEmitter } from "node:events";
import { createNotificationService } from "./notifications.service.js";

export const workspaceEventEmitter = new EventEmitter();
workspaceEventEmitter.setMaxListeners(50);

/**
 * Dispatches an event across the workspace asynchronously without blocking
 * the caller or throwing uncaught exceptions into request transactions.
 */
export function dispatchWorkspaceEvent(eventName, payload) {
  setImmediate(() => {
    try {
      workspaceEventEmitter.emit(eventName, payload);
    } catch (err) {
      console.error(`[EventDispatcher] Error emitting event "${eventName}":`, err);
    }
  });
}

/**
 * Handles "task:assigned" domain event.
 * Dispatches notification to the newly assigned user (if not the actor).
 */
async function handleTaskAssigned({
  organizationId,
  actorId,
  task,
  newAssigneeId,
}) {
  if (!newAssigneeId || newAssigneeId === actorId) return;

  const notification = await createNotificationService({
    organizationId,
    userId: newAssigneeId,
    actorId,
    type: "TASK_ASSIGNED",
    title: "Task Assigned",
    message: `You were assigned to task "${task.title}"`,
    resourceType: "task",
    resourceId: task.id,
    link: `/tasks?taskId=${task.id}`,
  });

  if (notification) {
    workspaceEventEmitter.emit("notification:dispatched", { notification });
  }
}

/**
 * Handles "task:status_changed" domain event.
 * Dispatches notifications to task stakeholders (creator, assignee) excluding actor.
 */
async function handleTaskStatusChanged({
  organizationId,
  actorId,
  task,
  previousStatus,
  newStatus,
}) {
  if (!task || previousStatus === newStatus) return;

  const recipientIds = new Set();
  if (task.assigneeId && task.assigneeId !== actorId) {
    recipientIds.add(task.assigneeId);
  }
  if (task.creatorId && task.creatorId !== actorId) {
    recipientIds.add(task.creatorId);
  }

  for (const recipientId of recipientIds) {
    const notification = await createNotificationService({
      organizationId,
      userId: recipientId,
      actorId,
      type: "TASK_STATUS_CHANGED",
      title: "Task Status Updated",
      message: `Task "${task.title}" was moved from ${previousStatus} to ${newStatus}`,
      resourceType: "task",
      resourceId: task.id,
      link: `/tasks?taskId=${task.id}`,
    });

    if (notification) {
      workspaceEventEmitter.emit("notification:dispatched", { notification });
    }
  }
}

/**
 * Handles "comment:created" domain event.
 * Dispatches notifications to task stakeholders (creator, assignee) excluding comment author.
 */
async function handleCommentCreated({
  organizationId,
  actorId,
  comment,
  task,
}) {
  if (!task || !comment) return;

  const recipientIds = new Set();
  if (task.assigneeId && task.assigneeId !== actorId) {
    recipientIds.add(task.assigneeId);
  }
  if (task.creatorId && task.creatorId !== actorId) {
    recipientIds.add(task.creatorId);
  }

  const snippet = comment.content
    ? comment.content.length > 70
      ? `${comment.content.slice(0, 70)}...`
      : comment.content
    : "";

  for (const recipientId of recipientIds) {
    const notification = await createNotificationService({
      organizationId,
      userId: recipientId,
      actorId,
      type: "COMMENT_ADDED",
      title: "New Comment on Task",
      message: `New comment on "${task.title}": "${snippet}"`,
      resourceType: "task",
      resourceId: task.id,
      link: `/tasks?taskId=${task.id}`,
    });

    if (notification) {
      workspaceEventEmitter.emit("notification:dispatched", { notification });
    }
  }
}

/**
 * Handles "subtask:completed" domain event.
 * Dispatches notifications to stakeholders if a subtask is marked complete.
 */
async function handleSubtaskCompleted({
  organizationId,
  actorId,
  subtask,
  task,
}) {
  if (!task || !subtask || !subtask.isCompleted) return;

  const recipientIds = new Set();
  if (task.assigneeId && task.assigneeId !== actorId) {
    recipientIds.add(task.assigneeId);
  }
  if (task.creatorId && task.creatorId !== actorId) {
    recipientIds.add(task.creatorId);
  }

  for (const recipientId of recipientIds) {
    const notification = await createNotificationService({
      organizationId,
      userId: recipientId,
      actorId,
      type: "SUBTASK_COMPLETED",
      title: "Subtask Completed",
      message: `Subtask "${subtask.title}" was completed on task "${task.title}"`,
      resourceType: "task",
      resourceId: task.id,
      link: `/tasks?taskId=${task.id}`,
    });

    if (notification) {
      workspaceEventEmitter.emit("notification:dispatched", { notification });
    }
  }
}

// Register default domain subscribers
workspaceEventEmitter.on("task:assigned", (payload) => {
  handleTaskAssigned(payload).catch((err) => {
    console.error("[EventDispatcher] Error in handleTaskAssigned:", err);
  });
});

workspaceEventEmitter.on("task:status_changed", (payload) => {
  handleTaskStatusChanged(payload).catch((err) => {
    console.error("[EventDispatcher] Error in handleTaskStatusChanged:", err);
  });
});

workspaceEventEmitter.on("comment:created", (payload) => {
  handleCommentCreated(payload).catch((err) => {
    console.error("[EventDispatcher] Error in handleCommentCreated:", err);
  });
});

workspaceEventEmitter.on("subtask:completed", (payload) => {
  handleSubtaskCompleted(payload).catch((err) => {
    console.error("[EventDispatcher] Error in handleSubtaskCompleted:", err);
  });
});
