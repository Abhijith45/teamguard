import { useEffect, useState, useCallback } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  FolderGit2,
  ListTodo,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Video,
  Plus,
  Sliders,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Check,
  Flame,
  Activity,
  Users,
  HardDrive,
  ExternalLink,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import {
  calculatePriorityDistribution,
  getDueTimeLabel,
  formatAuditAction,
  formatRelativeTime,
} from "./dashboardUtils.js";
import { NotificationPreferencesModal } from "../notifications/NotificationPreferencesModal.jsx";

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
  const [showPreferences, setShowPreferences] = useState(false);
  const [completedTaskIds, setCompletedTaskIds] = useState(new Set());
  const [activeTooltip, setActiveTooltip] = useState(null);

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

  // TASK-003: Broadcast event listener for global workspace cache purges
  useEffect(() => {
    function handlePurge() {
      setData(null);
      setLoading(true);
      fetchDashboard();
    }
    window.addEventListener("teamguard:workspace-purged", handlePurge);
    return () => window.removeEventListener("teamguard:workspace-purged", handlePurge);
  }, [fetchDashboard]);

  // Quick 1-click completion toggle for today's tasks (US-DASH-004)
  const handleQuickComplete = async (e, task) => {
    e.stopPropagation();
    const taskId = task.id;
    const isAlreadyDone = task.status === "DONE" || completedTaskIds.has(taskId);

    if (isAlreadyDone) return;

    // Optimistic UI update
    setCompletedTaskIds((prev) => new Set([...prev, taskId]));

    try {
      await api.updateTask(taskId, { status: "DONE" });
      if (onShowNotice) {
        onShowNotice({
          type: "success",
          message: `Task "${task.title}" completed!`,
        });
      }
    } catch (err) {
      // Rollback on failure
      setCompletedTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      if (onShowNotice) {
        onShowNotice({
          type: "error",
          message: err.message || "Failed to complete task",
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="view-loading-container">
        <div className="loading-spinner" />
        <span>Aggregating workspace analytics & release metrics…</span>
      </div>
    );
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
    storageBytes: 0,
    storageFormatted: "0 KB",
    urgentTasksCount: 0,
  };

  const dist = calculatePriorityDistribution(data?.taskDistribution);
  const recentProjects = data?.recentProjects ?? [];
  const urgentTasks = data?.urgent48hTasks ?? [];
  const todayTasks = data?.todayTasks ?? [];
  const activityFeed = data?.activityFeed ?? [];
  const heatmap = data?.contributionHeatmap ?? {
    days: [],
    weeks: data?.activityMap ?? [],
    totalEvents: 0,
    activeDaysCount: 0,
  };

  const completionRate =
    stats.totalTasks > 0 ? Math.round((stats.completed / stats.totalTasks) * 100) : 0;

  return (
    <div className="dashboard-view-layout">
      {/* Quick Action Shortcuts Bar (US-DASH-004 / TG-DASH-004) */}
      <section className="dashboard-quick-actions-bar">
        <div className="quick-actions-left">
          <div className="workspace-kpi-badge">
            <span className="kpi-live-dot" />
            <span>Workspace: <strong>{activeOrg?.name || "Acme Corp"}</strong></span>
          </div>
        </div>
        <div className="quick-actions-right">
          {onOpenWizard && (
            <button
              type="button"
              className="quick-action-btn action-primary"
              onClick={onOpenWizard}
              title="Launch 5-Step Project Setup Wizard"
            >
              <Plus size={15} />
              <span>New Project</span>
            </button>
          )}

          <button
            type="button"
            className="quick-action-btn action-secondary"
            onClick={() => onNavigateToTasks && onNavigateToTasks()}
            title="Jump to Kanban Task Board"
          >
            <ListTodo size={15} />
            <span>Kanban Board</span>
          </button>

          {onNavigateToCalendar && (
            <button
              type="button"
              className="quick-action-btn action-secondary"
              onClick={onNavigateToCalendar}
              title="Open Release Calendar Grid"
            >
              <Calendar size={15} />
              <span>Release Calendar</span>
            </button>
          )}

          <button
            type="button"
            className="quick-action-btn action-ghost"
            onClick={() => setShowPreferences(true)}
            title="Configure Alert Subscriptions & Email Digests"
          >
            <Sliders size={15} />
            <span>Alert Preferences</span>
          </button>
        </div>
      </section>

      {/* 1. Contextual KPI Stat Cards Row (US-DASH-001, US-DASH-006) */}
      <section className="dashboard-stats-grid">
        {/* Card 1: Total Projects */}
        <div
          className="stat-card stat-card-interactive"
          onClick={() => onNavigateToProjects && onNavigateToProjects()}
          title="Click to view workspace projects"
        >
          <div className="stat-card-header">
            <div className="stat-icon-wrapper icon-projects">
              <FolderGit2 size={18} />
            </div>
            <span className="stat-pill-badge">{stats.activeProjects} active</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.totalProjects}</span>
            <span className="stat-card-label">Total Projects</span>
          </div>
          <div className="stat-card-footer">
            <span className="stat-footer-text">Manage tenant deliverables</span>
            <ArrowRight size={14} className="stat-arrow-icon" />
          </div>
        </div>

        {/* Card 2: In Progress Tasks */}
        <div
          className="stat-card stat-card-interactive"
          onClick={() => onNavigateToTasks && onNavigateToTasks({ status: "IN_PROGRESS" })}
          title="Click to filter Kanban board to In Progress tasks"
        >
          <div className="stat-card-header">
            <div className="stat-icon-wrapper icon-progress">
              <Clock size={18} />
            </div>
            <span className="stat-pill-badge badge-progress">Active Cycle</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.inProgress}</span>
            <span className="stat-card-label">In Progress Tasks</span>
          </div>
          <div className="stat-card-footer">
            <span className="stat-footer-text">{stats.todo} backlog · {stats.revision} revision</span>
            <ArrowRight size={14} className="stat-arrow-icon" />
          </div>
        </div>

        {/* Card 3: Completed Deliverables */}
        <div
          className="stat-card stat-card-interactive"
          onClick={() => onNavigateToTasks && onNavigateToTasks({ status: "DONE" })}
          title="Click to view completed tasks"
        >
          <div className="stat-card-header">
            <div className="stat-icon-wrapper icon-completed">
              <CheckCircle2 size={18} />
            </div>
            <span className="stat-pill-badge badge-done">{completionRate}% Done</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.completed}</span>
            <span className="stat-card-label">Completed Tasks</span>
          </div>
          <div className="stat-card-footer">
            <span className="stat-footer-text">{stats.totalTasks} total work units</span>
            <ArrowRight size={14} className="stat-arrow-icon" />
          </div>
        </div>

        {/* Card 4: Active Capacity & Storage */}
        <div
          className="stat-card stat-card-interactive"
          onClick={() => onNavigateToTasks && onNavigateToTasks()}
          title="Workspace team and asset capacity"
        >
          <div className="stat-card-header">
            <div className="stat-icon-wrapper icon-members">
              <Users size={18} />
            </div>
            <span className="stat-pill-badge badge-storage">{stats.storageFormatted}</span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.activeMembers}</span>
            <span className="stat-card-label">Active Members</span>
          </div>
          <div className="stat-card-footer">
            <span className="stat-footer-text">Storage & team capacity</span>
            <HardDrive size={14} className="stat-arrow-icon" />
          </div>
        </div>
      </section>

      {/* 2. Middle Row: Recent Projects & Task Distribution */}
      <div className="dashboard-mid-row">
        {/* Recent Projects with Live Progress Bars (US-DASH-002, US-DASH-003) */}
        <div className="dashboard-card recent-projects-card">
          <div className="dashboard-card-header">
            <div className="card-title-group">
              <FolderGit2 size={18} className="text-emerald" />
              <h3>Recent Projects</h3>
            </div>
            <span className="card-counter-tag">{recentProjects.length} Active</span>
          </div>
          <div className="recent-projects-grid">
            {recentProjects.length > 0 ? (
              recentProjects.map((proj) => (
                <div
                  key={proj.id}
                  className="project-preview-card"
                  onClick={() => onNavigateToProjects && onNavigateToProjects()}
                >
                  <div className="project-preview-top">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {proj.key && <span className="project-key-tag">{proj.key}</span>}
                      <span className={`tag-priority tag-${(proj.priority || "medium").toLowerCase()}`}>
                        {proj.priority}
                      </span>
                      {proj.isArchived && <span className="archived-pill">ARCHIVED</span>}
                    </div>
                  </div>
                  <h4 className="project-preview-title">{proj.name}</h4>
                  <p className="project-preview-desc">
                    {proj.description || "Workspace delivery track and milestones"}
                  </p>
                  <div className="project-progress-container">
                    <div className="project-progress-info">
                      <span>Progress</span>
                      <strong>
                        {proj.tasksDone !== undefined
                          ? `${proj.tasksDone}/${proj.tasksTotal} Tasks (${proj.progress}%)`
                          : `${proj.progress}%`}
                      </strong>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${proj.progress}%` }} />
                    </div>
                  </div>
                  <div className="project-preview-footer">
                    <div className="avatar-group">
                      {proj.team && proj.team.length > 0 ? (
                        proj.team.map((m, i) => (
                          <span key={i} className="mini-avatar" title={m.name}>
                            {m.name ? m.name[0] : "U"}
                          </span>
                        ))
                      ) : (
                        <span className="mini-avatar">T</span>
                      )}
                    </div>
                    <div className="project-counters">
                      <span className="counter-item">
                        <MessageSquare size={13} /> {proj.commentsCount || 0}
                      </span>
                      <span className="counter-item">
                        <Paperclip size={13} /> {proj.attachmentsCount || 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-subtle">No active projects found in workspace.</p>
            )}
          </div>
        </div>

        {/* Priority Distribution Stacked Bar (US-DASH-003, US-DASH-006) */}
        <div className="dashboard-card task-distribution-card">
          <div className="dashboard-card-header">
            <div className="card-title-group">
              <Flame size={18} className="text-orange" />
              <h3>Priority Distribution</h3>
            </div>
            <span className="card-counter-tag">{dist.total} Tasks</span>
          </div>
          {/* Stacked multi-segment bar */}
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
                title="Filter tasks by Urgent"
              >
                <div className="legend-header">
                  <span className="legend-dot dot-urgent" />
                  <span>Urgent</span>
                </div>
                <small className="legend-pct">({dist.urgentPct}%)</small>
                <strong className="legend-count">{dist.urgent}</strong>
              </div>

              <div
                className="legend-item clickable"
                onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "HIGH" })}
                title="Filter tasks by High"
              >
                <div className="legend-header">
                  <span className="legend-dot dot-high" />
                  <span>High</span>
                </div>
                <small className="legend-pct">({dist.highPct}%)</small>
                <strong className="legend-count">{dist.high}</strong>
              </div>

              <div
                className="legend-item clickable"
                onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "MEDIUM" })}
                title="Filter tasks by Medium"
              >
                <div className="legend-header">
                  <span className="legend-dot dot-med" />
                  <span>Medium</span>
                </div>
                <small className="legend-pct">({dist.medPct}%)</small>
                <strong className="legend-count">{dist.medium}</strong>
              </div>

              <div
                className="legend-item clickable"
                onClick={() => onNavigateToTasks && onNavigateToTasks({ priority: "LOW" })}
                title="Filter tasks by Low"
              >
                <div className="legend-header">
                  <span className="legend-dot dot-low" />
                  <span>Low</span>
                </div>
                <small className="legend-pct">({dist.lowPct}%)</small>
                <strong className="legend-count">{dist.low}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Row: Urgent 48h Tasks, Activity Feed & 90-Day Contribution Heatmap */}
      <div className="dashboard-bottom-row">
        {/* Urgent Tasks Due Within 48 Hours Feed (US-DASH-002, US-DASH-004) */}
        <div className="dashboard-card urgent-tasks-card">
          <div className="dashboard-card-header">
            <div className="card-title-group">
              <Clock size={18} className="text-rose" />
              <h3>48h Urgent Tasks Feed</h3>
            </div>
            <span className="card-counter-tag tag-urgent">{urgentTasks.length} Imminent</span>
          </div>
          <div className="urgent-tasks-list">
            {urgentTasks.length > 0 ? (
              urgentTasks.map((task) => {
                const isDone = task.status === "DONE" || completedTaskIds.has(task.id);
                const dueInfo = getDueTimeLabel(task.dueDate);
                return (
                  <div
                    key={task.id}
                    className={`urgent-task-item ${isDone ? "is-done" : ""} ${
                      dueInfo.isOverdue ? "is-overdue" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`task-quick-check-btn ${isDone ? "checked" : ""}`}
                      onClick={(e) => handleQuickComplete(e, task)}
                      title={isDone ? "Task completed" : "Click to mark task as Done"}
                      aria-label={`Mark ${task.title} as completed`}
                    >
                      {isDone && <Check size={13} />}
                    </button>

                    <div className="urgent-task-details">
                      <div className="urgent-task-top-meta">
                        {task.project?.key && (
                          <span className="project-key-tag mini">{task.project.key}</span>
                        )}
                        <span className={`tag-priority mini tag-${(task.priority || "high").toLowerCase()}`}>
                          {task.priority}
                        </span>
                        <span className={`due-time-badge ${dueInfo.isOverdue ? "overdue" : "imminent"}`}>
                          <Clock size={11} /> {dueInfo.label}
                        </span>
                      </div>
                      <strong className={`urgent-task-title ${isDone ? "strike" : ""}`}>
                        {task.title}
                      </strong>
                    </div>

                    <div className="urgent-task-assignee">
                      {task.assignee ? (
                        <span className="mini-avatar" title={`Assigned to ${task.assignee.name}`}>
                          {task.assignee.name ? task.assignee.name[0] : "A"}
                        </span>
                      ) : (
                        <span className="unassigned-pill">Unassigned</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-feed-placeholder">
                <CheckCircle2 size={24} className="text-emerald" />
                <span>All clear! No urgent tasks pending in the 48-hour delivery window.</span>
              </div>
            )}
          </div>
        </div>

        {/* Recent Workspace Activity Feed Stream (US-DASH-005) */}
        <div className="dashboard-card activity-feed-card">
          <div className="dashboard-card-header">
            <div className="card-title-group">
              <Activity size={18} className="text-blue" />
              <h3>Workspace Activity</h3>
            </div>
            <span className="card-counter-tag">Live Trail</span>
          </div>
          <div className="activity-feed-list">
            {activityFeed.length > 0 ? (
              activityFeed.map((act) => (
                <div key={act.id} className="activity-stream-item">
                  <div className="activity-actor-avatar">
                    {act.actor?.avatarUrl ? (
                      <img src={act.actor.avatarUrl} alt={act.actor.name} className="actor-img" />
                    ) : (
                      <span className="actor-fallback">
                        {act.actor?.name ? act.actor.name[0] : "S"}
                      </span>
                    )}
                  </div>
                  <div className="activity-content">
                    <p className="activity-text">
                      <strong>{act.actor?.name || "System"}</strong>{" "}
                      <span>{formatAuditAction(act.action, act.resourceType)}</span>
                    </p>
                    <div className="activity-meta">
                      <span className="activity-resource-tag">{act.resourceType || "RESOURCE"}</span>
                      <span className="activity-time">{formatRelativeTime(act.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-subtle">No recent audit activity recorded.</p>
            )}
          </div>
        </div>
      </div>

      {/* 4. Full-Width 90-Day Contribution Heatmap (US-DASH-005, US-DASH-006) */}
      <section className="dashboard-card contribution-heatmap-card">
        <div className="dashboard-card-header">
          <div className="card-title-group">
            <Sparkles size={18} className="text-emerald" />
            <div>
              <h3>90-Day Workspace Output Matrix</h3>
              <p className="card-subtitle-desc">
                GitHub-style daily task completions and milestone delivery events over the past 13 weeks
              </p>
            </div>
          </div>
          <div className="heatmap-header-stats">
            <span className="heatmap-stat-item">
              <strong>{heatmap.totalEvents}</strong> Total Deliveries
            </span>
            <span className="heatmap-stat-item">
              <strong>{heatmap.activeDaysCount}</strong> / 91 Active Days
            </span>
          </div>
        </div>

        <div className="heatmap-matrix-wrapper">
          <div className="heatmap-day-labels">
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
          </div>

          <div className="heatmap-grid-scrollable">
            <div className="heatmap-matrix-columns">
              {heatmap.weeks.map((week, wIdx) => (
                <div key={wIdx} className="heatmap-column">
                  {week.map((level, dIdx) => {
                    const dayIndex = wIdx * 7 + dIdx;
                    const dayData = heatmap.days[dayIndex];
                    const tooltipText = dayData
                      ? `${dayData.count} event${dayData.count !== 1 ? "s" : ""} on ${dayData.date}`
                      : `Activity level: ${level}`;
                    return (
                      <div
                        key={dIdx}
                        className={`heatmap-matrix-cell heat-level-${level}`}
                        title={tooltipText}
                        onMouseEnter={() => setActiveTooltip(tooltipText)}
                        onMouseLeave={() => setActiveTooltip(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="heatmap-footer-legend">
          <div className="heatmap-tooltip-display">
            {activeTooltip ? <span>{activeTooltip}</span> : <span>Hover over any day cell to inspect deliverable count</span>}
          </div>
          <div className="heatmap-legend-scales">
            <span className="scale-text">Less</span>
            <span className="heatmap-matrix-cell heat-level-0 mini" />
            <span className="heatmap-matrix-cell heat-level-1 mini" />
            <span className="heatmap-matrix-cell heat-level-2 mini" />
            <span className="heatmap-matrix-cell heat-level-3 mini" />
            <span className="heatmap-matrix-cell heat-level-4 mini" />
            <span className="scale-text">More</span>
          </div>
        </div>
      </section>

      {/* Notification Preferences Modal (US-NOTIF-003 / TG-NOTIF-003) */}
      <NotificationPreferencesModal
        isOpen={showPreferences}
        onClose={() => setShowPreferences(false)}
        activeOrg={activeOrg}
        onShowNotice={onShowNotice}
      />
    </div>
  );
}
