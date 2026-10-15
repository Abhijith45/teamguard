import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  Edit3,
  Layers,
  Lock,
  Trash2,
} from "lucide-react";
import { DueDateBadge } from "./DueDateBadge.jsx";

const PRIORITY_RANKS = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const STATUS_RANKS = {
  TODO: 1,
  IN_PROGRESS: 2,
  REVISION: 3,
  DONE: 4,
};

const STATUS_OPTIONS = [
  { id: "TODO", label: "To do" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "REVISION", label: "Revision" },
  { id: "DONE", label: "Done" },
];

export function TaskTableView({
  tasks = [],
  projects = [],
  members = [],
  user,
  canEditTask,
  canDeleteTask,
  onOpenDetail,
  onStatusChange,
  onDeleteTask,
}) {
  const [sortField, setSortField] = useState("id");
  const [sortDirection, setSortDirection] = useState("asc");

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedTasks = useMemo(() => {
    const list = [...tasks];
    list.sort((a, b) => {
      let valA, valB;

      switch (sortField) {
        case "id":
        case "key":
          valA = a.id;
          valB = b.id;
          break;
        case "title":
          valA = (a.title || "").toLowerCase();
          valB = (b.title || "").toLowerCase();
          break;
        case "status":
          valA = STATUS_RANKS[a.status] || 0;
          valB = STATUS_RANKS[b.status] || 0;
          break;
        case "priority":
          valA = PRIORITY_RANKS[a.priority] || 0;
          valB = PRIORITY_RANKS[b.priority] || 0;
          break;
        case "assignee":
          valA = (a.assignee?.name || "").toLowerCase();
          valB = (b.assignee?.name || "").toLowerCase();
          break;
        case "project":
          valA = (a.project?.name || "").toLowerCase();
          valB = (b.project?.name || "").toLowerCase();
          break;
        case "dueDate":
          // Empty due dates sorted to end
          valA = a.dueDate ? new Date(a.dueDate).getTime() : 9999999999999;
          valB = b.dueDate ? new Date(b.dueDate).getTime() : 9999999999999;
          break;
        default:
          valA = a.id;
          valB = b.id;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [tasks, sortField, sortDirection]);

  const renderSortIndicator = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} className="sort-icon-muted" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp size={12} className="sort-icon-active" />
    ) : (
      <ArrowDown size={12} className="sort-icon-active" />
    );
  };

  return (
    <div className="task-table-view-container" data-testid="task-table-view">
      <div className="task-table-toolbar">
        <div className="task-table-count">
          <span>{sortedTasks.length} {sortedTasks.length === 1 ? "task" : "tasks"}</span>
        </div>
      </div>

      <div className="task-table-card">
        <div className="task-table-scroll-wrapper">
          <table className="task-data-table" data-testid="task-data-table">
            <thead>
              <tr>
                <th
                  className="th-sortable th-key"
                  onClick={() => handleSort("id")}
                  title="Sort by JIRA Task Key"
                >
                  <div className="th-content">
                    <span>Key</span>
                    {renderSortIndicator("id")}
                  </div>
                </th>

                <th
                  className="th-sortable th-title"
                  onClick={() => handleSort("title")}
                  title="Sort by Task Title"
                >
                  <div className="th-content">
                    <span>Title</span>
                    {renderSortIndicator("title")}
                  </div>
                </th>

                <th
                  className="th-sortable th-status"
                  onClick={() => handleSort("status")}
                  title="Sort by Status Workflow"
                >
                  <div className="th-content">
                    <span>Status</span>
                    {renderSortIndicator("status")}
                  </div>
                </th>

                <th
                  className="th-sortable th-priority"
                  onClick={() => handleSort("priority")}
                  title="Sort by Priority Engine"
                >
                  <div className="th-content">
                    <span>Priority</span>
                    {renderSortIndicator("priority")}
                  </div>
                </th>

                <th
                  className="th-sortable th-assignee"
                  onClick={() => handleSort("assignee")}
                  title="Sort by Assignee"
                >
                  <div className="th-content">
                    <span>Assignee</span>
                    {renderSortIndicator("assignee")}
                  </div>
                </th>

                <th
                  className="th-sortable th-project"
                  onClick={() => handleSort("project")}
                  title="Sort by Project"
                >
                  <div className="th-content">
                    <span>Project</span>
                    {renderSortIndicator("project")}
                  </div>
                </th>

                <th
                  className="th-sortable th-due"
                  onClick={() => handleSort("dueDate")}
                  title="Sort by Due Date"
                >
                  <div className="th-content">
                    <span>Due Date</span>
                    {renderSortIndicator("dueDate")}
                  </div>
                </th>

                <th className="th-actions">
                  <span>Actions</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="task-table-empty">
                    <span>No tasks found matching active filter.</span>
                  </td>
                </tr>
              ) : (
                sortedTasks.map((task) => {
                  const editable = canEditTask ? canEditTask(task) : false;
                  const isArchived = Boolean(task.project?.isArchived);

                  return (
                    <tr
                      key={task.id}
                      className={`task-table-row ${!editable ? "row-abac-restricted" : ""}`}
                      onClick={() => onOpenDetail(task)}
                      data-testid={`task-table-row-${task.id}`}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenDetail(task);
                        }
                      }}
                    >
                      {/* Key */}
                      <td className="td-key">
                        <span className="task-jira-key-badge">
                          {(task.project?.key || "PROJ")}-{task.id}
                        </span>
                      </td>

                      {/* Title & Preview */}
                      <td className="td-title">
                        <div className="table-title-cell">
                          <span className="table-task-title">{task.title}</span>
                          {isArchived && (
                            <span className="badge-archived-tag">ARCHIVED</span>
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
                        </div>
                        {task.description && (
                          <span className="table-desc-preview">{task.description}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="td-status" onClick={(e) => e.stopPropagation()}>
                        <select
                          className="status-dropdown table-status-dropdown"
                          value={task.status}
                          disabled={!editable}
                          onChange={(e) => onStatusChange(task.id, e.target.value, e)}
                          title={!editable ? "ABAC Restricted: Cannot update status" : "Change task status"}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Priority */}
                      <td className="td-priority">
                        <span className={`tag-priority tag-${task.priority.toLowerCase()}`}>
                          {task.priority}
                        </span>
                      </td>

                      {/* Assignee */}
                      <td className="td-assignee">
                        <div className="table-assignee-chip">
                          {task.assignee?.avatarUrl ? (
                            <img
                              src={task.assignee.avatarUrl}
                              alt={task.assignee.name}
                              className="table-avatar-img"
                            />
                          ) : (
                            <span className="table-avatar-initials">
                              {task.assignee?.name ? task.assignee.name[0] : "U"}
                            </span>
                          )}
                          <span className="table-assignee-name">
                            {task.assignee?.name || "Unassigned"}
                          </span>
                        </div>
                      </td>

                      {/* Project */}
                      <td className="td-project">
                        <span className="table-project-tag" title={task.project?.name || "Project"}>
                          <Layers size={11} />
                          <span>{task.project?.name || `Project #${task.projectId}`}</span>
                        </span>
                      </td>

                      {/* Due Date with Overdue Alert Styling */}
                      <td className="td-due">
                        <DueDateBadge dueDate={task.dueDate} status={task.status} />
                      </td>

                      {/* Actions */}
                      <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="table-actions-cell">
                          <button
                            type="button"
                            className="icon-btn-ghost table-action-btn"
                            onClick={() => onOpenDetail(task)}
                            title="View / edit task details"
                          >
                            <Edit3 size={13} />
                          </button>
                          {canDeleteTask && !isArchived && (
                            <button
                              type="button"
                              className="icon-btn-ghost table-action-btn text-destructive"
                              onClick={() => onDeleteTask(task.id)}
                              title="Delete task"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
