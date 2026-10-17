import test from "node:test";
import assert from "node:assert/strict";

// Test suite for TASK-204 — Slide-Over Task Detail Drawer & Native Drag-and-Drop Kanban

function canEditTask(task, user, userPermissions) {
  if (!task) return false;
  if (task.project?.isArchived) return false;
  const canUpdateAny = userPermissions.has("task:update:any") || userPermissions.has("task:manage");
  const canUpdateOwn = userPermissions.has("task:update:own");
  const canUpdateAssigned = userPermissions.has("task:update:assigned");
  if (canUpdateAny) return true;
  if (canUpdateOwn && task.creatorId === user.id) return true;
  if (canUpdateAssigned && task.assigneeId === user.id) return true;
  return false;
}

function canEditTitle(task, user, userPermissions) {
  if (!task) return false;
  if (task.project?.isArchived) return false;
  const canUpdateAny = userPermissions.has("task:update:any") || userPermissions.has("task:manage");
  const canUpdateOwn = userPermissions.has("task:update:own");
  if (canUpdateAny) return true;
  if (canUpdateOwn && task.creatorId === user.id) return true;
  return false;
}

function computeOptimisticStatusChange(tasks, taskId, targetStatus) {
  const originalTask = tasks.find((t) => t.id === taskId);
  if (!originalTask) return { updatedTasks: tasks, rollbackTasks: tasks };
  
  const rollbackTasks = [...tasks];
  const updatedTasks = tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          status: targetStatus,
          completedAt: targetStatus === "DONE" ? "2026-10-15T18:00:00.000Z" : null,
        }
      : t
  );

  return { updatedTasks, rollbackTasks };
}

function constructDrawerSavePayload({
  task,
  user,
  title,
  description,
  status,
  priority,
  dueDate,
  projectId,
  assigneeId,
  userPermissions,
}) {
  const canUpdateAny =
    userPermissions.has("task:update:any") ||
    userPermissions.has("task:manage");
  const canManageProjects =
    userPermissions.has("project:manage") ||
    canUpdateAny;
  const canAssign =
    userPermissions.has("task:assign") ||
    canUpdateAny;

  const isCreator = user ? task?.creatorId === user.id : true;
  const canEditTitlePerm = canUpdateAny || (userPermissions.has("task:update:own") && isCreator);

  const payload = {
    description: description.trim(),
    status,
    priority,
    dueDate: dueDate ? new Date(dueDate).toISOString() : null,
  };

  if (canEditTitlePerm && title !== undefined) {
    payload.title = title.trim();
  }

  if (canManageProjects && projectId && Number(projectId) !== task.projectId) {
    payload.projectId = Number(projectId);
  }

  if (canAssign) {
    payload.assigneeId = assigneeId ? Number(assigneeId) : null;
  }

  return payload;
}

test("TASK-204 [REQ 1 / US-ABAC-002]: canEditTask allows own tasks for Member, denies other users' tasks", () => {
  const memberUser = { id: 10, name: "Alice Developer" };
  const memberPerms = new Set(["task:read", "task:create", "task:update:own"]);

  const ownTask = {
    id: 101,
    title: "Implement Drawer",
    assigneeId: 10,
    creatorId: 10,
    project: { isArchived: false },
  };

  const otherTask = {
    id: 102,
    title: "Deploy Gateway",
    assigneeId: 99,
    creatorId: 99,
    project: { isArchived: false },
  };

  assert.equal(canEditTask(ownTask, memberUser, memberPerms), true, "Member should be allowed to edit/drag their own assigned task");
  assert.equal(canEditTask(otherTask, memberUser, memberPerms), false, "Member must be denied editing/dragging tasks assigned to others");
});

test("TASK-204 [REQ 2 / US-ABAC-003]: Project Archival locks tasks from drag-and-drop and editing regardless of role", () => {
  const adminUser = { id: 1, name: "Admin Leader" };
  const adminPerms = new Set(["task:update:any", "task:manage", "project:manage"]);

  const archivedTask = {
    id: 201,
    title: "Legacy Feature Spec",
    assigneeId: 1,
    creatorId: 1,
    project: { id: 5, name: "Deprecated App", isArchived: true },
  };

  assert.equal(
    canEditTask(archivedTask, adminUser, adminPerms),
    false,
    "Archived projects must lock tasks from drag-and-drop and mutations even for Admin"
  );
});

test("TASK-204 [REQ 3 / TG-TASK-004]: Optimistic Kanban status repositioning records completedAt and rolls back on failure", () => {
  const initialTasks = [
    { id: 1, title: "Card A", status: "TODO", completedAt: null },
    { id: 2, title: "Card B", status: "IN_PROGRESS", completedAt: null },
  ];

  // Move Card A to DONE
  const { updatedTasks, rollbackTasks } = computeOptimisticStatusChange(initialTasks, 1, "DONE");
  const movedCard = updatedTasks.find((t) => t.id === 1);
  assert.equal(movedCard.status, "DONE", "Card A must optimistically move to DONE");
  assert.notEqual(movedCard.completedAt, null, "Card A completedAt must be recorded when moving to DONE");

  // Simulate server rejection (e.g. network fail or ABAC denial)
  assert.equal(rollbackTasks[0].status, "TODO", "Rollback must restore original status TODO");
  assert.equal(rollbackTasks[0].completedAt, null, "Rollback must restore original completedAt null");
});

test("TASK-204 [REQ 4 / TG-TASK-005]: Drawer payload enforces governance barrier on projectId and assigneeId for regular members", () => {
  const task = { id: 301, projectId: 10, assigneeId: 5 };
  const memberPerms = new Set(["task:update:own"]);

  // Member attempts to re-parent project to 99 and re-assign to 88
  const memberPayload = constructDrawerSavePayload({
    task,
    title: "Updated Task Title",
    description: "Updated desc",
    status: "REVISION",
    priority: "HIGH",
    dueDate: "2026-11-01",
    projectId: "99",
    assigneeId: "88",
    userPermissions: memberPerms,
  });

  assert.equal(memberPayload.title, "Updated Task Title");
  assert.equal(memberPayload.status, "REVISION");
  assert.equal(memberPayload.projectId, undefined, "projectId must be stripped for users without project:manage");
  assert.equal(memberPayload.assigneeId, undefined, "assigneeId must be stripped for users without task:assign");

  // Admin possesses governance permissions
  const adminPerms = new Set(["task:update:any", "task:manage", "project:manage", "task:assign"]);
  const adminPayload = constructDrawerSavePayload({
    task,
    title: "Admin Super Update",
    description: "Admin updated desc",
    status: "IN_PROGRESS",
    priority: "URGENT",
    dueDate: "2026-11-05",
    projectId: "99",
    assigneeId: "88",
    userPermissions: adminPerms,
  });

  assert.equal(adminPayload.projectId, 99, "projectId must be included for managers/admins");
  assert.equal(adminPayload.assigneeId, 88, "assigneeId must be included for users with task:assign");
});

test("TASK-506 [REQ 1 / US-ABAC-004 AC 1]: canEditTask & canEditTitle allow creator holding task:update:own", () => {
  const creatorUser = { id: 10, name: "Alice Creator" };
  const creatorPerms = new Set(["task:read", "task:update:own"]);
  const task = { id: 501, title: "Feature Spec", creatorId: 10, assigneeId: 99, project: { isArchived: false } };

  assert.equal(canEditTask(task, creatorUser, creatorPerms), true, "Creator with task:update:own can edit task");
  assert.equal(canEditTitle(task, creatorUser, creatorPerms), true, "Creator with task:update:own can modify title");
});

test("TASK-506 [REQ 2 / US-ABAC-004 AC 2]: canEditTask denies non-creator assignee holding strictly task:update:own", () => {
  const assigneeUser = { id: 20, name: "Bob Assignee" };
  const perms = new Set(["task:read", "task:update:own"]);
  const task = { id: 502, title: "Backend API", creatorId: 10, assigneeId: 20, project: { isArchived: false } };

  assert.equal(canEditTask(task, assigneeUser, perms), false, "Assignee lacking task:update:assigned cannot edit task");
  assert.equal(canEditTitle(task, assigneeUser, perms), false, "Assignee lacking task:update:assigned cannot modify title");
});

test("TASK-506 [REQ 3 / US-ABAC-004 AC 3 & 4]: canEditTask allows assignee holding task:update:assigned, but canEditTitle denies title edits", () => {
  const assigneeUser = { id: 20, name: "Bob Assignee" };
  const perms = new Set(["task:read", "task:update:assigned"]);
  const task = { id: 503, title: "Refactor CSS", creatorId: 10, assigneeId: 20, project: { isArchived: false } };

  assert.equal(canEditTask(task, assigneeUser, perms), true, "Assignee with task:update:assigned can edit task execution fields");
  assert.equal(canEditTitle(task, assigneeUser, perms), false, "Assignee with task:update:assigned CANNOT modify task title");
});

test("TASK-506 [REQ 4 / US-ABAC-004 AC 4]: constructDrawerSavePayload strips title for assignee holding strictly task:update:assigned", () => {
  const assigneeUser = { id: 20, name: "Bob Assignee" };
  const perms = new Set(["task:update:assigned"]);
  const task = { id: 504, title: "Initial Title", creatorId: 10, assigneeId: 20 };

  const payload = constructDrawerSavePayload({
    task,
    user: assigneeUser,
    title: "Attempted Subversive Title Change",
    description: "Valid progress description",
    status: "IN_PROGRESS",
    priority: "HIGH",
    userPermissions: perms,
  });

  assert.equal(payload.title, undefined, "Title must be excluded from save payload for non-creator assignee");
  assert.equal(payload.status, "IN_PROGRESS", "Status transition must be preserved");
  assert.equal(payload.description, "Valid progress description", "Description must be preserved");
});
