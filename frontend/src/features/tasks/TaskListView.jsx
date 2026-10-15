import React, { useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Edit3,
  Layers,
  Lock,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { DueDateBadge } from "./DueDateBadge.jsx";

const STATUS_GROUPS = [
  { id: "TODO", label: "To do", dotColor: "#A855F7" },
  { id: "IN_PROGRESS", label: "In Progress", dotColor: "#3B82F6" },
  { id: "REVISION", label: "Revision", dotColor: "#F59E0B" },
  { id: "DONE", label: "Done", dotColor: "#10B981" },
];

export function TaskListView({
  tasks = [],
  projects = [],
  members = [],
  user,
  canEditTask,
  canCreateTask,
  canDeleteTask,
  onOpenDetail,
  onStatusChange,
  onDeleteTask,
  onCreateTaskInStatus,
}) {
  // Collapsible accordions state: maps statusId -> boolean (true = collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroup = (statusId) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [statusId]: !prev[statusId],
    }));
  };

  const expandAll = () => setCollapsedGroups({});
  const collapseAll = () => {
    const all = {};
    STATUS_GROUPS.forEach((g) => {
      all[g.id] = true;
    });
    setCollapsedGroups(all);
  };

  return (
    <div className="task-list-view-container" data-testid="task-list-view">
      {/* Quick controls bar */}
      <div className="task-list-toolbar">
        <div className="task-list-stats">
          <span className="total-tasks-badge">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"} total
          </span>
        </div>
        <div className="task-list-accordion-toggles">
          <button
            type="button"
            className="btn-accordion-toggle"
            onClick={expandAll}
            title="Expand all status groups"
          >
            Expand All
          </button>
          <button
            type="button"
            className="btn-accordion-toggle"
            onClick={collapseAll}
            title="Collapse all status groups"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Accordion groups per status */}
      <div className="task-list-groups">
        {STATUS_GROUPS.map((group) => {
          const groupTasks = tasks.filter((t) => t.status === group.id);
          const isCollapsed = Boolean(collapsedGroups[group.id]);

          return (
            <div
              key={group.id}
              className={`task-list-group-card ${isCollapsed ? "is-collapsed" : ""}`}
              data-testid={`task-list-group-${group.id.toLowerCase()}`}
            >
              {/* Accordion Header */}
              <div
                className="task-list-group-header"
                onClick={() => toggleGroup(group.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleGroup(group.id);
                  }
                }}
                aria-expanded={!isCollapsed}
              >
                <div className="group-header-left">
                  <span className="accordion-chevron">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                  <span className="group-dot" style={{ backgroundColor: group.dotColor }} />
                  <h3 className="group-title">{group.label}</h3>
                  <span className="group-count-badge">{groupTasks.length}</span>
                </div>

                <div className="group-header-right" onClick={(e) => e.stopPropagation()}>
                  {canCreateTask && onCreateTaskInStatus && (
                    <button
                      type="button"
                      className="group-add-btn"
                      onClick={() => onCreateTaskInStatus(group.id)}
                      title={`Add task in ${group.label}`}
                    >
                      <Plus size={14} />
                      <span>Add</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Accordion Body */}
              {!isCollapsed && (
                <div className="task-list-group-body">
                  {groupTasks.length === 0 ? (
                    <div className="task-list-empty-group">
                      <span>No tasks in {group.label}</span>
                    </div>
                  ) : (
                    <div className="task-list-rows">
                      {groupTasks.map((task) => {
                        const editable = canEditTask ? canEditTask(task) : false;
                        const isArchived = Boolean(task.project?.isArchived);

                        return (
                          <div
                            key={task.id}
                            className={`task-list-item-row ${!editable ? "item-abac-restricted" : ""}`}
                            onClick={() => onOpenDetail(task)}
                            data-testid={`task-list-item-${task.id}`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onOpenDetail(task);
                              }
                            }}
                          >
                            {/* Column 1: JIRA Key Badge */}
                            <div className="list-col-key">
                              <span className="task-jira-key-badge">
                                {(task.project?.key || "PROJ")}-{task.id}
                              </span>
                            </div>

                            {/* Column 2: Priority Tag */}
                            <div className="list-col-priority">
                              <span className={`tag-priority tag-${task.priority.toLowerCase()}`}>
                                {task.priority}
                              </span>
                            </div>

                            {/* Column 3: Title & Description Snippet */}
                            <div className="list-col-title-group">
                              <div className="list-title-row">
                                <span className="list-task-title">{task.title}</span>
                                {isArchived && (
                                  <span className="badge-archived-tag" title="Project is archived and read-only">
                                    ARCHIVED
                                  </span>
                                )}
                                {!editable && (
                                  <span
                                    className="abac-lock-badge"
                                    title={
                                      isArchived
                                        ? "Project is archived and read-only"
                                        : `ABAC Restricted: Assigned to ${task.assignee?.name || "another user"}`
                                    }
                                  >
                                    <Lock size={11} />
                                  </span>
                                )}
                                {task.subtasks && task.subtasks.length > 0 && (
                                  <span
                                    className={`subtask-card-badge ${
                                      task.subtasks.every((s) => s.isCompleted)
                                        ? "subtask-card-badge-complete"
                                        : ""
                                    }`}
                                    title={`Subtasks: ${task.subtasks.filter((s) => s.isCompleted).length}/${task.subtasks.length} completed`}
                                  >
                                    <CheckSquare size={11} />
                                    <span>
                                      {task.subtasks.filter((s) => s.isCompleted).length}/{task.subtasks.length}
                                    </span>
                                  </span>
                                )}
                                {Number(task.commentsCount) > 0 && (
                                  <span
                                    className="comment-card-badge"
                                    title={`Comments: ${task.commentsCount} discussion items`}
                                  >
                                    <MessageSquare size={11} />
                                    <span>{task.commentsCount}</span>
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="list-task-snippet">{task.description}</p>
                              )}
                            </div>

                            {/* Column 4: Project Tag */}
                            <div className="list-col-project">
                              <span className="list-project-pill" title={`Project: ${task.project?.name || "General"}`}>
                                <Layers size={12} />
                                <span>{task.project?.name || `Project #${task.projectId}`}</span>
                              </span>
                            </div>

                            {/* Column 5: Due Date Badge with Overdue Styling */}
                            <div className="list-col-due">
                              <DueDateBadge dueDate={task.dueDate} status={task.status} />
                            </div>

                            {/* Column 6: Assignee Avatar & Name */}
                            <div className="list-col-assignee">
                              <div className="list-assignee-chip" title={`Assignee: ${task.assignee?.name || "Unassigned"}`}>
                                {task.assignee?.avatarUrl ? (
                                  <img
                                    src={task.assignee.avatarUrl}
                                    alt={task.assignee.name}
                                    className="list-avatar-img"
                                  />
                                ) : (
                                  <span className="list-avatar-initials">
                                    {task.assignee?.name ? task.assignee.name[0] : "U"}
                                  </span>
                                )}
                                <span className="list-assignee-text">
                                  {task.assignee?.name?.split(" ")[0] || "Unassigned"}
                                </span>
                              </div>
                            </div>

                            {/* Column 7: Inline Move To Status Dropdown */}
                            <div className="list-col-status-select" onClick={(e) => e.stopPropagation()}>
                              <select
                                className="status-dropdown list-status-dropdown"
                                value={task.status}
                                disabled={!editable}
                                onChange={(e) => onStatusChange(task.id, e.target.value, e)}
                                title={!editable ? "ABAC Restricted: Cannot change status" : "Change task status"}
                              >
                                {STATUS_GROUPS.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Column 8: Row Actions */}
                            <div className="list-col-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="icon-btn-ghost list-action-btn"
                                onClick={() => onOpenDetail(task)}
                                title="View / edit task details"
                              >
                                <Edit3 size={14} />
                              </button>
                              {canDeleteTask && !isArchived && (
                                <button
                                  type="button"
                                  className="icon-btn-ghost list-action-btn text-destructive"
                                  onClick={() => onDeleteTask(task.id)}
                                  title="Delete task"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
