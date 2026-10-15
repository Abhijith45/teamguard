import { useEffect, useState } from "react";
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
} from "lucide-react";
import { api } from "../../services/api-client.js";

export function DashboardView({ activeOrg, onNavigateToTasks, onNavigateToProjects }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getDashboard();
        if (mounted) setData(res);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [activeOrg?.id]);

  if (loading) {
    return (
      <div className="view-loading-container">
        <div className="loading-spinner" />
        <span>Loading workspace dashboard…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view-error-container">
        <AlertCircle size={24} className="text-destructive" />
        <p>{error}</p>
      </div>
    );
  }

  const stats = data?.stats ?? { totalProjects: 4, totalTasks: 10, inProgress: 3, completed: 2 };
  const dist = data?.taskDistribution ?? { high: 3, medium: 4, low: 3, total: 10 };
  const recentProjects = data?.recentProjects ?? [];
  const todayTasks = data?.todayTasks ?? [];
  const meetings = data?.upcomingMeetings ?? [];
  const activityMap = data?.activityMap ?? [
    [1, 2, 3, 2, 4],
    [2, 3, 2, 4, 3],
    [1, 2, 4, 3, 2],
    [2, 1, 3, 2, 1],
  ];

  const highPct = Math.round((dist.high / dist.total) * 100) || 30;
  const medPct = Math.round((dist.medium / dist.total) * 100) || 50;
  const lowPct = Math.round((dist.low / dist.total) * 100) || 20;

  return (
    <div className="dashboard-view-layout">
      {/* 1. Stat Cards Row */}
      <section className="dashboard-stats-grid">
        <div className="stat-card" onClick={onNavigateToProjects}>
          <div className="stat-card-header">
            <span className="stat-card-title">Total Projects</span>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.totalProjects}</span>
            <span className="stat-card-label">active projects</span>
          </div>
        </div>

        <div className="stat-card" onClick={onNavigateToTasks}>
          <div className="stat-card-header">
            <span className="stat-card-title">Total Task</span>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.totalTasks}</span>
            <span className="stat-card-label">tasks created</span>
          </div>
        </div>

        <div className="stat-card" onClick={onNavigateToTasks}>
          <div className="stat-card-header">
            <span className="stat-card-title">In Progress</span>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.inProgress}</span>
            <span className="stat-card-label">task</span>
          </div>
        </div>

        <div className="stat-card" onClick={onNavigateToTasks}>
          <div className="stat-card-header">
            <span className="stat-card-title">Completed</span>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-number">{stats.completed}</span>
            <span className="stat-card-label">Task</span>
          </div>
        </div>
      </section>

      {/* 2. Middle Row: Recent Projects & Task Distribution */}
      <div className="dashboard-mid-row">
        {/* Recent Projects */}
        <div className="dashboard-card recent-projects-card">
          <div className="dashboard-card-header">
            <h3>Recent Project</h3>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          <div className="recent-projects-grid">
            {recentProjects.map((proj) => (
              <div key={proj.id} className="project-preview-card">
                <div className="project-preview-top">
                  <span className={`tag-priority tag-${(proj.priority || "medium").toLowerCase()}`}>
                    {proj.priority}
                  </span>
                  <button type="button" className="icon-btn-ghost"><MoreHorizontal size={14} /></button>
                </div>
                <h4 className="project-preview-title">{proj.name}</h4>
                <p className="project-preview-desc">{proj.description}</p>
                <div className="project-progress-container">
                  <div className="project-progress-info">
                    <span>Progress {proj.progress}%</span>
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
                    <span className="counter-item"><MessageSquare size={13} /> {proj.commentsCount || 12}</span>
                    <span className="counter-item"><Paperclip size={13} /> {proj.attachmentsCount || 8}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Distribution */}
        <div className="dashboard-card task-distribution-card">
          <div className="dashboard-card-header">
            <h3>Task Distribution</h3>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          {/* Stacked bar */}
          <div className="stacked-bar-container">
            <div className="stacked-bar-track">
              <div className="stacked-segment segment-high" style={{ width: `${highPct}%` }} title={`High: ${highPct}%`} />
              <div className="stacked-segment segment-med" style={{ width: `${medPct}%` }} title={`Medium: ${medPct}%`} />
              <div className="stacked-segment segment-low" style={{ width: `${lowPct}%` }} title={`Low: ${lowPct}%`} />
            </div>
            <div className="distribution-legend-grid">
              <div className="legend-item">
                <div className="legend-header">
                  <span className="legend-dot dot-high" />
                  <span>High</span>
                </div>
                <small className="legend-pct">({highPct}%)</small>
                <strong className="legend-count">{dist.high}</strong>
              </div>
              <div className="legend-item">
                <div className="legend-header">
                  <span className="legend-dot dot-med" />
                  <span>Medium</span>
                </div>
                <small className="legend-pct">({medPct}%)</small>
                <strong className="legend-count">{dist.medium}</strong>
              </div>
              <div className="legend-item">
                <div className="legend-header">
                  <span className="legend-dot dot-low" />
                  <span>Low</span>
                </div>
                <small className="legend-pct">({lowPct}%)</small>
                <strong className="legend-count">{dist.low}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Row: Today Task, Upcoming Meeting, Time-based Activity Map */}
      <div className="dashboard-bottom-row">
        {/* Today Task */}
        <div className="dashboard-card today-tasks-card">
          <div className="dashboard-card-header">
            <h3>Today Task</h3>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          <div className="today-tasks-list">
            {todayTasks.length > 0 ? (
              todayTasks.map((task) => (
                <div key={task.id} className="today-task-item">
                  <div className="task-icon-box">
                    <ListTodo size={16} className="text-emerald" />
                  </div>
                  <div className="today-task-details">
                    <strong>{task.title}</strong>
                    <p>{task.description || "Task in workspace queue"}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-subtle">No tasks pending for today.</p>
            )}
          </div>
        </div>

        {/* Upcoming Meeting */}
        <div className="dashboard-card upcoming-meetings-card">
          <div className="dashboard-card-header">
            <h3>Upcoming Meeting</h3>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          <div className="upcoming-meetings-list">
            {meetings.map((m) => (
              <div key={m.id} className="meeting-item">
                <div className="meeting-icon-box">
                  <Video size={16} className="text-blue" />
                </div>
                <div className="meeting-details">
                  <strong>{m.title}</strong>
                  <small>{m.date}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Time-Based Activity Map */}
        <div className="dashboard-card activity-map-card">
          <div className="dashboard-card-header">
            <h3>Time-Based Activity Map</h3>
            <button type="button" className="icon-btn-ghost"><MoreHorizontal size={16} /></button>
          </div>
          <div className="heatmap-container">
            <div className="heatmap-grid">
              {activityMap.map((week, wIdx) => (
                <div key={wIdx} className="heatmap-row">
                  {week.map((level, dIdx) => (
                    <div
                      key={dIdx}
                      className={`heatmap-cell heat-level-${level}`}
                      title={`Activity level: ${level}`}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="heatmap-days-header">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
