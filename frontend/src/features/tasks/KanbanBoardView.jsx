import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
  Kanban,
  Layers,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Shield,
  SlidersHorizontal,
  Table,
  Trash2,
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
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [viewMode, setViewMode] = useState("board");
  
  // Create Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newProjectId, setNewProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Detail / Edit Modal state (TASK-002 Enhanced Governance UI)
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStatus, setEditStatus] = useState("TODO");
  const [editPriority, setEditPriority] = useState("MEDIUM");
  const [editProjectId, setEditProjectId] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [modalError, setModalError] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Permission checks
  const canCreateTask = userPermissions.has("task:create");
  const canUpdateAny = userPermissions.has("task:update:any") || userPermissions.has("task:manage");
  const canUpdateOwn = userPermissions.has("task:update:own");
  const canAssign = userPermissions.has("task:assign") || userPermissions.has("task:manage") || canUpdateAny;
  const canManageProjects = userPermissions.has("project:manage") || userPermissions.has("task:manage") || canUpdateAny;
  const canDeleteTask = userPermissions.has("task:delete") || canUpdateAny;

  async function loadTasks() {
    try {
      setLoading(true);
      setError(null);
      const [tasksRes, projectsRes, membersRes] = await Promise.all([
        api.getTasks(),
        api.getProjects(),
        api.getMembers().catch(() => ({ members: [] })),
      ]);
      setTasks(tasksRes.tasks || []);
      setProjects(projectsRes.projects || []);
      setMembers(membersRes.members || []);
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

  function openTaskDetail(task) {
    setEditingTask(task);
    setEditTitle(task.title || "");
    setEditDesc(task.description || "");
    setEditStatus(task.status || "TODO");
    setEditPriority(task.priority || "MEDIUM");
    setEditProjectId(String(task.projectId));
    setEditAssigneeId(task.assigneeId ? String(task.assigneeId) : "");
    setModalError(null);
  }

  async function handleStatusChange(taskId, newStatus, e) {
    if (e) e.stopPropagation();
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

  async function handleSaveTaskEdit(e) {
    e.preventDefault();
    if (!editingTask) return;
    if (!editTitle.trim()) {
      setModalError("Task title is required.");
      return;
    }

    const isEditable = canEditTask(editingTask);
    if (!isEditable) {
      setModalError("ABAC Policy Violation: You do not have permission to modify this task.");
      return;
    }

    try {
      setSavingEdit(true);
      setModalError(null);

      const payload = {
        title: editTitle.trim(),
        description: editDesc.trim(),
        status: editStatus,
        priority: editPriority,
      };

      // Only include protected governance fields if user possesses explicit permissions
      if (canManageProjects && Number(editProjectId) !== editingTask.projectId) {
        payload.projectId = Number(editProjectId);
      }
      if (canAssign) {
        const newAssignee = editAssigneeId ? Number(editAssigneeId) : null;
        if (newAssignee !== editingTask.assigneeId) {
          payload.assigneeId = newAssignee;
        }
      }

      const res = await api.updateTask(editingTask.id, payload);
      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? res.task : t)));
      setEditingTask(null);
      onShowNotice({ type: "success", message: "Task details updated successfully" });
    } catch (err) {
      setModalError(err.message || "Failed to update task");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteTask(taskId) {
    if (!window.confirm("Are you sure you want to permanently delete this task?")) return;
    try {
      setSavingEdit(true);
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setEditingTask(null);
      onShowNotice({ type: "success", message: "Task deleted successfully" });
    } catch (err) {
      setModalError(err.message || "Failed to delete task");
    } finally {
      setSavingEdit(false);
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
          <h2>Task Board</h2>
          <p>Manage and track team tasks with strict attribute-based ownership (ABAC) and governance protection.</p>
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
        <div className="view-error-container" role="alert">
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
                </div>
              </div>

              <div className="kanban-column-cards">
                {colTasks.map((task) => {
                  const editable = canEditTask(task);
                  return (
                    <div
                      key={task.id}
                      className={`kanban-card ${!editable ? "card-abac-restricted" : ""}`}
                      onClick={() => openTaskDetail(task)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openTaskDetail(task);
                        }
                      }}
                      title={editable ? "Click to view or edit task details" : "ABAC Restricted: Click to view details"}
                    >
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
                          <div className="card-quick-actions">
                            <button
                              type="button"
                              className="card-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTaskDetail(task);
                              }}
                              title="Edit task details"
                            >
                              <Edit3 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>

                      <h4 className="kanban-card-title">{task.title}</h4>
                      {task.description && (
                        <p className="kanban-card-desc">{task.description}</p>
                      )}

                      {/* Interactive Status Transition Pill */}
                      <div className="kanban-card-status-selector" onClick={(e) => e.stopPropagation()}>
                        <label className="card-status-label">Move to:</label>
                        <select
                          className="status-dropdown"
                          value={task.status}
                          disabled={!editable}
                          onChange={(e) => handleStatusChange(task.id, e.target.value, e)}
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
                          <span className="counter-item" title="Associated project">
                            <Layers size={12} /> {task.project?.name || "Project"}
                          </span>
                          <span className="counter-item">
                            <MessageSquare size={13} /> {task.commentsCount || 4}
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

      {/* Task Details & Edit Modal (TASK-002 Protected Governance Attributes) */}
      {editingTask && (
        <div
          className="modal-backdrop"
          onClick={() => setEditingTask(null)}
          role="presentation"
        >
          <div
            className="modal-dialog modal-dialog-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-detail-title"
          >
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h3 id="task-detail-title">Task Details</h3>
                <span className={`tag-priority tag-${editingTask.priority.toLowerCase()}`}>
                  {editingTask.priority}
                </span>
                {!canEditTask(editingTask) && (
                  <span className="badge-locked" title="ABAC restriction: Read-only access">
                    <Lock size={12} /> Read Only
                  </span>
                )}
              </div>
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={() => setEditingTask(null)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="dialog-error-banner" role="alert">
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTaskEdit} className="modal-form">
              <div className="form-field">
                <label htmlFor="edit-task-title">Title</label>
                <input
                  id="edit-task-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  disabled={!canEditTask(editingTask)}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="edit-task-desc">Description</label>
                <textarea
                  id="edit-task-desc"
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  disabled={!canEditTask(editingTask)}
                  placeholder="Provide context or acceptance criteria..."
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-field">
                  <label htmlFor="edit-task-status">Status</label>
                  <select
                    id="edit-task-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    disabled={!canEditTask(editingTask)}
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="edit-task-priority">Priority</label>
                  <select
                    id="edit-task-priority"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    disabled={!canEditTask(editingTask)}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>

              {/* TASK-002: Protected Governance Fields Mutation Barrier Section */}
              <div className="governance-block">
                <div className="governance-header">
                  <div className="governance-title">
                    <Shield size={14} className="text-emerald" />
                    <span>Governance & ABAC Protected Attributes (TASK-002)</span>
                  </div>
                  <span className="governance-subtext">Server-enforced immutability barrier</span>
                </div>

                <div className="governance-fields-grid">
                  {/* Project Field */}
                  <div className="governance-field-item">
                    <span className="governance-field-label">Assigned Project</span>
                    {canManageProjects ? (
                      <select
                        value={editProjectId}
                        onChange={(e) => setEditProjectId(e.target.value)}
                        className="status-dropdown"
                        style={{ padding: "7px 10px", fontSize: "0.8rem" }}
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="governance-field-value">
                        <span>{editingTask.project?.name || `Project #${editingTask.projectId}`}</span>
                        <span
                          className="badge-locked"
                          title="Protected Field: Re-parenting tasks requires Manager or Admin permissions (TASK-002 / SEC-07)"
                        >
                          <Lock size={10} /> Locked
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Assignee Field */}
                  <div className="governance-field-item">
                    <span className="governance-field-label">Task Assignee</span>
                    {canAssign ? (
                      <select
                        value={editAssigneeId}
                        onChange={(e) => setEditAssigneeId(e.target.value)}
                        className="status-dropdown"
                        style={{ padding: "7px 10px", fontSize: "0.8rem" }}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.user?.name || `User #${m.userId}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="governance-field-value">
                        <span>{editingTask.assignee?.name || "Unassigned"}</span>
                        <span
                          className="badge-locked"
                          title="Protected Field: Modifying assignee requires task:assign permission (TASK-002 / SEC-07)"
                        >
                          <Lock size={10} /> Locked
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Creator Provenance */}
                <div className="governance-field-item" style={{ marginTop: 4 }}>
                  <span className="governance-field-label">Creator Provenance</span>
                  <div className="governance-field-value">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <User size={12} className="text-muted" />
                      <span>{editingTask.creator?.name || `User #${editingTask.creatorId}`}</span>
                    </div>
                    <span className="badge-immutable" title="Provenance invariant: Creator ID cannot be modified by any actor">
                      <Shield size={10} /> Immutable
                    </span>
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ justifyContent: "space-between" }}>
                <div>
                  {canDeleteTask && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ color: "#EF4444", borderColor: "#FEE2E2", background: "#FEF2F2" }}
                      onClick={() => handleDeleteTask(editingTask.id)}
                      disabled={savingEdit}
                    >
                      <Trash2 size={14} style={{ marginRight: 4 }} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditingTask(null)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                  {canEditTask(editingTask) && (
                    <button
                      type="submit"
                      className="btn-primary-emerald"
                      disabled={savingEdit}
                    >
                      {savingEdit ? "Saving…" : "Save Changes"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Task Modal */}
      {createModalOpen && (
        <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
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
