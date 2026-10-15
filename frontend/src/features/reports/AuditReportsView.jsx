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
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "../../services/api-client.js";

export default function AuditReportsView({ currentUser, userPermissions, activeOrg }) {
  const [stats, setStats] = useState(null);
  const [actionsList, setActionsList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [page, setPage] = useState(1);

  // Modal inspection
  const [inspectLog, setInspectLog] = useState(null);

  // Check if current user possesses audit:read permission
  const canReadAudit =
    userPermissions instanceof Set
      ? userPermissions.has("audit:read") || userPermissions.has("audit:view")
      : Array.isArray(userPermissions)
      ? userPermissions.includes("audit:read") || userPermissions.includes("audit:view")
      : true; // fallback to server enforcement

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

  useEffect(() => {
    fetchAuditData();
  }, [fetchAuditData]);

  // Export CSV handler
  const exportCsv = () => {
    if (!logs.length) return;
    const headers = ["ID", "Timestamp", "Actor", "Action", "ResourceType", "ResourceId", "Outcome", "Summary"];
    const rows = logs.map((l) => [
      l.id,
      new Date(l.createdAt).toISOString(),
      `"${l.actor?.name || l.actor?.username || "System"}"`,
      `"${l.action}"`,
      `"${l.resourceType}"`,
      `"${l.resourceId || ""}"`,
      `"${l.outcome}"`,
      `"${(l.summary || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `teamguard-audit-${activeOrg?.slug || "org"}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export JSON handler
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

  if (!canReadAudit) {
    return (
      <div className="audit-reports-view">
        <div className="section-placeholder-card">
          <div className="placeholder-lock-icon">
            <Lock size={36} className="text-amber" />
          </div>
          <h3>Compliance & Audit Access Restricted</h3>
          <p>
            Your current role does not possess the <code>audit:read</code> permission required to view
            immutable security event trails and tenant audit logs. Contact an Organization Admin or Super Admin
            to request audit privileges.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="audit-reports-view" data-testid="audit-reports-view">
      {/* Header with Title and Actions */}
      <div className="reports-header-row">
        <div>
          <h2 className="reports-title">Compliance & Security Audit Trail</h2>
          <p className="reports-subtitle">
            Immutable log of role modifications, task mutations, membership events, and tenant access history.
          </p>
        </div>

        <div className="reports-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={exportCsv}
            disabled={logs.length === 0}
            title="Download CSV export"
          >
            <Download size={14} /> Export CSV
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
          <button
            type="button"
            className="btn-primary-emerald"
            onClick={fetchAuditData}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin-icon" : ""} /> Refresh
          </button>
        </div>
      </div>

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
              <span className="kpi-label">Distinct Action Types</span>
              <h3 className="kpi-value">{stats.uniqueActionTypes}</h3>
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="audit-filter-bar">
        <div className="audit-search-field">
          <Search size={15} className="search-icon-inside" />
          <input
            type="text"
            placeholder="Search by actor, action, or payload..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button type="button" className="btn-clear-search" onClick={() => setSearch("")}>
              ×
            </button>
          )}
        </div>

        <div className="audit-dropdown-filters">
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="filter-select"
          >
            <option value="">All Actions ({actionsList.length})</option>
            {actionsList.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          <select
            value={resourceFilter}
            onChange={(e) => {
              setResourceFilter(e.target.value);
              setPage(1);
            }}
            className="filter-select"
          >
            <option value="">All Resources</option>
            <option value="Task">Task</option>
            <option value="Subtask">Subtask</option>
            <option value="Comment">Comment</option>
            <option value="Project">Project</option>
            <option value="Role">Role</option>
            <option value="Member">Member</option>
            <option value="FileAsset">FileAsset</option>
            <option value="Organization">Organization</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="dialog-error-banner" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="audit-table-wrapper">
        <table className="audit-table">
          <thead>
            <tr>
              <th style={{ width: 180 }}>Actor</th>
              <th style={{ width: 140 }}>Action</th>
              <th style={{ width: 120 }}>Resource</th>
              <th>Summary</th>
              <th style={{ width: 100 }}>Outcome</th>
              <th style={{ width: 170 }}>Timestamp</th>
              <th style={{ width: 80, textAlign: "center" }}>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center py-6">
                  <RefreshCw size={20} className="spin-icon text-muted" />
                  <p style={{ marginTop: 8, fontSize: "0.85rem", color: "#94A3B8" }}>
                    Fetching immutable audit trail...
                  </p>
                </td>
              </tr>
            )}

            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8">
                  <ShieldCheck size={32} className="text-muted" style={{ margin: "0 auto 8px" }} />
                  <p style={{ fontWeight: 600, color: "#E2E8F0" }}>No audit log events match criteria</p>
                  <p style={{ fontSize: "0.82rem", color: "#94A3B8" }}>
                    Try clearing search queries or expanding action filters.
                  </p>
                </td>
              </tr>
            )}

            {!loading &&
              logs.map((log) => (
                <tr key={log.id}>
                  {/* Actor */}
                  <td>
                    <div className="table-actor-cell">
                      {log.actor?.avatarUrl ? (
                        <img src={log.actor.avatarUrl} alt="" className="table-actor-avatar" />
                      ) : (
                        <div className="table-actor-initials">
                          {(log.actor?.name || log.actor?.username || "S").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="table-actor-text">
                        <span className="table-actor-name">
                          {log.actor?.name || log.actor?.username || "System"}
                        </span>
                        {log.actor?.email && (
                          <span className="table-actor-email">{log.actor.email}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Action */}
                  <td>
                    <span className="table-action-pill">{log.action}</span>
                  </td>

                  {/* Resource */}
                  <td>
                    <span className="table-resource-pill">
                      {log.resourceType} {log.resourceId ? `#${log.resourceId}` : ""}
                    </span>
                  </td>

                  {/* Summary */}
                  <td className="table-summary-cell">
                    <span>{log.summary || log.action}</span>
                  </td>

                  {/* Outcome */}
                  <td>
                    <span
                      className={`table-outcome-badge ${
                        log.outcome === "SUCCESS" ? "outcome-success" : "outcome-failure"
                      }`}
                    >
                      {log.outcome === "SUCCESS" ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <AlertCircle size={12} />
                      )}
                      <span>{log.outcome}</span>
                    </span>
                  </td>

                  {/* Timestamp */}
                  <td className="table-time-cell">
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                  </td>

                  {/* Inspect Details */}
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="btn-inspect-icon"
                      onClick={() => setInspectLog(log)}
                      title="Inspect full JSON details"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination.totalPages > 1 && (
        <div className="audit-pagination-footer">
          <span className="pagination-info">
            Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} total events)
          </span>

          <div className="pagination-buttons">
            <button
              type="button"
              className="btn-page-nav"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              type="button"
              className="btn-page-nav"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages || loading}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Inspect Modal */}
      {inspectLog && (
        <div className="inspect-modal-backdrop" onClick={() => setInspectLog(null)}>
          <div className="inspect-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="inspect-modal-header">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald" />
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                  Audit Event #{inspectLog.id}
                </h4>
              </div>
              <button
                type="button"
                className="icon-btn-ghost"
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
