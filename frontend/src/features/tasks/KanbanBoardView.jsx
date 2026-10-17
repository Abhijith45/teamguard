import { useEffect, useState, useRef } from "react";
import {
  AlertCircle,
  CheckSquare,
  Edit3,
  Filter,
  Kanban,
  Layers,
  List,
  Lock,
  MessageSquare,
  Plus,
  Search,
  Table,
  User,
  X,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import { getWorkspaceEventStream } from "../../services/eventStream.js";
import {
  applyRealtimeTaskCreate,
  applyRealtimeTaskUpdate,
  applyRealtimeTaskDelete,
} from "../sync/syncUtils.js";
import { TaskDetailDrawer } from "./TaskDetailDrawer.jsx";
import { TaskListView } from "./TaskListView.jsx";
import { TaskTableView } from "./TaskTableView.jsx";
import { DueDateBadge } from "./DueDateBadge.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

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
  const [viewMode, setViewMode] = useState("board"); // "board" | "list" | "table"
  const [syncStatus, setSyncStatus] = useState("disconnected"); // TASK-503 / UD-003

  // Search & Multi-Parameter Filter state (TASK-206)
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProject, setFilterProject] = useState("ALL");
  const [filterAssignee, setFilterAssignee] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");

  // Pagination state (TASK-206)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Create Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newProjectId, setNewProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const createTaskModalRef = useRef(null);

  useFocusTrap({
    containerRef: createTaskModalRef,
    isOpen: createModalOpen,
    onEscape: () => setCreateModalOpen(false),
  });

  // Detail Drawer state (TASK-204)
  const [editingTask, setEditingTask] = useState(null);

  // Native HTML5 Drag-and-Drop state (TASK-204)
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

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

  // TASK-503: Real-Time State Synchronization via SSE Streams (UD-003)
  useEffect(() => {
    if (!activeOrg?.id) return;

    const stream = getWorkspaceEventStream();
    const unsubStatus = stream.onStatusChange((status) => {
      setSyncStatus(status);
    });

    const unsubCreate = stream.on("task:created", (payload) => {
      if (!payload?.task) return;
      setTasks((prev) => applyRealtimeTaskCreate(prev, payload.task));
    });

    const unsubUpdate = stream.on("task:updated", (payload) => {
      if (!payload) return;
      setTasks((prev) => applyRealtimeTaskUpdate(prev, payload));
      const targetId = Number(payload.taskId || payload.task?.id);
      setEditingTask((prev) =>
        prev && Number(prev.id) === targetId
          ? { ...prev, ...(payload.task || {}), ...(payload.changes || {}) }
          : prev
      );
    });

    const unsubDelete = stream.on("task:deleted", (payload) => {
      if (!payload?.taskId) return;
      setTasks((prev) => applyRealtimeTaskDelete(prev, payload.taskId));
      setEditingTask((prev) =>
        prev && Number(prev.id) === Number(payload.taskId) ? null : prev
      );
    });

    const unsubReconcile = stream.on("sync:reconcile", () => {
      loadTasks();
    });

    stream.connect();

    return () => {
      unsubStatus();
      unsubCreate();
      unsubUpdate();
      unsubDelete();
      unsubReconcile();
      stream.disconnect();
    };
  }, [activeOrg?.id]);

  // TASK-003: Broadcast event listener for global workspace cache purges
  useEffect(() => {
    function handlePurge() {
      setTasks([]);
      setProjects([]);
      setMembers([]);
      setEditingTask(null);
      setCreateModalOpen(false);
      setLoading(true);
    }
    window.addEventListener("teamguard:workspace-purged", handlePurge);
    return () => window.removeEventListener("teamguard:workspace-purged", handlePurge);
  }, []);

  // TASK-304: Deep-link task navigation from notification drawer
  useEffect(() => {
    async function handleNavigate(e) {
      const taskId = e.detail?.taskId;
      if (!taskId) return;
      let target = tasks.find((t) => t.id === Number(taskId));
      if (!target) {
        try {
          const res = await api.getTask(taskId);
          target = res.task || res;
        } catch {
          // ignore error
        }
      }
      if (target) {
        openTaskDetail(target);
      }
    }
    window.addEventListener("teamguard:navigate-task", handleNavigate);
    return () => window.removeEventListener("teamguard:navigate-task", handleNavigate);
  }, [tasks]);

  // Reset pagination page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterProject, filterAssignee, filterStatus, filterPriority, pageSize]);

  // US-A11Y-002: Listen for global 'C' key quick create task trigger
  useEffect(() => {
    function handleQuickCreate() {
      if (canCreateTask) {
        setCreateModalOpen(true);
      }
    }
    window.addEventListener("teamguard:quick-create-task", handleQuickCreate);
    return () => window.removeEventListener("teamguard:quick-create-task", handleQuickCreate);
  }, [canCreateTask]);

  function canEditTask(task) {
    if (!task) return false;
    if (task.project?.isArchived) return false;
    if (canUpdateAny) return true;
    if (canUpdateOwn && (task.assigneeId === user.id || task.creatorId === user.id)) return true;
    return false;
  }

  async function openTaskDetail(task) {
    setEditingTask(task);
    try {
      const res = await api.getSubtasks(task.id);
      if (res && res.subtasks) {
        setEditingTask((prev) =>
          prev && prev.id === task.id ? { ...prev, subtasks: res.subtasks } : prev
        );
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, subtasks: res.subtasks } : t))
        );
      }
    } catch {
      // Fallback to task's embedded subtasks
    }
  }

  function handleSubtasksChange(updatedSubtasks) {
    if (!editingTask) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === editingTask.id ? { ...t, subtasks: updatedSubtasks } : t
      )
    );
    setEditingTask((prev) =>
      prev ? { ...prev, subtasks: updatedSubtasks } : null
    );
  }

  function handleCommentsCountChange(taskId, newCount) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, commentsCount: newCount } : t))
    );
    if (editingTask && editingTask.id === taskId) {
      setEditingTask((prev) => ({ ...prev, commentsCount: newCount }));
    }
  }

  // Status transition with optimistic update and rollback (TASK-204)
  async function handleStatusChange(taskId, newStatus, e) {
    if (e) e.stopPropagation();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === newStatus) return;

    if (!canEditTask(task)) {
      onShowNotice({
        type: "error",
        message: `ABAC Denial: You do not have permission to edit this task (assigned to ${task.assignee?.name || "another user"}). Only the assignee or manager can update it.`,
      });
      return;
    }

    const previousTasks = [...tasks];
    // Optimistic UI state update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              completedAt: newStatus === "DONE" ? new Date().toISOString() : null,
            }
          : t
      )
    );

    try {
      const res = await api.updateTask(taskId, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
      onShowNotice({
        type: "success",
        message: `Task moved to "${COLUMNS.find((c) => c.id === newStatus)?.label}"`,
      });
    } catch (err) {
      // Rollback on rejection (HTTP 403 Forbidden / 400 Bad Request)
      setTasks(previousTasks);
      onShowNotice({
        type: "error",
        message: err.message || "Failed to update task status",
      });
    }
  }

  // Native Drag and Drop Event Handlers (TASK-204)
  function handleCardDragStart(e, task) {
    if (!canEditTask(task)) {
      e.preventDefault();
      return;
    }
    setDraggingTaskId(task.id);
    e.dataTransfer.setData("text/plain", String(task.id));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleCardDragEnd() {
    setDraggingTaskId(null);
    setDragOverColumn(null);
  }

  function handleColumnDragOver(e, colId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  }

  function handleColumnDragLeave(e, colId) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverColumn === colId) {
      setDragOverColumn(null);
    }
  }

  function handleColumnDrop(e, targetColId) {
    e.preventDefault();
    setDragOverColumn(null);
    const taskIdStr = e.dataTransfer.getData("text/plain") || (draggingTaskId ? String(draggingTaskId) : null);
    setDraggingTaskId(null);
    if (!taskIdStr) return;
    const taskId = Number(taskIdStr);
    handleStatusChange(taskId, targetColId);
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

  // Slide-Over Task Detail Drawer Handlers (TASK-204)
  async function handleDrawerSave(taskId, payload) {
    const res = await api.updateTask(taskId, payload);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
    setEditingTask(null);
    onShowNotice({ type: "success", message: "Task details updated successfully" });
  }

  async function handleDrawerDelete(taskId) {
    await api.deleteTask(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setEditingTask(null);
    onShowNotice({ type: "success", message: "Task deleted successfully" });
  }

  // Multi-parameter filter engine (TASK-206)
  const filteredTasks = tasks.filter((t) => {
    // 1. Search term
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const titleMatch = (t.title || "").toLowerCase().includes(q);
      const descMatch = (t.description || "").toLowerCase().includes(q);
      const keyBadge = `${t.project?.key || "PROJ"}-${t.id}`.toLowerCase();
      const keyMatch = keyBadge.includes(q) || String(t.id) === q;
      if (!titleMatch && !descMatch && !keyMatch) return false;
    }

    // 2. Project filter
    if (filterProject !== "ALL" && String(t.projectId) !== String(filterProject)) {
      return false;
    }

    // 3. Assignee filter
    if (filterAssignee !== "ALL") {
      if (filterAssignee === "unassigned") {
        if (t.assigneeId) return false;
      } else if (String(t.assigneeId) !== String(filterAssignee)) {
        return false;
      }
    }

    // 4. Status filter
    if (filterStatus !== "ALL" && t.status !== filterStatus) {
      return false;
    }

    // 5. Priority filter
    if (filterPriority !== "ALL" && t.priority !== filterPriority) {
      return false;
    }

    return true;
  });

  // Pagination calculation for List and Table representations (TASK-206)
  const totalTasks = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalTasks / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const paginatedTasks = filteredTasks.slice(startIndex, startIndex + pageSize);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    filterProject !== "ALL" ||
    filterAssignee !== "ALL" ||
    filterStatus !== "ALL" ||
    filterPriority !== "ALL";

  if (loading) {
    return (
      <div className="view-loading-container">
        <div className="loading-spinner" />
        <span>Loading tasks…</span>
      </div>
    );
  }

  return (
    <div className="kanban-view-container">
      {/* Subheader */}
      <div className="kanban-view-header">
        <div className="kanban-header-left">
          <h2>Task Board & Views</h2>
          <p>Search, filter, sort, and manage team deliverables across Board, List, and Table views.</p>
        </div>

        <div className="kanban-header-controls">
          {/* Real-time State Synchronization Badge (TASK-503 / UD-003) */}
          <div
            className={`live-sync-indicator ${syncStatus}`}
            title={`Real-Time SSE Sync: ${syncStatus}`}
            data-testid="live-sync-indicator"
          >
            <span className="live-sync-dot" />
            <span className="live-sync-label">
              {syncStatus === "connected"
                ? "Live Sync Active"
                : syncStatus === "reconnecting"
                ? "Reconnecting..."
                : "Sync Offline"}
            </span>
          </div>

          {/* Multi-View Mode Tabs (TASK-205) */}
          <div className="view-mode-tabs" role="tablist" aria-label="Task View Modes">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "board"}
              className={`view-tab-btn ${viewMode === "board" ? "active" : ""}`}
              onClick={() => setViewMode("board")}
              data-testid="view-tab-board"
              title="Kanban Board view with drag-and-drop"
            >
              <Kanban size={15} />
              <span>Board</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "list"}
              className={`view-tab-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
              data-testid="view-tab-list"
              title="Collapsible accordion list view grouped by status"
            >
              <List size={15} />
              <span>List</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "table"}
              className={`view-tab-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              data-testid="view-tab-table"
              title="Dense spreadsheet table view with sortable columns"
            >
              <Table size={15} />
              <span>Table</span>
            </button>
          </div>

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

      {error && (
        <div className="view-error-container" role="alert">
          <AlertCircle size={20} className="text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {/* Search, Filter & Pagination Toolbar (TASK-206) */}
      <div className="tasks-filter-toolbar" data-testid="tasks-filter-toolbar">
        {/* Search Box */}
        <div className="tasks-search-box">
          <Search size={15} className="search-icon-muted" />
          <input
            type="text"
            className="tasks-search-input"
            placeholder="Search by title, description or JIRA key..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="tasks-search-input"
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchTerm("")}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="tasks-dropdown-filters">
          {/* Project Filter */}
          <div className="filter-dropdown-group">
            <Layers size={13} className="filter-icon" />
            <select
              className="toolbar-select"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              data-testid="filter-project-select"
              title="Filter by project container"
            >
              <option value="ALL">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key ? `[${p.key}] ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee Filter */}
          <div className="filter-dropdown-group">
            <User size={13} className="filter-icon" />
            <select
              className="toolbar-select"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              data-testid="filter-assignee-select"
              title="Filter by assigned member"
            >
              <option value="ALL">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.name || `User #${m.userId}`}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="filter-dropdown-group">
            <select
              className="toolbar-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              data-testid="filter-status-select"
              title="Filter by task status"
            >
              <option value="ALL">All Statuses</option>
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="REVISION">Revision</option>
              <option value="DONE">Done</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="filter-dropdown-group">
            <select
              className="toolbar-select"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              data-testid="filter-priority-select"
              title="Filter by priority level"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => {
                setSearchTerm("");
                setFilterProject("ALL");
                setFilterAssignee("ALL");
                setFilterStatus("ALL");
                setFilterPriority("ALL");
              }}
              data-testid="btn-reset-filters"
              title="Reset all active search and filters"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* View 1: Kanban Board with Native Drag-and-Drop (TASK-204) */}
      {viewMode === "board" && (
        <div className="kanban-columns-grid">
          {COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.id);
            const isOver = dragOverColumn === col.id;
            return (
              <div
                key={col.id}
                className={`kanban-column ${isOver ? "drag-over-column" : ""}`}
                onDragOver={(e) => handleColumnDragOver(e, col.id)}
                onDragLeave={(e) => handleColumnDragLeave(e, col.id)}
                onDrop={(e) => handleColumnDrop(e, col.id)}
                data-testid={`kanban-column-${col.id.toLowerCase()}`}
              >
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

                <div className="kanban-column-cards column-drop-zone">
                  {colTasks.map((task) => {
                    const editable = canEditTask(task);
                    const isDragging = draggingTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        className={`kanban-card ${editable ? "draggable-card" : "card-non-draggable"} ${isDragging ? "is-dragging" : ""} ${!editable ? "card-abac-restricted" : ""}`}
                        draggable={editable}
                        onDragStart={(e) => handleCardDragStart(e, task)}
                        onDragEnd={handleCardDragEnd}
                        onClick={() => openTaskDetail(task)}
                        tabIndex={0}
                        role="button"
                        data-testid={`kanban-card-${task.id}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openTaskDetail(task);
                          }
                        }}
                        title={editable ? "Drag to reorder status or click to view details" : "ABAC Restricted: Click to view details"}
                      >
                        <div className="kanban-card-top">
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              className="task-jira-key-badge"
                              style={{
                                fontSize: "11px",
                                fontWeight: "700",
                                color: "#64748b",
                                background: "rgba(100, 116, 139, 0.12)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {(task.project?.key || "PROJ")}-{task.id}
                            </span>
                            <span className={`tag-priority tag-${task.priority.toLowerCase()}`}>
                              {task.priority}
                            </span>
                            {task.project?.isArchived && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: "700",
                                  color: "#f59e0b",
                                  background: "rgba(245, 158, 11, 0.15)",
                                  padding: "2px 5px",
                                  borderRadius: "4px",
                                }}
                                title="Project is archived and read-only"
                              >
                                ARCHIVED
                              </span>
                            )}
                          </div>
                          <div className="card-top-actions">
                            {!editable && (
                              <span
                                className="abac-lock-badge"
                                title={
                                  task.project?.isArchived
                                    ? "Project is archived and read-only"
                                    : `ABAC Restricted: Assigned to ${task.assignee?.name || "another member"}. You cannot edit this task.`
                                }
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
                                title="View or edit task details"
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
                            <DueDateBadge dueDate={task.dueDate} status={task.status} compact />
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
                            <span className="counter-item" title="Associated project">
                              <Layers size={12} /> {task.project?.name || "Project"}
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
      )}

      {/* View 2: Collapsible Accordion List View (TASK-205) */}
      {viewMode === "list" && (
        <TaskListView
          tasks={paginatedTasks}
          projects={projects}
          members={members}
          user={user}
          canEditTask={canEditTask}
          canCreateTask={canCreateTask}
          canDeleteTask={canDeleteTask}
          onOpenDetail={openTaskDetail}
          onStatusChange={handleStatusChange}
          onDeleteTask={handleDrawerDelete}
          onCreateTaskInStatus={() => {
            setCreateModalOpen(true);
          }}
        />
      )}

      {/* View 3: Dense Spreadsheet Table View (TASK-205) */}
      {viewMode === "table" && (
        <TaskTableView
          tasks={paginatedTasks}
          projects={projects}
          members={members}
          user={user}
          canEditTask={canEditTask}
          canDeleteTask={canDeleteTask}
          onOpenDetail={openTaskDetail}
          onStatusChange={handleStatusChange}
          onDeleteTask={handleDrawerDelete}
        />
      )}

      {/* Pagination Bar (TASK-206) for List and Table Views */}
      {(viewMode === "list" || viewMode === "table") && totalTasks > 0 && (
        <div className="tasks-pagination-bar" data-testid="tasks-pagination-bar">
          <div className="pagination-info">
            <span>
              Showing {startIndex + 1}–{Math.min(startIndex + pageSize, totalTasks)} of {totalTasks} {totalTasks === 1 ? "task" : "tasks"}
            </span>
          </div>

          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn"
              disabled={validPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              data-testid="pagination-prev"
            >
              Previous
            </button>

            <span className="pagination-page-indicator">
              Page {validPage} of {totalPages}
            </span>

            <button
              type="button"
              className="pagination-btn"
              disabled={validPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              data-testid="pagination-next"
            >
              Next
            </button>

            <div className="page-size-selector">
              <label>Per page:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                data-testid="pagination-page-size"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Task Detail Drawer (TASK-204) */}
      {editingTask && (
        <TaskDetailDrawer
          task={editingTask}
          projects={projects}
          members={members}
          currentUser={user}
          userPermissions={userPermissions}
          userRoles={user?.roles || []}
          canEdit={canEditTask(editingTask)}
          canAssign={canAssign}
          canManageProjects={canManageProjects}
          canDelete={canDeleteTask}
          onClose={() => setEditingTask(null)}
          onSave={handleDrawerSave}
          onDelete={handleDrawerDelete}
          onSubtasksChange={handleSubtasksChange}
          onCommentsCountChange={(count) => handleCommentsCountChange(editingTask.id, count)}
        />
      )}

      {/* Quick Add Task Modal */}
      {createModalOpen && (
        <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)} role="presentation">
          <div
            ref={createTaskModalRef}
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="create-task-heading">Create New Task</h3>
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={() => setCreateModalOpen(false)}
                aria-label="Close task creation dialog"
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
                    <option key={p.id} value={p.id} disabled={p.isArchived}>
                      {p.key ? `[${p.key}] ` : ""}{p.name}{p.isArchived ? " (Archived - Cannot Add Tasks)" : ""}
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
                  <option value="URGENT">Urgent</option>
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
