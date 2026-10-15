import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Filter,
  Kanban,
  Layers,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  SlidersHorizontal,
  Table,
  User,
} from "lucide-react";
import { api } from "../../services/api-client.js";

const COLUMNS = [
  { id: "TODO", label: "To do", dotColor: "#A855F7" },
  { id: "IN_PROGRESS", label: "In Progress", dotColor: "#3B82F6" },
  { id: "REVISION", label: "Revision", dotColor: "#F59E0B" },
  { id: "DONE", label: "Done", dotColor: "#10B981" },
];

export function KanbanBoardView({ user, activeOrg, userPermissions, onShowNotice }) {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [viewMode, setViewMode] = useState("board");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newProjectId, setNewProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Permission checks
  const canCreateTask = userPermissions.has("task:create");
  const canUpdateAny = userPermissions.has("task:update:any") || userPermissions.has("task:manage");
  const canUpdateOwn = userPermissions.has("task:update:own");

  async function loadTasks() {
    try {
      setLoading(true);
      setError(null);
      const [tasksRes, projectsRes] = await Promise.all([
        api.getTasks(),
        api.getProjects(),
      ]);
      setTasks(tasksRes.tasks || []);
      setProjects(projectsRes.projects || []);
      if (projectsRes.projects?.length > 0 && !newProjectId) {
        setNewProjectId(String(projectsRes.projects[0].id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, [activeOrg?.id]);

  function canEditTask(task) {
    if (canUpdateAny) return true;
    if (canUpdateOwn && (task.assigneeId === user.id || task.creatorId === user.id)) return true;
    return false;
  }

  async function handleStatusChange(taskId, newStatus) {
    try {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      if (!canEditTask(task)) {
        onShowNotice({
          type: "error",
          message: `ABAC Denial: You do not have permission to edit this task (assigned to ${task.assignee?.name || "another user"}). Only the assignee or manager can update it.`,
        });
        return;
      }

      const res = await api.updateTask(taskId, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
      onShowNotice({
        type: "success",
        message: `Task moved to "${COLUMNS.find((c) => c.id === newStatus)?.label}"`,
      });
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newProjectId) return;
    try {
      setSubmitting(true);
      const res = await api.createTask({
        title: newTitle.trim(),
        description: newDesc.trim(),
        priority: newPriority,
        projectId: Number(newProjectId),
        assigneeId: user.id,
      });
      setTasks((prev) => [res.task, ...prev]);
      setCreateModalOpen(false);
      setNewTitle("");
      setNewDesc("");
      onShowNotice({ type: "success", message: "Task created successfully" });
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (filterPriority === "ALL") return true;
    return t.priority === filterPriority;
  });

  if (loading) {
    return (
      <div className="view-loading-container">
        <div className="loading-spinner" />
        <span>Loading Kanban board…</span>
      </div>
    );
  }

  return (
    <div className="kanban-view-container">
      {/* Subheader */}
      <div className="kanban-view-header">
        <div className="kanban-header-left">
          <h2>Task</h2>
          <p>Manage and track your team's tasks seamlessly with clear priorities and progress.</p>
        </div>

        <div className="kanban-header-controls">
          <div className="view-mode-tabs">
            <button
              type="button"
              className={`view-tab-btn ${viewMode === "board" ? "active" : ""}`}
              onClick={() => setViewMode("board")}
            >
              <Kanban size={15} />
              <span>Board</span>
            </button>
            <button
              type="button"
              className={`view-tab-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
            >
              <Table size={15} />
              <span>List</span>
            </button>
          </div>

          <div className="header-action-filters">
            <button
              type="button"
              className={`filter-btn ${filterPriority !== "ALL" ? "active" : ""}`}
              onClick={() => {
                const next = filterPriority === "ALL" ? "HIGH" : filterPriority === "HIGH" ? "MEDIUM" : filterPriority === "MEDIUM" ? "LOW" : "ALL";
                setFilterPriority(next);
              }}
              title="Cycle filter: All -> High -> Medium -> Low"
            >
              <Filter size={15} />
              <span>Priority: {filterPriority}</span>
            </button>

            {canCreateTask && (
              <button
                type="button"
                className="btn-primary-emerald"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus size={16} />
                <span>Add Task</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="view-error-container">
          <AlertCircle size={20} className="text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {/* Kanban Board Columns */}
      <div className="kanban-columns-grid">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="kanban-column">
              <div className="kanban-column-header">
                <div className="kanban-column-title-group">
                  <span className="column-dot" style={{ backgroundColor: col.dotColor }} />
                  <h3>{col.label}</h3>
                  <span className="column-count-badge">{colTasks.length}</span>
                </div>
                <div className="kanban-column-actions">
                  {canCreateTask && (
                    <button
                      type="button"
                      className="icon-btn-ghost"
                      onClick={() => setCreateModalOpen(true)}
                      title="Add task in this column"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                  <button type="button" className="icon-btn-ghost">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>

              <div className="kanban-column-cards">
                {colTasks.map((task) => {
                  const editable = canEditTask(task);
                  return (
                    <div key={task.id} className={`kanban-card ${!editable ? "card-abac-restricted" : ""}`}>
                      <div className="kanban-card-top">
                        <span className={`tag-priority tag-${task.priority.toLowerCase()}`}>
                          {task.priority}
                        </span>
                        <div className="card-top-actions">
                          {!editable && (
                            <span
                              className="abac-lock-badge"
                              title={`ABAC Restricted: Assigned to ${task.assignee?.name || "another member"}. You cannot edit this task.`}
                            >
                              <Lock size={12} />
                            </span>
                          )}
                          <button type="button" className="icon-btn-ghost">
                            <MoreHorizontal size={14} />
                          </button>
                        </div>
                      </div>

                      <h4 className="kanban-card-title">{task.title}</h4>
                      {task.description && (
                        <p className="kanban-card-desc">{task.description}</p>
                      )}

                      {/* Interactive Status Transition Pill */}
                      <div className="kanban-card-status-selector">
                        <label className="card-status-label">Move to:</label>
                        <select
                          className="status-dropdown"
                          value={task.status}
                          disabled={!editable}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          title={!editable ? "ABAC Restricted: Only assignee or manager can update status" : "Change task status"}
                        >
                          {COLUMNS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="kanban-card-footer">
                        <div className="card-assignee-info">
                          {task.assignee?.avatarUrl ? (
                            <img
                              src={task.assignee.avatarUrl}
                              alt={task.assignee.name}
                              className="card-avatar"
                            />
                          ) : (
                            <span className="card-avatar-initials">
                              {task.assignee?.name ? task.assignee.name[0] : "U"}
                            </span>
                          )}
                          <span className="assignee-name-snippet">
                            {task.assignee?.name?.split(" ")[0] || "Unassigned"}
                          </span>
                        </div>

                        <div className="card-meta-counters">
                          <span className="counter-item">
                            <MessageSquare size={13} /> {task.commentsCount || 4}
                          </span>
                          <span className="counter-item">
                            <Paperclip size={13} /> {task.attachmentsCount || 2}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colTasks.length === 0 && (
                  <div className="empty-column-placeholder">
                    <span>No tasks in {col.label}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Add Task Modal */}
      {createModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create New Task</h3>
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={() => setCreateModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="modal-form">
              <div className="form-field">
                <label>Project</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Task Title</label>
                <input
                  type="text"
                  placeholder="e.g. Design checkout flow hero"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>Description</label>
                <textarea
                  placeholder="Details and criteria for this task..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="form-field">
                <label>Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-emerald"
                  disabled={submitting}
                >
                  {submitting ? "Creating…" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
