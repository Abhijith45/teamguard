import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  Layers,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { api, triggerCsvDownload } from "../../services/api-client.js";
import {
  canExportReport,
  generateExportFilename,
  formatLeadTimeDays,
} from "./reportsUtils.js";

export default function AuditReportsView({ currentUser, userPermissions, activeOrg }) {
  // Navigation Tabs: "audit" | "velocity"
  const [activeTab, setActiveTab] = useState("audit");

  // Audit state
  const [stats, setStats] = useState(null);
  const [actionsList, setActionsList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Velocity state
  const [velocitySummary, setVelocitySummary] = useState(null);
  const [velocityLoading, setVelocityLoading] = useState(false);

  // Export progress states
  const [exportingVelocity, setExportingVelocity] = useState(false);
  const [exportingAudit, setExportingAudit] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [page, setPage] = useState(1);

  // Modal inspection
  const [inspectLog, setInspectLog] = useState(null);

  // Permissions evaluation
  const canReadAudit =
    userPermissions instanceof Set
      ? userPermissions.has("audit:read") || userPermissions.has("audit:view")
      : Array.isArray(userPermissions)
      ? userPermissions.includes("audit:read") || userPermissions.includes("audit:view")
      : true;

  const canExportVelocity = canExportReport(userPermissions, "velocity");
  const canExportAudit = canExportReport(userPermissions, "audit");

  const fetchAuditData = useCallback(async () => {
    if (!canReadAudit) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [statsRes, actionsRes, logsRes] = await Promise.all([
        api.getAuditStats().catch(() => ({ data: null })),
        api.getAuditActions().catch(() => ({ data: { actions: [] } })),
        api.getAuditLogs({
          page,
          limit: 15,
          search: search || undefined,
          action: actionFilter || undefined,
          resourceType: resourceFilter || undefined,
        }),
      ]);

      if (statsRes.data) setStats(statsRes.data);
      if (actionsRes.data?.actions) setActionsList(actionsRes.data.actions);
      if (logsRes.data) {
        setLogs(logsRes.data.data || []);
        if (logsRes.data.pagination) setPagination(logsRes.data.pagination);
      }
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.data?.error ||
        err.message ||
        "Failed to load compliance audit logs";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [canReadAudit, page, search, actionFilter, resourceFilter]);

  const fetchVelocityData = useCallback(async () => {
    setVelocityLoading(true);
    try {
      const res = await api.getReportsSummary();
      if (res?.summary) setVelocitySummary(res.summary);
    } catch {
      // Fallback
    } finally {
      setVelocityLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditData();
    fetchVelocityData();
  }, [fetchAuditData, fetchVelocityData]);

  // Server-side CSV exports (TASK-507 / DP-REP-001)
  const handleExportVelocityCsv = async () => {
    setExportingVelocity(true);
    setExportSuccess(null);
    try {
      const csvData = await api.downloadTasksVelocityCsv();
      const filename = generateExportFilename("velocity", activeOrg?.slug);
      triggerCsvDownload(csvData, filename);
      setExportSuccess("Task velocity CSV downloaded successfully");
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err) {
      setError(err.message || "Failed to download task velocity CSV");
    } finally {
      setExportingVelocity(false);
    }
  };

  const handleExportAuditCsv = async () => {
    setExportingAudit(true);
    setExportSuccess(null);
    try {
      const csvData = await api.downloadAuditComplianceCsv({
        action: actionFilter || undefined,
        resourceType: resourceFilter || undefined,
      });
      const filename = generateExportFilename("compliance-audit", activeOrg?.slug);
      triggerCsvDownload(csvData, filename);
      setExportSuccess("Compliance audit CSV downloaded successfully");
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err) {
      setError(err.message || "Failed to download compliance audit CSV");
    } finally {
      setExportingAudit(false);
    }
  };

  // Client-side quick exports
  const exportCsv = () => {
    handleExportAuditCsv();
  };

  const exportJson = () => {
    if (!logs.length) return;
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `teamguard-audit-${activeOrg?.slug || "org"}-${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If user lacks both audit viewing and velocity export
  if (!canReadAudit && !canExportVelocity) {
    return (
      <div className="audit-reports-view">
        <div className="section-placeholder-card">
          <div className="placeholder-lock-icon">
            <Lock size={36} className="text-amber" />
          </div>
          <h3>Compliance & Audit Access Restricted</h3>
          <p>
            Your current role does not possess the <code>audit:read</code> or <code>report:export</code> permission
            required to view immutable security event trails or download workspace analytics. Contact an Organization
            Admin to request reporting privileges.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="audit-reports-view" data-testid="audit-reports-view">
      {/* Header with Title and Server Actions */}
      <div className="reports-header-row">
        <div>
          <h2 className="reports-title">
            {activeTab === "audit" ? "Compliance & Security Audit Trail" : "Workspace Velocity & Completion Rates"}
          </h2>
          <p className="reports-subtitle">
            {activeTab === "audit"
              ? "Immutable log of role modifications, task mutations, membership events, and tenant access history."
              : "Quantitative productivity analytics, task cycle velocity, and milestone completion metrics."}
          </p>
        </div>

        <div className="reports-header-actions">
          {activeTab === "velocity" ? (
            <button
              type="button"
              className="btn-primary-emerald"
              onClick={handleExportVelocityCsv}
              disabled={exportingVelocity || !canExportVelocity}
              title="Stream server task velocity CSV"
            >
              {exportingVelocity ? (
                <RefreshCw size={14} className="spin-icon" />
              ) : (
                <Download size={14} />
              )}
              {exportingVelocity ? "Exporting..." : "Export Velocity (CSV)"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleExportAuditCsv}
                disabled={exportingAudit || !canExportAudit}
                title="Download full server audit CSV"
              >
                {exportingAudit ? (
                  <RefreshCw size={14} className="spin-icon" />
                ) : (
                  <Download size={14} />
                )}
                {exportingAudit ? "Streaming..." : "Export Audit (CSV)"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={exportJson}
                disabled={logs.length === 0}
                title="Download JSON export"
              >
                <FileText size={14} /> Export JSON
              </button>
            </>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={activeTab === "velocity" ? fetchVelocityData : fetchAuditData}
            disabled={loading || velocityLoading}
          >
            <RefreshCw size={14} className={loading || velocityLoading ? "spin-icon" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div
        className="reports-tab-nav"
        style={{
          display: "flex",
          gap: "8px",
          margin: "18px 0 14px",
          borderBottom: "1px solid #E2E8F0",
          paddingBottom: "10px",
        }}
      >
        <button
          type="button"
          className={`tab-btn ${activeTab === "audit" ? "active" : ""}`}
          onClick={() => setActiveTab("audit")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background: activeTab === "audit" ? "#0F172A" : "transparent",
            color: activeTab === "audit" ? "#FFFFFF" : "#64748B",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "0.86rem",
            transition: "all 0.15s ease",
          }}
        >
          <ShieldCheck size={16} /> Security Audit Trail
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "velocity" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("velocity");
            if (!velocitySummary) fetchVelocityData();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background: activeTab === "velocity" ? "#0F172A" : "transparent",
            color: activeTab === "velocity" ? "#FFFFFF" : "#64748B",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "0.86rem",
            transition: "all 0.15s ease",
          }}
        >
          <TrendingUp size={16} /> Velocity & Completion Rates
        </button>
      </div>

      {/* Success Notification Banner */}
      {exportSuccess && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: "16px",
            borderRadius: "8px",
            background: "#ECFDF5",
            border: "1px solid #10B981",
            color: "#065F46",
            fontSize: "0.84rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} className="text-emerald" />
          <span>{exportSuccess}</span>
        </div>
      )}

      {/* ERROR Banner */}
      {error && (
        <div className="reports-error-banner" style={{ margin: "12px 0", color: "#DC2626" }}>
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* TAB 1: VELOCITY & COMPLETION RATES */}
      {activeTab === "velocity" && (
        <div className="reports-velocity-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Velocity KPI Grid */}
          <div className="audit-kpi-grid">
            <div className="audit-kpi-card">
              <div className="kpi-icon-wrap bg-emerald-dim">
                <CheckCircle2 size={20} className="text-emerald" />
              </div>
              <div>
                <span className="kpi-label">Completion Rate</span>
                <h3 className="kpi-value">{velocitySummary ? `${velocitySummary.completionRate}%` : "—"}</h3>
              </div>
            </div>

            <div className="audit-kpi-card">
              <div className="kpi-icon-wrap bg-blue-dim">
                <Activity size={20} className="text-blue" />
              </div>
              <div>
                <span className="kpi-label">Total Tasks</span>
                <h3 className="kpi-value">{velocitySummary ? velocitySummary.totalTasks.toLocaleString() : "—"}</h3>
              </div>
            </div>

            <div className="audit-kpi-card">
              <div className="kpi-icon-wrap bg-purple-dim">
                <TrendingUp size={20} className="text-purple" />
              </div>
              <div>
                <span className="kpi-label">Completed Tasks</span>
                <h3 className="kpi-value">{velocitySummary ? velocitySummary.completedTasks.toLocaleString() : "—"}</h3>
              </div>
            </div>

            <div className="audit-kpi-card">
              <div className="kpi-icon-wrap bg-amber-dim">
                <Layers size={20} className="text-amber" />
              </div>
              <div>
                <span className="kpi-label">Avg Lead Time</span>
                <h3 className="kpi-value">
                  {velocitySummary ? formatLeadTimeDays(velocitySummary.avgLeadTimeDays) : "—"}
                </h3>
              </div>
            </div>
          </div>

          {/* Velocity Highlights Overview Box */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              padding: "20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0F172A" }}>
                  Workspace Velocity Overview
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#64748B" }}>
                  Summary of deliverable milestones across all active projects in {activeOrg?.name || "the workspace"}.
                </p>
              </div>
              <button
                type="button"
                className="btn-primary-emerald"
                onClick={handleExportVelocityCsv}
                disabled={exportingVelocity || !canExportVelocity}
              >
                <Download size={14} /> Export Detailed CSV
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #F1F5F9" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748B" }}>ACTIVE PROJECTS</span>
                <h4 style={{ margin: "4px 0 0", fontSize: "1.3rem", fontWeight: 700, color: "#0F172A" }}>
                  {velocitySummary?.totalProjects ?? 0}
                </h4>
              </div>
              <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #F1F5F9" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748B" }}>IN PROGRESS WORK</span>
                <h4 style={{ margin: "4px 0 0", fontSize: "1.3rem", fontWeight: 700, color: "#2563EB" }}>
                  {velocitySummary?.inProgressTasks ?? 0} tasks
                </h4>
              </div>
              <div style={{ padding: "14px", background: "#F8FAFC", borderRadius: "8px", border: "1px solid #F1F5F9" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748B" }}>TOTAL AUDITED ACTIONS</span>
                <h4 style={{ margin: "4px 0 0", fontSize: "1.3rem", fontWeight: 700, color: "#059669" }}>
                  {velocitySummary?.totalAuditLogs ?? 0} events
                </h4>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT TRAIL */}
      {activeTab === "audit" && (
        <>
          {/* KPI Cards Row */}
          {stats && (
            <div className="audit-kpi-grid">
              <div className="audit-kpi-card">
                <div className="kpi-icon-wrap bg-emerald-dim">
                  <ShieldCheck size={20} className="text-emerald" />
                </div>
                <div>
                  <span className="kpi-label">Total Audit Events</span>
                  <h3 className="kpi-value">{stats.totalEvents.toLocaleString()}</h3>
                </div>
              </div>

              <div className="audit-kpi-card">
                <div className="kpi-icon-wrap bg-blue-dim">
                  <Activity size={20} className="text-blue" />
                </div>
                <div>
                  <span className="kpi-label">Today's Events</span>
                  <h3 className="kpi-value">{stats.todayEvents.toLocaleString()}</h3>
                </div>
              </div>

              <div className="audit-kpi-card">
                <div className="kpi-icon-wrap bg-purple-dim">
                  <Calendar size={20} className="text-purple" />
                </div>
                <div>
                  <span className="kpi-label">Last 7 Days</span>
                  <h3 className="kpi-value">{stats.last7DaysEvents.toLocaleString()}</h3>
                </div>
              </div>

              <div className="audit-kpi-card">
                <div className="kpi-icon-wrap bg-amber-dim">
                  <ShieldAlert size={20} className="text-amber" />
                </div>
                <div>
                  <span className="kpi-label">Failed Events</span>
                  <h3 className="kpi-value">{stats.failedEvents.toLocaleString()}</h3>
                </div>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <div className="audit-filters-bar">
            <div className="audit-search-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="audit-search-input"
                placeholder="Search actor, summary, or resource..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="audit-filter-selects">
              <select
                className="audit-select"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Actions</option>
                {actionsList.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <select
                className="audit-select"
                value={resourceFilter}
                onChange={(e) => {
                  setResourceFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Resources</option>
                <option value="Task">Task</option>
                <option value="Subtask">Subtask</option>
                <option value="Project">Project</option>
                <option value="Comment">Comment</option>
                <option value="Role">Role</option>
                <option value="RolePermission">RolePermission</option>
                <option value="Membership">Membership</option>
                <option value="FileAsset">FileAsset</option>
                <option value="Report">Report</option>
              </select>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="audit-table-card">
            {loading ? (
              <div className="audit-table-loading">
                <RefreshCw size={24} className="spin-icon text-muted" />
                <p>Loading audit trail...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="audit-table-empty">
                <FileText size={32} className="text-muted" />
                <h4>No Audit Records Found</h4>
                <p>No actions match your current search and filter criteria.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Resource</th>
                      <th>Outcome</th>
                      <th>Summary</th>
                      <th style={{ width: 60 }}>Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="cell-timestamp">
                          {new Date(log.createdAt).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="cell-actor">
                          <span className="actor-name">
                            {log.actor?.name || log.actor?.username || "System"}
                          </span>
                        </td>
                        <td className="cell-action">
                          <span className="action-badge">{log.action}</span>
                        </td>
                        <td className="cell-resource">
                          <span className="resource-tag">
                            {log.resourceType}
                            {log.resourceId ? ` #${log.resourceId}` : ""}
                          </span>
                        </td>
                        <td className="cell-outcome">
                          <span
                            className={`outcome-pill outcome-${(
                              log.outcome || "SUCCESS"
                            ).toLowerCase()}`}
                          >
                            {log.outcome || "SUCCESS"}
                          </span>
                        </td>
                        <td className="cell-summary">
                          <span className="summary-text">{log.summary}</span>
                        </td>
                        <td className="cell-actions">
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => setInspectLog(log)}
                            title="Inspect log JSON payload"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="audit-pagination">
                <span className="pagination-info">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                  {pagination.total} records
                </span>

                <div className="pagination-buttons">
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <span className="page-indicator">
                    {page} / {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Inspect Modal */}
      {inspectLog && (
        <div className="inspect-modal-overlay" onClick={() => setInspectLog(null)}>
          <div
            className="inspect-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="inspect-modal-header">
              <div>
                <h3 className="modal-title">Audit Record Details</h3>
                <span className="modal-subtitle">Log #{inspectLog.id}</span>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setInspectLog(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="inspect-modal-body">
              <div className="inspect-meta-grid">
                <div>
                  <label>Action</label>
                  <p>{inspectLog.action}</p>
                </div>
                <div>
                  <label>Resource</label>
                  <p>{inspectLog.resourceType} {inspectLog.resourceId ? `(${inspectLog.resourceId})` : ""}</p>
                </div>
                <div>
                  <label>Actor</label>
                  <p>{inspectLog.actor?.name || "System"} ({inspectLog.actor?.email || "n/a"})</p>
                </div>
                <div>
                  <label>Timestamp</label>
                  <p>{new Date(inspectLog.createdAt).toISOString()}</p>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94A3B8" }}>
                  Detailed Payload
                </label>
                <pre className="inspect-details-pre">
                  {JSON.stringify(inspectLog.details || {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
