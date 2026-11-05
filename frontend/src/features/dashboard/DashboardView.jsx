import { useEffect, useState, useCallback, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  Flame,
  FolderGit2,
  HardDrive,
  Layout,
  Layers,
  ListTodo,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import { LoadingView } from "../../components/LoadingView.jsx";
import {
  calculatePriorityDistribution,
  getDueTimeLabel,
  formatAuditAction,
  formatRelativeTime,
  groupTasksByHorizon,
  calculateProjectHealth,
} from "./dashboardUtils.js";

const STATUS_OPTIONS = [
  { id: "TODO", label: "To do", color: "#94a3b8" },
  { id: "IN_PROGRESS", label: "In Progress", color: "#2563eb" },
  { id: "REVISION", label: "In Review", color: "#f59e0b" },
  { id: "DONE", label: "Done", color: "#10b981" },
];

export function DashboardView({
  user,
  activeOrg,
  userPermissions,
  onNavigateToTasks,
  onNavigateToProjects,
  onNavigateToCalendar,
  onOpenWizard,
  onShowNotice,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dual-Engine Mode Toggle: "my-work" (Default for IC focus) vs "team-velocity" (for leads & projects)
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("teamguard_dashboard_tab") || "my-work";
  });

  // Time horizon tab inside My Work: "all" | "overdue" | "today" | "upcoming" | "inReview"
  const [horizonFilter, setHorizonFilter] = useState("all");

  // Focus Lineup task IDs stored in localStorage
  const [lineupIds, setLineupIds] = useState(() => {
    try {
      const stored = localStorage.getItem(`teamguard_lineup_${activeOrg?.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Scratchpad quick notes
  const [scratchNotes, setScratchNotes] = useState(() => {
    return (
      localStorage.getItem(`teamguard_scratchpad_${activeOrg?.id}`) ||
      "- [ ] Review sprint blockers\n- [ ] Sync with backend on API contracts\n- [ ] Finalize production release notes"
    );
  });
  const [scratchSaved, setScratchSaved] = useState(false);

  // Optimistic tracking for tasks updated inline
  const [localTaskChanges, setLocalTaskChanges] = useState({});

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem("teamguard_dashboard_tab", tab);
  };

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getDashboard();
      setData(res);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [activeOrg?.id, fetchDashboard]);

  // Global workspace cache purge listener
  useEffect(() => {
    function handlePurge() {
      setData(null);
      setLoading(true);
      fetchDashboard();
    }
    window.addEventListener("teamguard:workspace-purged", handlePurge);
    return () => window.removeEventListener("teamguard:workspace-purged", handlePurge);
  }, [fetchDashboard]);

  // Persist lineup
  const toggleLineupPin = (taskId) => {
    setLineupIds((prev) => {
      const next = prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId].slice(0, 5);
      try {
        localStorage.setItem(`teamguard_lineup_${activeOrg?.id}`, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // Scratchpad autosave
  const handleScratchpadChange = (e) => {
    const val = e.target.value;
    setScratchNotes(val);
    try {
      localStorage.setItem(`teamguard_scratchpad_${activeOrg?.id}`, val);
      setScratchSaved(true);
      setTimeout(() => setScratchSaved(false), 1500);
    } catch {
      // ignore
    }
  };

  // Inline Task Status Transition with Optimistic UI Update
  const handleInlineStatusChange = async (task, newStatus) => {
    if (task.status === newStatus) return;
    const taskId = task.id;

    // Apply optimistic update
    setLocalTaskChanges((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), status: newStatus },
    }));

    try {
      await api.updateTask(taskId, { status: newStatus });
      if (onShowNotice) {
        onShowNotice({
          type: "success",
          message: `Task updated to "${STATUS_OPTIONS.find((s) => s.id === newStatus)?.label}"`,
        });
      }
    } catch (err) {
      // Rollback on failure
      setLocalTaskChanges((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      if (onShowNotice) {
        onShowNotice({
          type: "error",
          message: err.message || "Failed to update task status",
        });
      }
    }
  };

  // Quick Reschedule Nudge (+1 Day or +7 Days)
  const handleRescheduleNudge = async (task, daysToAdd) => {
    const taskId = task.id;
    const currentBase = task.dueDate ? new Date(task.dueDate) : new Date();
    const newDueDate = new Date(currentBase.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    const dateIso = newDueDate.toISOString();

    setLocalTaskChanges((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), dueDate: dateIso },
    }));

    try {
      await api.updateTask(taskId, { dueDate: dateIso });
      if (onShowNotice) {
        onShowNotice({
          type: "success",
          message: `Task rescheduled by +${daysToAdd} day(s)`,
        });
      }
    } catch (err) {
      setLocalTaskChanges((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      if (onShowNotice) {
        onShowNotice({
          type: "error",
          message: err.message || "Failed to reschedule task",
        });
      }
    }
  };

  // Merge server data with optimistic task state
  const allRawTasks = useMemo(() => {
    const list = [...(data?.todayTasks || []), ...(data?.urgent48hTasks || [])];
    const unique = [];
    const seen = new Set();
    for (const t of list) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        const patch = localTaskChanges[t.id] || {};
        unique.push({ ...t, ...patch });
      }
    }
    return unique;
  }, [data, localTaskChanges]);

  // Group tasks by horizon
  const horizon = useMemo(() => {
    return groupTasksByHorizon(allRawTasks);
  }, [allRawTasks]);

  // Filtered task stream for the active horizon filter
  const displayedStreamTasks = useMemo(() => {
    switch (horizonFilter) {
      case "overdue":
        return horizon.overdue;
      case "today":
        return horizon.today;
      case "upcoming":
        return horizon.upcoming;
      case "inReview":
        return horizon.inReview;
      default:
        return allRawTasks.filter((t) => t.status !== "DONE");
    }
  }, [horizon, horizonFilter, allRawTasks]);

  // Lineup pinned tasks
  const lineupTasks = useMemo(() => {
    return allRawTasks.filter((t) => lineupIds.includes(t.id));
  }, [allRawTasks, lineupIds]);

  if (loading) {
    return <LoadingView message="Loading workspace dashboard…" />;
  }

  if (error) {
    return (
      <div className="view-error-container">
        <AlertCircle size={24} className="text-destructive" />
        <p>{error}</p>
        <button type="button" className="btn-secondary" onClick={fetchDashboard} style={{ marginTop: "12px" }}>
          Retry Loading
        </button>
      </div>
    );
  }

  const stats = data?.stats ?? {
    totalProjects: 0,
    activeProjects: 0,
    totalTasks: 0,
    inProgress: 0,
    completed: 0,
    revision: 0,
    todo: 0,
    activeMembers: 1,
    storageFormatted: "0 KB",
  };

  const dist = calculatePriorityDistribution(data?.taskDistribution);
  const recentProjects = (data?.recentProjects ?? []).filter((p) => !p.isArchived);
  const activityFeed = data?.activityFeed ?? [];
  const completionRate =
    stats.totalTasks > 0 ? Math.round((stats.completed / stats.totalTasks) * 100) : 0;

  // Personalized Greeting
  const currentHour = new Date().getHours();
  const timeGreeting = currentHour < 12 ? "Good morning" : currentHour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name ? user.name.split(" ")[0] : "there";
  const formattedTodayDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="dashboard-view-layout modern-saas-dashboard">
      {/* ====================================================================
          1. HEADER & DUAL-ENGINE WORKSPACE CONTROLLER
          ==================================================================== */}
      <header className="dashboard-action-header">
        <div className="dashboard-header-welcome">
          <div className="welcome-greeting-row">
            <h2>
              {timeGreeting}, {firstName} <span className="greeting-wave">👋</span>
            </h2>
            <span className="dashboard-date-badge">{formattedTodayDate}</span>
          </div>
          <p className="welcome-summary-pulse">
            {horizon.overdue.length > 0 ? (
              <span className="pulse-alert">
                <AlertCircle size={14} className="text-destructive inline-mr" />
                <strong>{horizon.overdue.length} overdue task(s)</strong> require immediate triage
              </span>
            ) : horizon.today.length > 0 ? (
              <span className="pulse-today">
                <CheckCircle2 size={14} className="text-emerald inline-mr" />
                You have <strong>{horizon.today.length} task(s)</strong> scheduled for completion today
              </span>
            ) : (
              <span className="pulse-good">
                <Sparkles size={14} className="text-emerald inline-mr" />
                All scheduled deliverables on track. Ready for focused work!
              </span>
            )}
          </p>
        </div>

        {/* Mode Switcher: My Work (Focus) vs Team Velocity */}
        <div className="dashboard-mode-selector" role="tablist" aria-label="Dashboard views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "my-work"}
            className={`dashboard-mode-pill ${activeTab === "my-work" ? "active" : ""}`}
            onClick={() => handleTabChange("my-work")}
          >
            <Zap size={14} />
            <span>My Work</span>
            {horizon.totalActionable > 0 && (
              <span className="mode-count-pill">{horizon.totalActionable}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "team-velocity"}
            className={`dashboard-mode-pill ${activeTab === "team-velocity" ? "active" : ""}`}
            onClick={() => handleTabChange("team-velocity")}
          >
            <FolderGit2 size={14} />
            <span>Team Velocity</span>
            <span className="mode-count-pill subtle">{stats.activeProjects}</span>
          </button>
        </div>
      </header>

      {/* ====================================================================
          2. ACTIONABLE TRIAGE METRIC CARDS ROW (High-Utility KPIs)
          ==================================================================== */}
      <section className="dashboard-stats-grid actionable-kpi-grid">
        {/* Card 1: Overdue Attention */}
        <div
          className={`stat-card stat-card-interactive triage-card-overdue ${
            horizon.overdue.length > 0 ? "has-overdue" : ""
          }`}
          onClick={() => {
            setActiveTab("my-work");
            setHorizonFilter("overdue");
          }}
          title="Click to view all overdue tasks"
        >
          <div className="stat-card-header">
            <div className="stat-icon-wrapper icon-overdue">
              <AlertTriangle size={15} />
            </div>
            <span className={`stat-pill-badge ${horizon.overdue.length > 0 ? "badge-overdue" : "badge-clean"}`}>
              {horizon.overdue.length > 0 ? "Immediate Action" : "Clear"}
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{horizon.overdue.length}</span>
            <span className="stat-card-label">Overdue Tasks</span>
          </div>
          <div className="stat-card-footer">
            <span className="stat-footer-text">
              {horizon.overdue.length > 0 ? "Triage deliverables" : "Zero past-due tasks"}
            </span>
            <ArrowRight size={12} className="stat-arrow-icon" />
          </div>
        </div>

        {/* Card 2: Today's Commitments */}
        <div
          className="stat-card stat-card-interactive triage-card-today"
          onClick={() => {
            setActiveTab("my-work");
            setHorizonFilter("today");
          }}
          title="Click to view tasks scheduled for today"
        >
          <div className="stat-card-header">
            <div className="stat-icon-wrapper icon-progress">
              <Clock size={15} />
            </div>
            <span className="stat-pill-badge badge-progress">Active Session</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{horizon.today.length}</span>
            <span className="stat-card-label">Due Today</span>
          </div>
          <div className="stat-card-footer">
            <span className="stat-footer-text">{stats.inProgress} currently in progress</span>
            <ArrowRight size={12} className="stat-arrow-icon" />
          </div>
        </div>

        {/* Card 3: Awaiting Review / QA */}
        <div
          className="stat-card stat-card-interactive triage-card-review"
          onClick={() => {
            setActiveTab("my-work");
            setHorizonFilter("inReview");
          }}
          title="Click to filter tasks awaiting review"
        >
          <div className="stat-card-header">
            <div className="stat-icon-wrapper icon-review">
              <ShieldCheck size={15} />
            </div>
            <span className="stat-pill-badge badge-review">Review Blockers</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{horizon.inReview.length}</span>
            <span className="stat-card-label">In Review</span>
          </div>
          <div className="stat-card-footer">
            <span className="stat-footer-text">{stats.revision} sign-offs pending</span>
            <ArrowRight size={12} className="stat-arrow-icon" />
          </div>
        </div>

        {/* Card 4: Daily Velocity & Completion Rate */}
        <div
          className="stat-card stat-card-interactive triage-card-velocity"
          onClick={() => onNavigateToTasks && onNavigateToTasks({ status: "DONE" })}
          title="Click to view all completed tasks"
        >
          <div className="stat-card-header">
            <div className="stat-icon-wrapper icon-completed">
              <CheckCircle2 size={15} />
            </div>
            <span className="stat-pill-badge badge-done">{completionRate}% Done</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.completed}</span>
            <span className="stat-card-label">Completed Tasks</span>
          </div>
          <div className="stat-card-footer">
            <span className="stat-footer-text">{stats.totalTasks} total in workspace</span>
            <ArrowRight size={12} className="stat-arrow-icon" />
          </div>
        </div>
      </section>

      {/* ====================================================================
          3. "MY WORK" ENGINE (Default IC Productivity Center)
          ==================================================================== */}
      {activeTab === "my-work" && (
        <div className="dashboard-my-work-grid">
          {/* Top Focus Lineup (ClickUp 3.0 Benchmark) */}
          <section className="dashboard-card lineup-card">
            <div className="dashboard-card-header">
              <div className="card-title-group">
                <Pin size={15} className="text-emerald" />
                <h3>Focus Lineup</h3>
                <span className="card-counter-tag">{lineupTasks.length}/5 pinned</span>
              </div>
              <span className="card-header-hint">Your primary targets for this active session</span>
            </div>

            <div className="lineup-items-wrap">
              {lineupTasks.length > 0 ? (
                <div className="lineup-tasks-row">
                  {lineupTasks.map((task) => (
                    <div key={task.id} className="lineup-task-item">
                      <button
                        type="button"
                        className="lineup-check-btn"
                        onClick={() => handleInlineStatusChange(task, "DONE")}
                        title="Mark task completed"
                      >
                        <Circle size={15} />
                      </button>
                      <div className="lineup-task-content">
                        <span className="lineup-task-title" title={task.title}>
                          {task.title}
                        </span>
                        <div className="lineup-task-meta">
                          {task.project?.key && (
                            <span className="lineup-project-tag">{task.project.key}</span>
                          )}
                          <span className={`tag-priority mini tag-${(task.priority || "medium").toLowerCase()}`}>
                            {task.priority}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="lineup-unpin-btn"
                        onClick={() => toggleLineupPin(task.id)}
                        title="Remove from Focus Lineup"
                      >
                        <PinOff size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lineup-empty-prompt">
                  <Sparkles size={16} className="text-emerald" />
                  <span>No tasks pinned yet. Pin your top deliverables from the stream below to focus today.</span>
                </div>
              )}
            </div>
          </section>

          {/* Main Action Streams: Left (Due Date Horizon) vs Right (Scratchpad & Agenda) */}
          <div className="my-work-split-row">
            {/* Left Stream: Due Date Horizon & Inline Task Management */}
            <div className="dashboard-card horizon-stream-card">
              <div className="dashboard-card-header">
                <div className="card-title-group">
                  <ListTodo size={16} className="text-emerald" />
                  <h3>Actionable Work Stream</h3>
                  <span className="card-counter-tag">{displayedStreamTasks.length} tasks</span>
                </div>

                {/* Horizon Tab Filters */}
                <div className="horizon-filter-pills" role="tablist">
                  <button
                    type="button"
                    className={`horizon-tab ${horizonFilter === "all" ? "active" : ""}`}
                    onClick={() => setHorizonFilter("all")}
                  >
                    All Active ({allRawTasks.filter((t) => t.status !== "DONE").length})
                  </button>
                  <button
                    type="button"
                    className={`horizon-tab tab-overdue ${horizonFilter === "overdue" ? "active" : ""}`}
                    onClick={() => setHorizonFilter("overdue")}
                  >
                    🔴 Overdue ({horizon.overdue.length})
                  </button>
                  <button
                    type="button"
                    className={`horizon-tab ${horizonFilter === "today" ? "active" : ""}`}
                    onClick={() => setHorizonFilter("today")}
                  >
                    🟡 Today ({horizon.today.length})
                  </button>
                  <button
                    type="button"
                    className={`horizon-tab ${horizonFilter === "upcoming" ? "active" : ""}`}
                    onClick={() => setHorizonFilter("upcoming")}
                  >
                    🔵 Next 7d ({horizon.upcoming.length})
                  </button>
                  <button
                    type="button"
                    className={`horizon-tab ${horizonFilter === "inReview" ? "active" : ""}`}
                    onClick={() => setHorizonFilter("inReview")}
                  >
                    ⚪ In Review ({horizon.inReview.length})
                  </button>
                </div>
              </div>

              {/* Task Stream List with Inline Controls */}
              <div className="horizon-tasks-container">
                {displayedStreamTasks.length > 0 ? (
                  <div className="horizon-task-rows">
                    {displayedStreamTasks.map((task) => {
                      const dueInfo = getDueTimeLabel(task.dueDate);
                      const isPinned = lineupIds.includes(task.id);
                      return (
                        <div
                          key={task.id}
                          className={`horizon-task-row ${dueInfo.isOverdue ? "row-overdue" : ""}`}
                        >
                          {/* 1-Click Complete */}
                          <button
                            type="button"
                            className="task-complete-toggle-btn"
                            onClick={() => handleInlineStatusChange(task, "DONE")}
                            title="Complete task"
                          >
                            <Circle size={15} />
                          </button>

                          {/* Task Key */}
                          {task.project?.key && (
                            <span className="task-row-key-badge">{task.project.key}-{task.id}</span>
                          )}

                          {/* Title & Project Name */}
                          <div
                            className="task-row-title-wrap"
                            onClick={() => onNavigateToTasks && onNavigateToTasks()}
                            style={{ cursor: "pointer" }}
                          >
                            <span className="task-row-title">{task.title}</span>
                            <span className="task-row-project-name">
                              {task.project?.name || "Global Workspace"}
                            </span>
                          </div>

                          {/* Priority Flag */}
                          <span className={`tag-priority mini tag-${(task.priority || "medium").toLowerCase()}`}>
                            {task.priority}
                          </span>

                          {/* Due Date Indicator */}
                          <div className={`task-due-indicator ${dueInfo.isOverdue ? "overdue" : ""}`}>
                            <Calendar size={12} />
                            <span>{dueInfo.label}</span>
                          </div>

                          {/* Inline Status Dropdown Select */}
                          <div className="task-inline-status-picker">
                            <select
                              value={task.status}
                              onChange={(e) => handleInlineStatusChange(task, e.target.value)}
                              className={`status-select-pill status-${task.status.toLowerCase()}`}
                              title="Change status"
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quick Reschedule Nudge Button (for overdue or imminent tasks) */}
                          {dueInfo.isOverdue && (
                            <button
                              type="button"
                              className="reschedule-nudge-btn"
                              onClick={() => handleRescheduleNudge(task, 1)}
                              title="Push due date +1 Day"
                            >
                              +1d
                            </button>
                          )}

                          {/* Pin to Lineup */}
                          <button
                            type="button"
                            className={`pin-action-btn ${isPinned ? "is-pinned" : ""}`}
                            onClick={() => toggleLineupPin(task.id)}
                            title={isPinned ? "Unpin from Lineup" : "Pin to Lineup"}
                          >
                            <Pin size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="horizon-empty-state">
                    <CheckCircle2 size={32} className="text-emerald" />
                    <h4>Zero tasks pending in this horizon</h4>
                    <p>You have cleared all deliverables for this filter. Check other horizons or enjoy your day!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Stream: Quick Scratchpad & Agenda */}
            <div className="dashboard-right-stream-column">
              {/* Quick Scratchpad (ClickUp Benchmark) */}
              <div className="dashboard-card scratchpad-card">
                <div className="dashboard-card-header">
                  <div className="card-title-group">
                    <Sparkles size={15} className="text-emerald" />
                    <h3>Quick Scratchpad</h3>
                  </div>
                  {scratchSaved && <span className="scratch-saved-pill">Saved</span>}
                </div>
                <div className="scratchpad-body">
                  <textarea
                    value={scratchNotes}
                    onChange={handleScratchpadChange}
                    placeholder="Jot down quick thoughts, notes, or tasks..."
                    className="scratchpad-textarea"
                    rows={6}
                  />
                  <div className="scratchpad-footer">
                    <small>Persisted locally in your workspace</small>
                    <button
                      type="button"
                      className="scratch-convert-btn"
                      onClick={() => onOpenWizard && onOpenWizard()}
                      title="Create formal project task"
                    >
                      <Plus size={13} />
                      <span>New Task</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Today's Agenda & Meetings */}
              <div className="dashboard-card meetings-card">
                <div className="dashboard-card-header">
                  <div className="card-title-group">
                    <Video size={15} className="text-emerald" />
                    <h3>Today's Schedule</h3>
                  </div>
                  <button
                    type="button"
                    className="card-view-more-btn"
                    onClick={() => onNavigateToCalendar && onNavigateToCalendar()}
                    title="Open calendar"
                  >
                    <span>Calendar</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
                <div className="meetings-list">
                  {(data?.upcomingMeetings || []).map((m) => (
                    <div key={m.id} className="meeting-row-item">
                      <div className="meeting-icon-box">
                        <Video size={14} className="text-emerald" />
                      </div>
                      <div className="meeting-info">
                        <strong>{m.title}</strong>
                        <span>{m.date} · {m.platform}</span>
                      </div>
                      <button
                        type="button"
                        className="meeting-join-pill"
                        onClick={() => window.open("https://meet.google.com", "_blank")}
                        title="Open meeting room"
                      >
                        Join
                        <ExternalLink size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          4. "TEAM VELOCITY" ENGINE (Manager & Project Health Overview)
          ==================================================================== */}
      {activeTab === "team-velocity" && (
        <div className="dashboard-team-velocity-grid">
          {/* Active Projects Health Rollup (Excludes Archived / Ghost Projects) */}
          <div className="dashboard-card active-projects-health-card">
            <div className="dashboard-card-header">
              <div className="card-title-group">
                <FolderGit2 size={16} className="text-emerald" />
                <h3>Active Project Health & Delivery Rollup</h3>
                <span className="card-counter-tag">{recentProjects.length} active</span>
              </div>
              <button
                type="button"
                className="card-view-more-btn"
                onClick={() => onNavigateToProjects && onNavigateToProjects()}
                title="View all projects in workspace"
              >
                <span>View all projects</span>
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="projects-health-table-wrap">
              {recentProjects.length > 0 ? (
                <table className="projects-health-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Health</th>
                      <th>Progress</th>
                      <th>Deliverables</th>
                      <th>Team Members</th>
                      <th>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentProjects.map((proj) => {
                      const health = calculateProjectHealth(proj);
                      return (
                        <tr
                          key={proj.id}
                          className="project-health-row"
                          onClick={() => {
                            if (onNavigateToProjects) onNavigateToProjects();
                            window.dispatchEvent(
                              new CustomEvent("teamguard:filter-tasks", {
                                detail: { projectId: proj.id },
                              })
                            );
                          }}
                        >
                          <td className="project-cell-name">
                            <div className="project-title-lockup">
                              {proj.key && <span className="project-key-tag mini">{proj.key}</span>}
                              <div>
                                <strong>{proj.name}</strong>
                                <small className="project-desc-text truncate">
                                  {proj.description || "Active workspace track"}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`health-pill health-${health.tone}`}>
                              <span className="health-dot" style={{ backgroundColor: health.color }} />
                              {health.label}
                            </span>
                          </td>
                          <td className="project-cell-progress">
                            <div className="progress-info-row">
                              <span>{proj.progress}%</span>
                              <div className="progress-bar-track mini">
                                <div
                                  className="progress-bar-fill"
                                  style={{
                                    width: `${proj.progress}%`,
                                    backgroundColor: health.color,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="project-cell-counts">
                            <span>
                              {proj.tasksDone}/{proj.tasksTotal} tasks
                            </span>
                          </td>
                          <td className="project-cell-team">
                            <div className="team-avatars-stack">
                              {(proj.team || []).slice(0, 3).map((m, idx) => (
                                <span
                                  key={idx}
                                  className="member-avatar-circle"
                                  title={m.name}
                                >
                                  {m.name ? m.name[0].toUpperCase() : "U"}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="project-cell-meta">
                            <span className="meta-badge" title="Comments">
                              <MessageSquare size={12} /> {proj.commentsCount || 0}
                            </span>
                            <span className="meta-badge" title="Files">
                              <Paperclip size={12} /> {proj.attachmentsCount || 0}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-subtle-box">
                  <p>No active non-archived projects in this workspace.</p>
                </div>
              )}
            </div>
          </div>

          {/* Velocity Radar & Recent Collaborative Activity Stream */}
          <div className="velocity-secondary-row">
            {/* Priority Distribution Bar */}
            <div className="dashboard-card priority-velocity-card">
              <div className="dashboard-card-header">
                <div className="card-title-group">
                  <Flame size={16} className="text-orange" />
                  <h3>Priority Distribution Radar</h3>
                  <span className="card-counter-tag">{dist.total} total</span>
                </div>
              </div>

              <div className="stacked-bar-container">
                <div className="stacked-bar-track">
                  {dist.urgent > 0 && (
                    <div
                      className="stacked-segment segment-urgent"
                      style={{ width: `${dist.urgentPct}%` }}
                      title={`Urgent: ${dist.urgent} (${dist.urgentPct}%)`}
                      onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "URGENT" })}
                    />
                  )}
                  {dist.high > 0 && (
                    <div
                      className="stacked-segment segment-high"
                      style={{ width: `${dist.highPct}%` }}
                      title={`High: ${dist.high} (${dist.highPct}%)`}
                      onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "HIGH" })}
                    />
                  )}
                  {dist.medium > 0 && (
                    <div
                      className="stacked-segment segment-med"
                      style={{ width: `${dist.medPct}%` }}
                      title={`Medium: ${dist.medium} (${dist.medPct}%)`}
                      onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "MEDIUM" })}
                    />
                  )}
                  {dist.low > 0 && (
                    <div
                      className="stacked-segment segment-low"
                      style={{ width: `${dist.lowPct}%` }}
                      title={`Low: ${dist.low} (${dist.lowPct}%)`}
                      onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "LOW" })}
                    />
                  )}
                </div>

                <div className="distribution-legend-grid">
                  <div
                    className="legend-item clickable"
                    onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "URGENT" })}
                  >
                    <div className="legend-header">
                      <span className="legend-dot dot-urgent" />
                      <span>Urgent</span>
                    </div>
                    <small>({dist.urgentPct}%)</small>
                    <strong>{dist.urgent}</strong>
                  </div>
                  <div
                    className="legend-item clickable"
                    onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "HIGH" })}
                  >
                    <div className="legend-header">
                      <span className="legend-dot dot-high" />
                      <span>High</span>
                    </div>
                    <small>({dist.highPct}%)</small>
                    <strong>{dist.high}</strong>
                  </div>
                  <div
                    className="legend-item clickable"
                    onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "MEDIUM" })}
                  >
                    <div className="legend-header">
                      <span className="legend-dot dot-med" />
                      <span>Medium</span>
                    </div>
                    <small>({dist.medPct}%)</small>
                    <strong>{dist.medium}</strong>
                  </div>
                  <div
                    className="legend-item clickable"
                    onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "LOW" })}
                  >
                    <div className="legend-header">
                      <span className="legend-dot dot-low" />
                      <span>Low</span>
                    </div>
                    <small>({dist.lowPct}%)</small>
                    <strong>{dist.low}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Collaborative Activity Stream */}
            <div className="dashboard-card team-activity-card">
              <div className="dashboard-card-header">
                <div className="card-title-group">
                  <Zap size={16} className="text-emerald" />
                  <h3>Workspace Activity Stream</h3>
                </div>
              </div>

              <div className="team-activity-list">
                {activityFeed.length > 0 ? (
                  activityFeed.slice(0, 5).map((log) => (
                    <div key={log.id} className="activity-item-row">
                      <div className="activity-avatar-pill">
                        {log.actor?.name ? log.actor.name[0].toUpperCase() : "A"}
                      </div>
                      <div className="activity-item-text">
                        <div className="activity-item-title">
                          <strong>{log.actor?.name || "Member"}</strong>{" "}
                          <span>{formatAuditAction(log.action, log.resourceType)}</span>
                        </div>
                        <small className="activity-item-time">
                          {formatRelativeTime(log.createdAt)}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty-subtle">No recent team activity recorded.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardView;
