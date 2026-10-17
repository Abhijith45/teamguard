import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Filter,
  Plus,
  RefreshCw,
  Search,
  User,
  Folder,
  Layers,
  X,
  Flame,
  Check,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import {
  WEEKDAYS,
  MONTH_NAMES,
  getCalendarGrid,
  mapTasksToCalendarDays,
  getAdjacentMonth,
  getTodayCoordinates,
  formatMonthYear,
  getCalendarMetrics,
  filterCalendarTasks,
  normalizeDateKey,
} from "./calendarUtils.js";
import { TaskDetailDrawer } from "../tasks/TaskDetailDrawer.jsx";

export function CalendarView({
  user,
  activeOrg,
  userPermissions = [],
  projects = [],
  onShowNotice,
  onNavigateTasks,
}) {
  const todayCoords = useMemo(() => getTodayCoordinates(), []);

  // Active view date state
  const [currentYear, setCurrentYear] = useState(todayCoords.year);
  const [currentMonth, setCurrentMonth] = useState(todayCoords.month);

  // Data state
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  // Task Detail Drawer state
  const [selectedTask, setSelectedTask] = useState(null);

  // Day overflow modal state (for "+N more" tasks)
  const [expandedDay, setExpandedDay] = useState(null);

  // Quick Create Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDueDate, setCreateDueDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newProjectId, setNewProjectId] = useState(projects[0]?.id ? String(projects[0].id) : "");
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const hasPerm = useCallback(
    (p) => {
      if (!userPermissions) return false;
      if (userPermissions instanceof Set) {
        return userPermissions.has(p) || userPermissions.has("*");
      }
      if (Array.isArray(userPermissions)) {
        return userPermissions.includes(p) || userPermissions.includes("*");
      }
      if (Array.isArray(user?.permissions)) {
        return user.permissions.some(
          (item) => (typeof item === "string" ? item === p : `${item.resource}:${item.action}` === p)
        );
      }
      return false;
    },
    [userPermissions, user]
  );

  const canCreateTask = hasPerm("task:create");
  const canEditTask =
    hasPerm("task:update:any") ||
    hasPerm("task:update:own") ||
    hasPerm("task:update:assigned");
  const canDeleteTask = hasPerm("task:delete");

  // Fetch tasks and members for active organization
  const loadData = useCallback(async () => {
    if (!activeOrg?.id) return;
    try {
      setLoading(true);
      setError(null);
      const [tasksRes, membersRes] = await Promise.all([
        api.getTasks({ limit: 100 }),
        api.getMembers().catch(() => ({ members: [] })),
      ]);
      setTasks(tasksRes.tasks || []);
      setMembers(membersRes.members || []);
    } catch (err) {
      console.error("Failed to load calendar data:", err);
      setError(err.message || "Failed to load workspace releases");
    } finally {
      setLoading(false);
    }
  }, [activeOrg?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Synchronize with external task changes
  useEffect(() => {
    function handleTaskUpdated() {
      loadData();
    }
    window.addEventListener("teamguard:task-updated", handleTaskUpdated);
    window.addEventListener("teamguard:workspace-purged", handleTaskUpdated);
    return () => {
      window.removeEventListener("teamguard:task-updated", handleTaskUpdated);
      window.removeEventListener("teamguard:workspace-purged", handleTaskUpdated);
    };
  }, [loadData]);

  // Month navigation handlers
  function handlePrevMonth() {
    const adj = getAdjacentMonth(currentYear, currentMonth, "prev");
    setCurrentYear(adj.year);
    setCurrentMonth(adj.month);
  }

  function handleNextMonth() {
    const adj = getAdjacentMonth(currentYear, currentMonth, "next");
    setCurrentYear(adj.year);
    setCurrentMonth(adj.month);
  }

  function handleResetToday() {
    const coords = getTodayCoordinates();
    setCurrentYear(coords.year);
    setCurrentMonth(coords.month);
  }

  // Filter tasks client-side
  const filteredTasks = useMemo(() => {
    return filterCalendarTasks(tasks, {
      projectId: selectedProjectId,
      statusFilter,
      priorityFilter,
      assigneeId: myTasksOnly ? "me" : "all",
      currentUserId: user?.id,
    });
  }, [tasks, selectedProjectId, statusFilter, priorityFilter, myTasksOnly, user?.id]);

  // Generate 7-column calendar grid
  const calendarGrid = useMemo(() => {
    const rawGrid = getCalendarGrid(currentYear, currentMonth);
    return mapTasksToCalendarDays(filteredTasks, rawGrid);
  }, [currentYear, currentMonth, filteredTasks]);

  // Summary Metrics
  const metrics = useMemo(() => {
    return getCalendarMetrics(filteredTasks, currentYear, currentMonth);
  }, [filteredTasks, currentYear, currentMonth]);

  // Quick Task Create Submit Handler
  async function handleQuickCreate(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newProjectId) return;

    try {
      setSubmittingCreate(true);
      const res = await api.createTask({
        projectId: Number(newProjectId),
        title: newTitle.trim(),
        description: newDesc.trim(),
        priority: newPriority,
        dueDate: createDueDate ? new Date(`${createDueDate}T12:00:00Z`).toISOString() : null,
      });

      if (onShowNotice) {
        onShowNotice({ type: "success", message: `Scheduled task "${res.task?.title}"` });
      }

      setCreateModalOpen(false);
      setNewTitle("");
      setNewDesc("");
      setCreateDueDate("");
      await loadData();
    } catch (err) {
      if (onShowNotice) {
        onShowNotice({ type: "error", message: `Failed to create task: ${err.message}` });
      }
    } finally {
      setSubmittingCreate(false);
    }
  }

  // Handle task update from drawer
  async function handleSaveTask(updatedFields) {
    if (!selectedTask) return;
    try {
      const res = await api.updateTask(selectedTask.id, updatedFields);
      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? res.task : t)));
      setSelectedTask(res.task);
      if (onShowNotice) {
        onShowNotice({ type: "success", message: "Task release date updated" });
      }
    } catch (err) {
      if (onShowNotice) {
        onShowNotice({ type: "error", message: `Update failed: ${err.message}` });
      }
      throw err;
    }
  }

  // Handle task delete from drawer
  async function handleDeleteTask(taskId) {
    try {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTask(null);
      if (onShowNotice) {
        onShowNotice({ type: "success", message: "Task removed from schedule" });
      }
    } catch (err) {
      if (onShowNotice) {
        onShowNotice({ type: "error", message: `Delete failed: ${err.message}` });
      }
      throw err;
    }
  }

  return (
    <div className="calendar-view-container">
      {/* Calendar Header Navigation & Summary Toolbar */}
      <header className="calendar-header-toolbar">
        <div className="calendar-title-nav">
          <div className="calendar-month-controls">
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={handlePrevMonth}
              title="Previous Month"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>

            <h2 className="calendar-month-heading">
              {formatMonthYear(currentYear, currentMonth)}
            </h2>

            <button
              type="button"
              className="calendar-nav-btn"
              onClick={handleNextMonth}
              title="Next Month"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>

            {/* Quick Today Reset Button (US-CAL-002) */}
            <button
              type="button"
              className={`calendar-today-btn ${
                currentYear === todayCoords.year && currentMonth === todayCoords.month ? "active" : ""
              }`}
              onClick={handleResetToday}
              title="Jump to current month"
            >
              Today
            </button>
          </div>

          <div className="calendar-month-dropdowns">
            <select
              className="calendar-select-ctrl"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
              aria-label="Select month"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
            <select
              className="calendar-select-ctrl"
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              aria-label="Select year"
            >
              {[-2, -1, 0, 1, 2, 3].map((offset) => {
                const y = todayCoords.year + offset;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="calendar-actions-row">
          {/* Project Filter */}
          <div className="calendar-filter-group">
            <Folder size={14} className="filter-icon" />
            <select
              className="calendar-filter-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Filter by project"
            >
              <option value="all">All Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key ? `[${p.key}] ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="calendar-filter-group">
            <CheckCircle2 size={14} className="filter-icon" />
            <select
              className="calendar-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="done">Completed Only</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="calendar-filter-group">
            <AlertTriangle size={14} className="filter-icon" />
            <select
              className="calendar-filter-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter by priority"
            >
              <option value="all">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* My Tasks Toggle */}
          <button
            type="button"
            className={`calendar-toggle-btn ${myTasksOnly ? "active" : ""}`}
            onClick={() => setMyTasksOnly(!myTasksOnly)}
            title="Toggle only tasks assigned to me"
          >
            <User size={13} />
            <span>My Tasks</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            className="calendar-icon-btn"
            onClick={loadData}
            title="Refresh releases"
            aria-label="Refresh releases"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-emerald" : ""} />
          </button>

          {/* Add Task Button */}
          {canCreateTask && (
            <button
              type="button"
              className="calendar-add-task-btn"
              onClick={() => {
                setCreateDueDate(todayCoords.dateString);
                setCreateModalOpen(true);
              }}
            >
              <Plus size={15} />
              <span>Schedule Task</span>
            </button>
          )}
        </div>
      </header>

      {/* Monthly KPI Metrics Banner */}
      <div className="calendar-kpi-bar">
        <div className="calendar-kpi-card">
          <CalendarIcon size={16} className="text-emerald" />
          <div className="calendar-kpi-content">
            <span className="calendar-kpi-value">{metrics.totalScheduled}</span>
            <span className="calendar-kpi-label">Scheduled This Month</span>
          </div>
        </div>

        <div className="calendar-kpi-card">
          <Clock size={16} className="text-blue" />
          <div className="calendar-kpi-content">
            <span className="calendar-kpi-value">{metrics.inProgress}</span>
            <span className="calendar-kpi-label">In Progress</span>
          </div>
        </div>

        <div className="calendar-kpi-card">
          <CheckCircle2 size={16} className="text-green" />
          <div className="calendar-kpi-content">
            <span className="calendar-kpi-value">{metrics.completed}</span>
            <span className="calendar-kpi-label">Completed</span>
          </div>
        </div>

        <div className={`calendar-kpi-card ${metrics.overdue > 0 ? "kpi-alert-overdue" : ""}`}>
          <AlertTriangle size={16} className={metrics.overdue > 0 ? "text-destructive" : "text-amber"} />
          <div className="calendar-kpi-content">
            <span className="calendar-kpi-value">{metrics.overdue}</span>
            <span className="calendar-kpi-label">Overdue Releases</span>
          </div>
        </div>

        <div className="calendar-kpi-card">
          <Flame size={16} className="text-amber" />
          <div className="calendar-kpi-content">
            <span className="calendar-kpi-value">{metrics.urgentCount}</span>
            <span className="calendar-kpi-label">High / Urgent</span>
          </div>
        </div>
      </div>

      {/* Main 7-Column Calendar Grid (US-CAL-001) */}
      <div className="calendar-grid-card">
        {/* 7-Column Day-of-Week Headers */}
        <div className="calendar-weekdays-row" role="row">
          {WEEKDAYS.map((day, idx) => {
            const isWeekend = idx === 5 || idx === 6;
            return (
              <div
                key={day}
                className={`calendar-weekday-col ${isWeekend ? "weekend" : ""}`}
                role="columnheader"
              >
                <span>{day}</span>
              </div>
            );
          })}
        </div>

        {/* Month Day Cells Grid */}
        <div className="calendar-days-grid" role="grid">
          {calendarGrid.map((cell) => {
            const visibleTasks = cell.tasks.slice(0, 3);
            const hiddenCount = cell.tasks.length - visibleTasks.length;

            return (
              <div
                key={cell.dateString}
                className={`calendar-day-cell ${!cell.isCurrentMonth ? "other-month" : ""} ${
                  cell.isToday ? "is-today" : ""
                } ${cell.isWeekend ? "is-weekend" : ""}`}
                role="gridcell"
                aria-label={`${cell.dateString}, ${cell.tasks.length} tasks`}
              >
                {/* Cell Header: Day Number & Add Quick Button */}
                <div className="calendar-cell-header">
                  <span className={`calendar-day-number ${cell.isToday ? "today-badge" : ""}`}>
                    {cell.day}
                  </span>

                  {cell.hasTasks && (
                    <span className="calendar-cell-task-counter" title={`${cell.taskCount} tasks`}>
                      {cell.taskCount}
                    </span>
                  )}

                  {canCreateTask && (
                    <button
                      type="button"
                      className="calendar-cell-quick-add"
                      onClick={() => {
                        setCreateDueDate(cell.dateString);
                        setCreateModalOpen(true);
                      }}
                      title={`Schedule task on ${cell.dateString}`}
                      aria-label={`Schedule task on ${cell.dateString}`}
                    >
                      <Plus size={11} />
                    </button>
                  )}
                </div>

                {/* Task Items Container */}
                <div className="calendar-cell-tasks-list">
                  {visibleTasks.map((t) => {
                    const isDone = t.status === "DONE";
                    const projectKey = t.project?.key ? `[${t.project.key}] ` : "";

                    return (
                      <div
                        key={t.id}
                        className={`calendar-task-pill priority-${(t.priority || "medium").toLowerCase()} ${
                          isDone ? "task-done" : ""
                        }`}
                        onClick={() => setSelectedTask(t)}
                        title={`${t.title} (${t.priority} • ${t.status})`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedTask(t);
                          }
                        }}
                      >
                        <span className={`task-priority-dot dot-${(t.priority || "medium").toLowerCase()}`} />
                        {isDone && <Check size={11} className="task-done-check" />}
                        <span className="calendar-task-pill-title">
                          <strong className="pill-project-key">{projectKey}</strong>
                          {t.title}
                        </span>
                        {t.assignee?.avatarUrl && (
                          <img
                            src={t.assignee.avatarUrl}
                            alt={t.assignee.name}
                            className="calendar-pill-avatar"
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Overflow "+N more" badge */}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="calendar-more-tasks-btn"
                      onClick={() => setExpandedDay(cell)}
                      title={`View all ${cell.tasks.length} tasks for this date`}
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Priority & Status Color Legend */}
      <footer className="calendar-legend-bar">
        <div className="calendar-legend-group">
          <span className="legend-label">Priorities:</span>
          <span className="legend-item">
            <span className="legend-dot priority-urgent-dot" /> Urgent
          </span>
          <span className="legend-item">
            <span className="legend-dot priority-high-dot" /> High
          </span>
          <span className="legend-item">
            <span className="legend-dot priority-medium-dot" /> Medium
          </span>
          <span className="legend-item">
            <span className="legend-dot priority-low-dot" /> Low
          </span>
        </div>

        <div className="calendar-legend-group">
          <span className="legend-label">Status:</span>
          <span className="legend-item">
            <span className="legend-dot status-done-dot" /> Completed
          </span>
          <span className="legend-item">
            <span className="legend-dot status-active-dot" /> In Progress / To Do
          </span>
        </div>
      </footer>

      {/* Expanded Day Tasks Modal (when clicking "+N more") */}
      {expandedDay && (
        <div className="member-modal-backdrop" onClick={() => setExpandedDay(null)}>
          <div className="member-dialog calendar-day-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="member-dialog-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CalendarIcon size={18} className="text-emerald" />
                <h3>Releases for {expandedDay.dateString}</h3>
              </div>
              <button
                type="button"
                className="member-modal-close"
                onClick={() => setExpandedDay(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="member-dialog-body" style={{ maxHeight: "360px", overflowY: "auto" }}>
              <div className="calendar-dialog-tasks-list">
                {expandedDay.tasks.map((t) => {
                  const isDone = t.status === "DONE";
                  return (
                    <div
                      key={t.id}
                      className="calendar-dialog-task-row"
                      onClick={() => {
                        setExpandedDay(null);
                        setSelectedTask(t);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <span className={`task-priority-dot dot-${(t.priority || "medium").toLowerCase()}`} />
                      <div className="calendar-dialog-task-info">
                        <strong className={isDone ? "line-through text-muted" : ""}>{t.title}</strong>
                        <small>
                          {t.project?.name || "Project"} • {t.status} • {t.priority}
                        </small>
                      </div>
                      <span className={`status-badge status-${t.status.toLowerCase()}`}>{t.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="member-dialog-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setExpandedDay(null)}
              >
                Close
              </button>
              {canCreateTask && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setCreateDueDate(expandedDay.dateString);
                    setExpandedDay(null);
                    setCreateModalOpen(true);
                  }}
                >
                  <Plus size={14} /> Schedule Another
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Task Creation Modal */}
      {createModalOpen && (
        <div className="member-modal-backdrop" onClick={() => !submittingCreate && setCreateModalOpen(false)}>
          <div className="member-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="member-dialog-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CalendarIcon size={18} className="text-emerald" />
                <h3>Schedule Release Task</h3>
              </div>
              <button
                type="button"
                className="member-modal-close"
                onClick={() => setCreateModalOpen(false)}
                disabled={submittingCreate}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleQuickCreate}>
              <div className="member-dialog-body">
                <div style={{ marginBottom: "14px" }}>
                  <label className="dialog-field-label">Project *</label>
                  <select
                    className="dialog-select"
                    value={newProjectId}
                    onChange={(e) => setNewProjectId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.key ? `[${p.key}] ` : ""}{p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label className="dialog-field-label">Task Title *</label>
                  <input
                    type="text"
                    className="dialog-input"
                    placeholder="e.g. Production Deployment V2"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    minLength={2}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label className="dialog-field-label">Scheduled Due Date *</label>
                  <input
                    type="date"
                    className="dialog-input"
                    value={createDueDate}
                    onChange={(e) => setCreateDueDate(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label className="dialog-field-label">Priority</label>
                  <select
                    className="dialog-select"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label className="dialog-field-label">Description (optional)</label>
                  <textarea
                    className="dialog-textarea"
                    rows={3}
                    placeholder="Notes or release checklist items…"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className="member-dialog-actions">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={submittingCreate}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submittingCreate || !newTitle.trim() || !newProjectId}
                >
                  {submittingCreate ? "Scheduling…" : "Save to Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Slide-Over Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          projects={projects}
          members={members}
          currentUser={user}
          userPermissions={userPermissions}
          canEdit={canEditTask}
          canAssign={canEditTask}
          canDelete={canDeleteTask}
          onClose={() => setSelectedTask(null)}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
