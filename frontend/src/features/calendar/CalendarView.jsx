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
  CalendarDays,
  Columns,
  List,
  Inbox,
  MoveRight,
  GripVertical,
  ArrowRight,
  Lock,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import {
  WEEKDAYS,
  WEEKDAYS_FULL,
  MONTH_NAMES,
  getCalendarGrid,
  mapTasksToCalendarDays,
  getAdjacentMonth,
  getTodayCoordinates,
  formatMonthYear,
  getCalendarMetrics,
  filterCalendarTasks,
  normalizeDateKey,
  getWeekDays,
  getAdjacentWeek,
  getAdjacentDay,
  formatWeekRange,
  formatDayDate,
  getUnscheduledTasks,
  groupTasksForAgenda,
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

  // View mode: 'month' | 'week' | 'day' | 'agenda'
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("teamguard:calendar-view-mode") || "month";
    } catch {
      return "month";
    }
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("teamguard:calendar-view-mode", mode);
    } catch {
      // Ignore storage errors
    }
  };

  // Active view date state
  const [currentYear, setCurrentYear] = useState(todayCoords.year);
  const [currentMonth, setCurrentMonth] = useState(todayCoords.month);
  const [currentRefDate, setCurrentRefDate] = useState(() => new Date());

  // Data state
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters (archived projects filtered out)
  const activeProjects = useMemo(() => (projects || []).filter((p) => !p.isArchived), [projects]);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // Task Detail Drawer state
  const [selectedTask, setSelectedTask] = useState(null);

  // Day overflow modal state (for "+N more" tasks in month view)
  const [expandedDay, setExpandedDay] = useState(null);

  // Quick Create Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDueDate, setCreateDueDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newProjectId, setNewProjectId] = useState(activeProjects[0]?.id ? String(activeProjects[0].id) : "");
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Unscheduled tasks tray state
  const [showUnscheduledTray, setShowUnscheduledTray] = useState(false);
  const [unscheduledSearch, setUnscheduledSearch] = useState("");

  // Drag and drop rescheduling state
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);

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

  // Navigation handlers
  function handlePrev() {
    if (viewMode === "month") {
      const adj = getAdjacentMonth(currentYear, currentMonth, "prev");
      setCurrentYear(adj.year);
      setCurrentMonth(adj.month);
      const newRef = new Date(currentRefDate);
      newRef.setMonth(newRef.getMonth() - 1);
      setCurrentRefDate(newRef);
    } else if (viewMode === "week") {
      const newRef = getAdjacentWeek(currentRefDate, "prev");
      setCurrentRefDate(newRef);
      setCurrentYear(newRef.getFullYear());
      setCurrentMonth(newRef.getMonth());
    } else if (viewMode === "day") {
      const newRef = getAdjacentDay(currentRefDate, "prev");
      setCurrentRefDate(newRef);
      setCurrentYear(newRef.getFullYear());
      setCurrentMonth(newRef.getMonth());
    } else {
      const newRef = getAdjacentMonth(currentYear, currentMonth, "prev");
      setCurrentYear(newRef.year);
      setCurrentMonth(newRef.month);
    }
  }

  function handleNext() {
    if (viewMode === "month") {
      const adj = getAdjacentMonth(currentYear, currentMonth, "next");
      setCurrentYear(adj.year);
      setCurrentMonth(adj.month);
      const newRef = new Date(currentRefDate);
      newRef.setMonth(newRef.getMonth() + 1);
      setCurrentRefDate(newRef);
    } else if (viewMode === "week") {
      const newRef = getAdjacentWeek(currentRefDate, "next");
      setCurrentRefDate(newRef);
      setCurrentYear(newRef.getFullYear());
      setCurrentMonth(newRef.getMonth());
    } else if (viewMode === "day") {
      const newRef = getAdjacentDay(currentRefDate, "next");
      setCurrentRefDate(newRef);
      setCurrentYear(newRef.getFullYear());
      setCurrentMonth(newRef.getMonth());
    } else {
      const newRef = getAdjacentMonth(currentYear, currentMonth, "next");
      setCurrentYear(newRef.year);
      setCurrentMonth(newRef.month);
    }
  }

  function handleResetToday() {
    const coords = getTodayCoordinates();
    setCurrentYear(coords.year);
    setCurrentMonth(coords.month);
    setCurrentRefDate(new Date());
  }

  // Filter tasks client-side
  const filteredTasks = useMemo(() => {
    let list = filterCalendarTasks(tasks, {
      projectId: selectedProjectId,
      statusFilter,
      priorityFilter,
      assigneeId: myTasksOnly ? "me" : "all",
      currentUserId: user?.id,
    });

    if (showOverdueOnly) {
      const todayKey = todayCoords.dateString;
      list = list.filter((t) => {
        if (!t.dueDate || t.status === "DONE") return false;
        const dKey = normalizeDateKey(t.dueDate);
        return dKey && dKey < todayKey;
      });
    }

    return list;
  }, [tasks, selectedProjectId, statusFilter, priorityFilter, myTasksOnly, showOverdueOnly, user?.id, todayCoords.dateString]);

  // Generate 7-column calendar grid for Month View
  const calendarGrid = useMemo(() => {
    const rawGrid = getCalendarGrid(currentYear, currentMonth);
    return mapTasksToCalendarDays(filteredTasks, rawGrid);
  }, [currentYear, currentMonth, filteredTasks]);

  // Generate 7-day week matrix for Week View
  const weekDays = useMemo(() => {
    const days = getWeekDays(currentRefDate);
    const taskMap = new Map();
    for (const t of filteredTasks) {
      if (!t.dueDate) continue;
      const key = normalizeDateKey(t.dueDate);
      if (!key) continue;
      if (!taskMap.has(key)) taskMap.set(key, []);
      taskMap.get(key).push(t);
    }
    return days.map((d) => ({
      ...d,
      tasks: taskMap.get(d.dateString) || [],
    }));
  }, [currentRefDate, filteredTasks]);

  // Day view tasks
  const selectedDayKey = useMemo(() => normalizeDateKey(currentRefDate), [currentRefDate]);
  const dayViewTasks = useMemo(() => {
    return filteredTasks.filter((t) => t.dueDate && normalizeDateKey(t.dueDate) === selectedDayKey);
  }, [filteredTasks, selectedDayKey]);

  // Agenda view groups
  const agendaGroups = useMemo(() => {
    return groupTasksForAgenda(filteredTasks, todayCoords.dateString);
  }, [filteredTasks, todayCoords.dateString]);

  // Unscheduled tasks
  const unscheduledTasks = useMemo(() => {
    const allUnscheduled = getUnscheduledTasks(tasks);
    let list = allUnscheduled;
    if (selectedProjectId !== "all") {
      list = list.filter((t) => Number(t.projectId) === Number(selectedProjectId));
    }
    if (unscheduledSearch.trim()) {
      const q = unscheduledSearch.toLowerCase();
      list = list.filter((t) => (t.title || "").toLowerCase().includes(q));
    }
    return list;
  }, [tasks, selectedProjectId, unscheduledSearch]);

  // Summary Metrics for Monthly / Workspace
  const metrics = useMemo(() => {
    return getCalendarMetrics(filteredTasks, currentYear, currentMonth);
  }, [filteredTasks, currentYear, currentMonth]);

  // Derived state for Day Tasks List modal
  const expandedDateString = useMemo(() => {
    if (!expandedDay) return null;
    return typeof expandedDay === "string" ? expandedDay : expandedDay.dateString;
  }, [expandedDay]);

  const expandedDayTasks = useMemo(() => {
    if (!expandedDateString) return [];
    return filteredTasks.filter(
      (t) => t.dueDate && normalizeDateKey(t.dueDate) === expandedDateString
    );
  }, [expandedDateString, filteredTasks]);

  const expandedIsPast = useMemo(() => {
    if (!expandedDateString) return false;
    return expandedDateString < todayCoords.dateString;
  }, [expandedDateString, todayCoords.dateString]);

  const formattedExpandedDate = useMemo(() => {
    if (!expandedDateString) return "";
    try {
      const parts = expandedDateString.split("-").map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return expandedDateString;
    }
  }, [expandedDateString]);

  // Drag and drop reschedule handler
  const handleDragStart = (e, task) => {
    if (!canEditTask) return;
    const taskDateKey = task.dueDate ? normalizeDateKey(task.dueDate) : null;
    if (taskDateKey && taskDateKey < todayCoords.dateString) {
      e.preventDefault();
      if (onShowNotice) {
        onShowNotice({
          type: "warning",
          message: "Tasks on past dates are immutable and cannot be moved.",
        });
      }
      return;
    }
    setDraggedTask(task);
    try {
      e.dataTransfer.setData("application/json", JSON.stringify({ taskId: task.id }));
      e.dataTransfer.effectAllowed = "move";
    } catch {
      // Fallback
    }
  };

  const handleDragOver = (e, dateString) => {
    if (!canEditTask) return;
    if (dateString < todayCoords.dateString) return; // Prevent drop highlight on past dates
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDate !== dateString) {
      setDragOverDate(dateString);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOverDate(null);
  };

  const handleDrop = async (e, targetDateString) => {
    e.preventDefault();
    setDragOverDate(null);
    if (!canEditTask) return;

    if (targetDateString < todayCoords.dateString) {
      if (onShowNotice) {
        onShowNotice({
          type: "warning",
          message: "Cannot reschedule tasks to past dates.",
        });
      }
      setDraggedTask(null);
      return;
    }

    let targetTask = draggedTask;
    if (!targetTask) {
      try {
        const data = JSON.parse(e.dataTransfer.getData("application/json"));
        if (data?.taskId) {
          targetTask = tasks.find((t) => t.id === data.taskId);
        }
      } catch {
        // Ignore
      }
    }

    if (!targetTask) return;

    const currentKey = targetTask.dueDate ? normalizeDateKey(targetTask.dueDate) : null;
    if (currentKey === targetDateString) {
      setDraggedTask(null);
      return;
    }

    const previousDueDate = targetTask.dueDate;
    const newDueDateIso = new Date(`${targetDateString}T12:00:00Z`).toISOString();

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === targetTask.id ? { ...t, dueDate: newDueDateIso } : t))
    );
    setDraggedTask(null);

    try {
      await api.updateTask(targetTask.id, { dueDate: newDueDateIso });
      if (onShowNotice) {
        onShowNotice({
          type: "success",
          message: `Rescheduled "${targetTask.title}" to ${targetDateString}`,
        });
      }
      window.dispatchEvent(new CustomEvent("teamguard:task-updated"));
    } catch (err) {
      // Rollback on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === targetTask.id ? { ...t, dueDate: previousDueDate } : t))
      );
      if (onShowNotice) {
        onShowNotice({
          type: "error",
          message: `Failed to reschedule task: ${err.message}`,
        });
      }
    }
  };

  // Quick Task Create Submit Handler
  async function handleQuickCreate(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newProjectId) return;

    if (createDueDate && createDueDate < todayCoords.dateString) {
      if (onShowNotice) {
        onShowNotice({ type: "warning", message: "Cannot create or schedule tasks on past dates." });
      }
      return;
    }

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
    const currentKey = selectedTask.dueDate ? normalizeDateKey(selectedTask.dueDate) : null;
    if (currentKey && currentKey < todayCoords.dateString) {
      if (onShowNotice) {
        onShowNotice({ type: "warning", message: "Tasks on past dates are immutable." });
      }
      return;
    }
    if (updatedFields.dueDate && normalizeDateKey(updatedFields.dueDate) < todayCoords.dateString) {
      if (onShowNotice) {
        onShowNotice({ type: "warning", message: "Cannot set due date to a past date." });
      }
      return;
    }
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

  // Header Title computation depending on view mode
  const headerDateLabel = useMemo(() => {
    if (viewMode === "month") {
      return formatMonthYear(currentYear, currentMonth);
    }
    if (viewMode === "week") {
      if (weekDays.length === 7) {
        return formatWeekRange(weekDays[0].date, weekDays[6].date);
      }
      return formatMonthYear(currentYear, currentMonth);
    }
    if (viewMode === "day") {
      return formatDayDate(currentRefDate);
    }
    return formatMonthYear(currentYear, currentMonth);
  }, [viewMode, currentYear, currentMonth, weekDays, currentRefDate]);

  return (
    <div className="calendar-view-container modern-calendar-system">
      {/* 1. Streamlined Calendar Header & Mode Switcher */}
      <header className="calendar-header-toolbar compact-header">
        {/* Left: Navigation and Date Heading */}
        <div className="calendar-title-nav">
          <div className="calendar-month-controls">
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={handlePrev}
              title="Previous period"
              aria-label="Previous period"
            >
              <ChevronLeft size={16} />
            </button>

            <h2 className="calendar-month-heading compact-heading">
              {headerDateLabel}
            </h2>

            <button
              type="button"
              className="calendar-nav-btn"
              onClick={handleNext}
              title="Next period"
              aria-label="Next period"
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              className="calendar-today-btn"
              onClick={handleResetToday}
              title="Jump to today"
            >
              Today
            </button>
          </div>

          {/* Center: View Switcher (Month / Week / Day / Agenda) */}
          <div className="calendar-view-switcher" role="tablist">
            <button
              type="button"
              className={`view-mode-pill ${viewMode === "month" ? "active" : ""}`}
              onClick={() => handleSetViewMode("month")}
              role="tab"
              aria-selected={viewMode === "month"}
            >
              <CalendarDays size={13} />
              <span>Month</span>
            </button>
            <button
              type="button"
              className={`view-mode-pill ${viewMode === "week" ? "active" : ""}`}
              onClick={() => handleSetViewMode("week")}
              role="tab"
              aria-selected={viewMode === "week"}
            >
              <Columns size={13} />
              <span>Week</span>
            </button>
            <button
              type="button"
              className={`view-mode-pill ${viewMode === "day" ? "active" : ""}`}
              onClick={() => handleSetViewMode("day")}
              role="tab"
              aria-selected={viewMode === "day"}
            >
              <Clock size={13} />
              <span>Day</span>
            </button>
            <button
              type="button"
              className={`view-mode-pill ${viewMode === "agenda" ? "active" : ""}`}
              onClick={() => handleSetViewMode("agenda")}
              role="tab"
              aria-selected={viewMode === "agenda"}
            >
              <List size={13} />
              <span>Agenda</span>
            </button>
          </div>
        </div>

        {/* Right: Actions, Filters, Unscheduled Tray, and Create Task */}
        <div className="calendar-actions-row">
          {/* Active Projects Filter */}
          <div className="calendar-filter-group">
            <Folder size={13} className="filter-icon" />
            <select
              className="calendar-filter-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Filter by project"
            >
              <option value="all">All Projects ({activeProjects.length})</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key ? `[${p.key}] ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="calendar-filter-group">
            <CheckCircle2 size={13} className="filter-icon" />
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
            <AlertTriangle size={13} className="filter-icon" />
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

          {/* Unscheduled Tasks Drawer Button (ClickUp / Jira Standard) */}
          <button
            type="button"
            className={`calendar-unscheduled-btn ${showUnscheduledTray ? "active" : ""}`}
            onClick={() => setShowUnscheduledTray(!showUnscheduledTray)}
            title="Toggle Unscheduled Deliverables Drawer"
          >
            <Inbox size={14} />
            <span>To Schedule</span>
            {unscheduledTasks.length > 0 && (
              <span className="unscheduled-badge-count">{unscheduledTasks.length}</span>
            )}
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            className="calendar-icon-btn"
            onClick={loadData}
            title="Refresh releases"
            aria-label="Refresh releases"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-emerald" : ""} />
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
              <Plus size={14} />
              <span>Schedule</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. Compact Delivery Progress & Triage Strip (Saves 80px+ vertical space) */}
      <div className="calendar-progress-strip">
        <div className="progress-strip-item">
          <CalendarIcon size={14} className="text-emerald" />
          <span className="strip-label">Scheduled:</span>
          <strong>{metrics.totalScheduled}</strong>
        </div>

        <div className="progress-strip-item">
          <Clock size={14} className="text-blue" />
          <span className="strip-label">In Progress:</span>
          <strong>{metrics.inProgress}</strong>
        </div>

        <div className="progress-strip-item">
          <CheckCircle2 size={14} className="text-green" />
          <span className="strip-label">Completed:</span>
          <strong>{metrics.completed}</strong>
        </div>

        {metrics.overdue > 0 && (
          <button
            type="button"
            className={`progress-strip-pill alert-overdue ${showOverdueOnly ? "filter-active" : ""}`}
            onClick={() => setShowOverdueOnly(!showOverdueOnly)}
            title="Click to filter overdue tasks"
          >
            <AlertTriangle size={13} />
            <span>{metrics.overdue} Overdue</span>
            {showOverdueOnly && <X size={12} className="clear-overdue-filter" />}
          </button>
        )}

        {metrics.urgentCount > 0 && (
          <div className="progress-strip-pill badge-urgent">
            <Flame size={13} />
            <span>{metrics.urgentCount} High/Urgent</span>
          </div>
        )}

        {/* DnD Tooltip Hint */}
        <div className="strip-dnd-hint">
          <GripVertical size={12} />
          <span>Drag tasks between days to reschedule instantly</span>
        </div>
      </div>

      {/* 3. Main Workspace Canvas with Optional "To Schedule" Drawer */}
      <div className="calendar-workspace-layout">
        <div className="calendar-main-stage">
          {/* A. MONTH VIEW */}
          {viewMode === "month" && (
            <div className="calendar-grid-card">
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

              <div className="calendar-days-grid" role="grid">
                {calendarGrid.map((cell) => {
                  const visibleTasks = cell.tasks.slice(0, 3);
                  const hiddenCount = cell.tasks.length - visibleTasks.length;
                  const isDropTarget = dragOverDate === cell.dateString;
                  const isPast = cell.dateString < todayCoords.dateString;

                  return (
                    <div
                      key={cell.dateString}
                      className={`calendar-day-cell ${!cell.isCurrentMonth ? "other-month" : ""} ${
                        cell.isToday ? "is-today" : ""
                      } ${cell.isWeekend ? "is-weekend" : ""} ${isPast ? "is-past" : "is-active-day"} ${isDropTarget ? "dnd-drop-target" : ""}`}
                      role="gridcell"
                      aria-label={`${cell.dateString}, ${cell.tasks.length} tasks`}
                      onClick={(e) => {
                        if (e.target.closest(".calendar-task-pill") || e.target.closest("button")) return;
                        setExpandedDay(cell.dateString);
                      }}
                      onDragOver={isPast ? undefined : (e) => handleDragOver(e, cell.dateString)}
                      onDragLeave={isPast ? undefined : handleDragLeave}
                      onDrop={isPast ? undefined : (e) => handleDrop(e, cell.dateString)}
                    >
                      <div className="calendar-cell-header">
                        <span className={`calendar-day-number ${cell.isToday ? "today-badge" : ""}`}>
                          {cell.day}
                        </span>

                        {cell.hasTasks && (
                          <span className="calendar-cell-task-counter" title={`${cell.taskCount} tasks`}>
                            {cell.taskCount}
                          </span>
                        )}

                        {!isPast && canCreateTask && (
                          <button
                            type="button"
                            className="calendar-cell-quick-add"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreateDueDate(cell.dateString);
                              setCreateModalOpen(true);
                            }}
                            title={`Schedule task on ${cell.dateString}`}
                            aria-label={`Schedule task on ${cell.dateString}`}
                          >
                            <Plus size={11} />
                          </button>
                        )}
                        {isPast && (
                          <span className="calendar-cell-past-lock" title="Past date — read only">
                            <Lock size={10} />
                          </span>
                        )}
                      </div>

                      <div className="calendar-cell-tasks-list">
                        {visibleTasks.map((t) => {
                          const isDone = t.status === "DONE";
                          const projectKey = t.project?.key ? `[${t.project.key}] ` : "";

                          return (
                            <div
                              key={t.id}
                              draggable={canEditTask && !isPast}
                              onDragStart={(e) => handleDragStart(e, t)}
                              className={`calendar-task-pill priority-${(t.priority || "medium").toLowerCase()} ${
                                isDone ? "task-done" : ""
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTask(t);
                              }}
                              title={`${t.title} (${t.priority} • ${t.status})${!isPast && canEditTask ? " — Drag to reschedule" : ""}`}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
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

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            className="calendar-more-tasks-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedDay(cell);
                            }}
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
          )}

          {/* B. WEEK VIEW (ClickUp / Jira style 7 expanded day columns) */}
          {viewMode === "week" && (
            <div className="calendar-week-view-grid">
              {weekDays.map((col) => {
                const isDropTarget = dragOverDate === col.dateString;
                const isPast = col.dateString < todayCoords.dateString;
                return (
                  <div
                    key={col.dateString}
                    className={`week-day-column ${col.isToday ? "week-day-today" : ""} ${
                      col.isWeekend ? "week-day-weekend" : ""
                    } ${isPast ? "week-day-past is-past" : "week-day-active is-active-day"} ${isDropTarget ? "dnd-drop-target" : ""}`}
                    onClick={(e) => {
                      if (e.target.closest(".week-task-card") || e.target.closest("button")) return;
                      setExpandedDay(col.dateString);
                    }}
                    onDragOver={isPast ? undefined : (e) => handleDragOver(e, col.dateString)}
                    onDragLeave={isPast ? undefined : handleDragLeave}
                    onDrop={isPast ? undefined : (e) => handleDrop(e, col.dateString)}
                  >
                    <div className="week-col-header">
                      <div className="week-col-date-block">
                        <span className="week-col-weekday">{col.weekdayName}</span>
                        <span className={`week-col-number ${col.isToday ? "today-badge" : ""}`}>
                          {col.day}
                        </span>
                      </div>
                      <div className="week-col-meta">
                        <span className="week-col-count">{col.tasks.length} tasks</span>
                        {!isPast && canCreateTask && (
                          <button
                            type="button"
                            className="calendar-cell-quick-add"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreateDueDate(col.dateString);
                              setCreateModalOpen(true);
                            }}
                            title={`Schedule task on ${col.dateString}`}
                            aria-label={`Schedule task on ${col.dateString}`}
                          >
                            <Plus size={12} />
                          </button>
                        )}
                        {isPast && (
                          <span className="calendar-cell-past-lock" title="Past date — read only">
                            <Lock size={10} />
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="week-col-tasks-stream">
                      {col.tasks.length === 0 ? (
                        <div className="week-empty-slot">
                          <span>No tasks</span>
                        </div>
                      ) : (
                        col.tasks.map((t) => {
                          const isDone = t.status === "DONE";
                          return (
                            <div
                              key={t.id}
                              draggable={canEditTask}
                              onDragStart={(e) => handleDragStart(e, t)}
                              className={`week-task-card priority-${(t.priority || "medium").toLowerCase()} ${
                                isDone ? "task-done" : ""
                              }`}
                              onClick={() => setSelectedTask(t)}
                            >
                              <div className="week-task-card-top">
                                <span className={`task-priority-dot dot-${(t.priority || "medium").toLowerCase()}`} />
                                <span className="week-task-project">{t.project?.key || "DEV"}</span>
                                <span className={`week-task-status status-${t.status.toLowerCase()}`}>
                                  {t.status}
                                </span>
                              </div>
                              <h4 className="week-task-title">{t.title}</h4>
                              <div className="week-task-card-footer">
                                {t.assignee ? (
                                  <div className="week-assignee-pill">
                                    <span className="assignee-avatar-mini">
                                      {t.assignee.name?.[0] || "U"}
                                    </span>
                                    <span>{t.assignee.name}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted text-xs">Unassigned</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* C. DAY VIEW (Deep single-day focus) */}
          {viewMode === "day" && (
            <div className="calendar-day-focus-view">
              <div className="day-focus-hero-card">
                <div className="day-hero-info">
                  <div className="day-hero-badge">
                    <span className="day-hero-month">{MONTH_NAMES[currentRefDate.getMonth()]?.slice(0, 3)}</span>
                    <span className="day-hero-day">{currentRefDate.getDate()}</span>
                  </div>
                  <div>
                    <h3 className="day-hero-title">{formatDayDate(currentRefDate)}</h3>
                    <p className="day-hero-sub">
                      {dayViewTasks.length} deliverables scheduled •{" "}
                      {dayViewTasks.filter((t) => t.status === "DONE").length} completed
                    </p>
                  </div>
                </div>

                {canCreateTask && selectedDayKey >= todayCoords.dateString ? (
                  <button
                    type="button"
                    className="calendar-add-task-btn"
                    onClick={() => {
                      setCreateDueDate(selectedDayKey);
                      setCreateModalOpen(true);
                    }}
                  >
                    <Plus size={14} /> Schedule for this Day
                  </button>
                ) : selectedDayKey < todayCoords.dateString ? (
                  <div className="calendar-past-notice-pill">
                    <Lock size={12} /> Past date — read only
                  </div>
                ) : null}
              </div>

              <div
                className={`day-focus-tasks-board ${dragOverDate === selectedDayKey ? "dnd-drop-target" : ""}`}
                onDragOver={selectedDayKey < todayCoords.dateString ? undefined : (e) => handleDragOver(e, selectedDayKey)}
                onDragLeave={selectedDayKey < todayCoords.dateString ? undefined : handleDragLeave}
                onDrop={selectedDayKey < todayCoords.dateString ? undefined : (e) => handleDrop(e, selectedDayKey)}
              >
                {dayViewTasks.length === 0 ? (
                  <div className="day-focus-empty">
                    <CalendarIcon size={36} className="text-muted" />
                    <h4>No tasks scheduled for this day</h4>
                    <p>Drag an unscheduled task here or schedule a new task to commit delivery.</p>
                  </div>
                ) : (
                  dayViewTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable={canEditTask && selectedDayKey >= todayCoords.dateString}
                      onDragStart={(e) => handleDragStart(e, t)}
                      className={`day-focus-task-row priority-${(t.priority || "medium").toLowerCase()}`}
                      onClick={() => setSelectedTask(t)}
                    >
                      <GripVertical size={15} className="dnd-handle-icon" />
                      <span className={`task-priority-dot dot-${(t.priority || "medium").toLowerCase()}`} />
                      <div className="day-task-main">
                        <div className="day-task-tags">
                          <span className="pill-project-key">[{t.project?.key || "TG"}]</span>
                          <span className={`status-badge status-${t.status.toLowerCase()}`}>{t.status}</span>
                          <span className="priority-text">{t.priority}</span>
                        </div>
                        <h4 className="day-task-title">{t.title}</h4>
                        {t.description && <p className="day-task-desc">{t.description}</p>}
                      </div>
                      <div className="day-task-assignee">
                        {t.assignee ? (
                          <div className="assignee-capsule">
                            <span className="assignee-avatar-mini">{t.assignee.name?.[0]}</span>
                            <span>{t.assignee.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted text-xs">Unassigned</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* D. AGENDA / CHRONOLOGICAL FEED VIEW */}
          {viewMode === "agenda" && (
            <div className="calendar-agenda-view">
              {agendaGroups.length === 0 ? (
                <div className="calendar-agenda-empty">
                  <List size={36} className="text-muted" />
                  <h4>No tasks matching your current filters</h4>
                  <p>Reset filters or schedule deliverables to see upcoming release milestones.</p>
                </div>
              ) : (
                agendaGroups.map((grp) => (
                  <div key={grp.key} className={`agenda-group-block agenda-${grp.key}`}>
                    <div className="agenda-group-header">
                      <span className="agenda-group-title">{grp.title}</span>
                      <span className="agenda-group-counter">{grp.tasks.length}</span>
                    </div>

                    <div className="agenda-group-items">
                      {grp.tasks.map((t) => {
                        const isDone = t.status === "DONE";
                        const dateFormatted = t.dueDate ? formatDayDate(t.dueDate) : "Unscheduled";
                        return (
                          <div
                            key={t.id}
                            className={`agenda-task-item priority-${(t.priority || "medium").toLowerCase()} ${
                              isDone ? "task-done" : ""
                            }`}
                            onClick={() => setSelectedTask(t)}
                          >
                            <span className={`task-priority-dot dot-${(t.priority || "medium").toLowerCase()}`} />
                            <div className="agenda-task-core">
                              <div className="agenda-task-header-row">
                                <span className="pill-project-key">[{t.project?.key || "DEV"}]</span>
                                <h4 className="agenda-task-heading">{t.title}</h4>
                              </div>
                              <span className="agenda-date-badge">
                                <Clock size={11} />
                                {dateFormatted}
                              </span>
                            </div>

                            <div className="agenda-task-status-wrap">
                              <span className={`status-badge status-${t.status.toLowerCase()}`}>{t.status}</span>
                            </div>

                            <div className="agenda-task-assignee">
                              {t.assignee ? (
                                <span className="assignee-avatar-mini" title={t.assignee.name}>
                                  {t.assignee.name?.[0]}
                                </span>
                              ) : (
                                <span className="text-muted text-xs">Unassigned</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 4. Collapsible "To Schedule" (Unscheduled Tasks) Drawer (ClickUp / Jira style) */}
        {showUnscheduledTray && (
          <aside className="calendar-unscheduled-tray">
            <div className="unscheduled-tray-header">
              <div className="tray-title-group">
                <Inbox size={16} className="text-emerald" />
                <h3>To Schedule</h3>
                <span className="tray-count-pill">{unscheduledTasks.length}</span>
              </div>
              <button
                type="button"
                className="tray-close-btn"
                onClick={() => setShowUnscheduledTray(false)}
                title="Close tray"
              >
                <X size={15} />
              </button>
            </div>

            <div className="unscheduled-tray-search">
              <Search size={13} className="tray-search-icon" />
              <input
                type="text"
                placeholder="Search unscheduled tasks…"
                value={unscheduledSearch}
                onChange={(e) => setUnscheduledSearch(e.target.value)}
              />
            </div>

            <div className="unscheduled-tray-list">
              {unscheduledTasks.length === 0 ? (
                <div className="unscheduled-tray-empty">
                  <span>All tasks in this scope have release dates scheduled!</span>
                </div>
              ) : (
                unscheduledTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable={canEditTask}
                    onDragStart={(e) => handleDragStart(e, t)}
                    className={`unscheduled-task-card priority-${(t.priority || "medium").toLowerCase()}`}
                  >
                    <div className="unscheduled-card-header">
                      <GripVertical size={13} className="dnd-handle-icon" />
                      <span className="unscheduled-card-project">[{t.project?.key || "DEV"}]</span>
                      <span className="unscheduled-card-priority">{t.priority}</span>
                    </div>

                    <h5 className="unscheduled-card-title">{t.title}</h5>

                    <div className="unscheduled-card-actions">
                      <button
                        type="button"
                        className="unscheduled-quick-btn"
                        onClick={() => handleDrop({ preventDefault: () => {} }, todayCoords.dateString)}
                        title="Schedule for Today"
                      >
                        <CalendarIcon size={11} /> Today
                      </button>
                      <button
                        type="button"
                        className="unscheduled-view-btn"
                        onClick={() => setSelectedTask(t)}
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Day Tasks List Modal (when clicking on any date box or "+N more") */}
      {expandedDay && (
        <div
          className="calendar-modal-backdrop"
          onClick={() => setExpandedDay(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-day-modal-title"
        >
          <div
            className="calendar-modal-dialog calendar-day-tasks-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="calendar-modal-header">
              <div className="calendar-modal-title-wrap">
                <div className="calendar-modal-icon-badge">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <h3 id="calendar-day-modal-title" className="calendar-modal-title">
                    Tasks for {formattedExpandedDate}
                  </h3>
                  <p className="calendar-modal-subtitle">
                    {expandedDayTasks.length === 0
                      ? "No tasks scheduled"
                      : `${expandedDayTasks.length} task${expandedDayTasks.length === 1 ? "" : "s"} scheduled`}
                    {expandedIsPast ? " • Past date (read-only)" : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="calendar-modal-close-btn"
                onClick={() => setExpandedDay(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="calendar-day-tasks-body">
              {expandedDayTasks.length === 0 ? (
                <div className="calendar-day-tasks-empty">
                  <div className="calendar-empty-icon-circle">
                    <CalendarDays size={28} />
                  </div>
                  <h4 className="calendar-empty-title">No tasks scheduled for this date</h4>
                  <p className="calendar-empty-desc">
                    {expandedIsPast
                      ? "This date is in the past. Tasks cannot be added to past dates."
                      : "There are no tasks scheduled for this date. Plan ahead to keep your delivery on track."}
                  </p>
                  {!expandedIsPast && canCreateTask && (
                    <button
                      type="button"
                      className="calendar-btn-submit calendar-empty-add-btn"
                      onClick={() => {
                        setCreateDueDate(expandedDateString);
                        setExpandedDay(null);
                        setCreateModalOpen(true);
                      }}
                    >
                      <Plus size={14} /> Add Task for this Date
                    </button>
                  )}
                </div>
              ) : (
                <div className="calendar-day-tasks-list">
                  {expandedDayTasks.map((t) => {
                    const isDone = t.status === "DONE";
                    const priorityClass = (t.priority || "medium").toLowerCase();
                    return (
                      <div
                        key={t.id}
                        className="calendar-day-task-card"
                        onClick={() => {
                          setExpandedDay(null);
                          setSelectedTask(t);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setExpandedDay(null);
                            setSelectedTask(t);
                          }
                        }}
                      >
                        <div className="calendar-day-task-card-left">
                          <span
                            className={`task-priority-dot dot-${priorityClass}`}
                            title={`Priority: ${t.priority}`}
                          />
                          <div className="calendar-day-task-info">
                            <span className={`calendar-day-task-title ${isDone ? "is-done" : ""}`}>
                              {t.title}
                            </span>
                            <div className="calendar-day-task-meta">
                              {t.project?.key && (
                                <span className="calendar-project-key-pill">
                                  {t.project.key}
                                </span>
                              )}
                              <span className="calendar-project-name">
                                {t.project?.name || "Project"}
                              </span>
                              {t.assignee && (
                                <span className="calendar-assignee-chip">
                                  <User size={11} />
                                  <span>{t.assignee.name}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="calendar-day-task-card-right">
                          <span className={`status-badge status-${t.status.toLowerCase()}`}>
                            {t.status}
                          </span>
                          <ArrowRight size={14} className="calendar-row-arrow" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="calendar-modal-footer calendar-day-tasks-footer">
              <div className="calendar-footer-left">
                {expandedIsPast && (
                  <span className="calendar-modal-lock-hint">
                    <Lock size={12} /> Past dates are read-only
                  </span>
                )}
              </div>
              <div className="calendar-footer-right">
                <button
                  type="button"
                  className="calendar-btn-cancel"
                  onClick={() => setExpandedDay(null)}
                >
                  Close
                </button>
                {!expandedIsPast && canCreateTask && (
                  <button
                    type="button"
                    className="calendar-btn-submit"
                    onClick={() => {
                      setCreateDueDate(expandedDateString);
                      setExpandedDay(null);
                      setCreateModalOpen(true);
                    }}
                  >
                    <Plus size={14} /> Add Task
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Task Creation Modal */}
      {createModalOpen && (
        <div
          className="calendar-modal-backdrop"
          onClick={() => !submittingCreate && setCreateModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-modal-title"
        >
          <div className="calendar-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-modal-header">
              <div className="calendar-modal-title-wrap">
                <div className="calendar-modal-icon-badge">
                  <CalendarIcon size={18} />
                </div>
                <div>
                  <h3 id="calendar-modal-title" className="calendar-modal-title">Schedule Release Task</h3>
                  <p className="calendar-modal-subtitle">Pick a date and set deliverables for this workspace</p>
                </div>
              </div>
              <button
                type="button"
                className="calendar-modal-close-btn"
                onClick={() => setCreateModalOpen(false)}
                disabled={submittingCreate}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleQuickCreate} className="calendar-modal-form">
              <div className="calendar-modal-body">
                {/* Project Selection */}
                <div className="calendar-form-group">
                  <label className="calendar-form-label">
                    <span>Project Target</span>
                    <span className="calendar-required-asterisk">*</span>
                  </label>
                  <select
                    className="calendar-form-select"
                    value={newProjectId}
                    onChange={(e) => setNewProjectId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select project…</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.key ? `[${p.key}] ` : ""}{p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Task Title */}
                <div className="calendar-form-group">
                  <label className="calendar-form-label">
                    <span>Task Title</span>
                    <span className="calendar-required-asterisk">*</span>
                  </label>
                  <input
                    type="text"
                    className="calendar-form-input"
                    placeholder="e.g. Production Deployment V2"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    minLength={2}
                    autoFocus
                  />
                </div>

                {/* Due Date & Priority Row */}
                <div className="calendar-form-row">
                  <div className="calendar-form-group flex-1">
                    <div className="calendar-label-row">
                      <label className="calendar-form-label">
                        <span>Scheduled Date</span>
                        <span className="calendar-required-asterisk">*</span>
                      </label>
                      <button
                        type="button"
                        className="calendar-date-shortcut-btn"
                        onClick={() => setCreateDueDate(todayCoords.dateString)}
                      >
                        Today
                      </button>
                    </div>
                    <input
                      type="date"
                      className="calendar-form-input"
                      min={todayCoords.dateString}
                      value={createDueDate}
                      onChange={(e) => setCreateDueDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="calendar-form-group flex-1">
                    <label className="calendar-form-label">Priority</label>
                    <div className="calendar-priority-pills">
                      {[
                        { value: "LOW", label: "Low", color: "#10B981" },
                        { value: "MEDIUM", label: "Med", color: "#3B82F6" },
                        { value: "HIGH", label: "High", color: "#F97316" },
                        { value: "URGENT", label: "Urgent", color: "#EF4444" },
                      ].map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          className={`calendar-priority-pill-btn ${newPriority === p.value ? "is-active" : ""}`}
                          style={{
                            "--pill-accent": p.color,
                          }}
                          onClick={() => setNewPriority(p.value)}
                        >
                          <span className="priority-pill-dot" style={{ backgroundColor: p.color }} />
                          <span>{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="calendar-form-group">
                  <label className="calendar-form-label">
                    <span>Description</span>
                    <span className="calendar-form-sublabel">(optional)</span>
                  </label>
                  <textarea
                    className="calendar-form-textarea"
                    rows={3}
                    placeholder="Notes or release checklist items…"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className="calendar-modal-footer">
                <button
                  type="button"
                  className="calendar-btn-cancel"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={submittingCreate}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="calendar-btn-submit"
                  disabled={
                    submittingCreate ||
                    !newTitle.trim() ||
                    !newProjectId ||
                    !createDueDate ||
                    createDueDate < todayCoords.dateString
                  }
                >
                  {submittingCreate ? "Scheduling…" : "Save to Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Slide-Over Drawer */}
      {selectedTask && (() => {
        const selectedTaskIsPast = Boolean(
          selectedTask?.dueDate && normalizeDateKey(selectedTask.dueDate) < todayCoords.dateString
        );
        return (
          <TaskDetailDrawer
            task={selectedTask}
            projects={activeProjects}
            members={members}
            currentUser={user}
            userPermissions={userPermissions}
            canEdit={canEditTask && !selectedTaskIsPast}
            canAssign={canEditTask && !selectedTaskIsPast}
            canDelete={canDeleteTask && !selectedTaskIsPast}
            onClose={() => setSelectedTask(null)}
            onSave={handleSaveTask}
            onDelete={handleDeleteTask}
          />
        );
      })()}
    </div>
  );
}
