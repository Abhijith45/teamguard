import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
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
  Users,
  X,
  Zap,
} from "lucide-react";
import { api, triggerCsvDownload } from "../../services/api-client.js";
import { LoadingView } from "../../components/LoadingView.jsx";
import {
  canExportReport,
  generateExportFilename,
  formatLeadTimeDays,
} from "./reportsUtils.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes = 0) {
  const b = Number(bytes) || 0;
  if (b === 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function timeAgo(d) {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PRIORITY_COLOR = {
  URGENT: "#EF4444",
  HIGH: "#F97316",
  MEDIUM: "#3B82F6",
  LOW: "#6B7280",
};
const PRIORITY_BG = {
  URGENT: "#FEF2F2",
  HIGH: "#FFF7ED",
  MEDIUM: "#EFF6FF",
  LOW: "#F9FAFB",
};
const STATUS_COLOR = {
  TODO: "#6B7280",
  IN_PROGRESS: "#3B82F6",
  REVISION: "#F59E0B",
  DONE: "#10B981",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color = "#10B981", bg = "#ECFDF5", sub }) {
  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: 10,
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      flex: "1 1 150px",
      minWidth: 140,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {React.cloneElement(icon, { size: 18, color })}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
        <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-text-main)", lineHeight: 1.2 }}>{value ?? "—"}</div>
        {sub && <div style={{ fontSize: "0.7rem", color: "var(--color-text-subtle)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Horizontal stacked bar showing status distribution */
function StatusFunnelBar({ todo = 0, inProgress = 0, revision = 0, done = 0 }) {
  const total = todo + inProgress + revision + done;
  if (total === 0) return <div style={{ color: "var(--color-text-muted)", fontSize: "0.82rem" }}>No tasks yet</div>;
  const pct = (n) => ((n / total) * 100).toFixed(1);
  const segments = [
    { label: "Todo", count: todo, color: STATUS_COLOR.TODO, pct: pct(todo) },
    { label: "In Progress", count: inProgress, color: STATUS_COLOR.IN_PROGRESS, pct: pct(inProgress) },
    { label: "Revision", count: revision, color: STATUS_COLOR.REVISION, pct: pct(revision) },
    { label: "Done", count: done, color: STATUS_COLOR.DONE, pct: pct(done) },
  ].filter((s) => s.count > 0);

  return (
    <div>
      <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", gap: 1 }}>
        {segments.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.count} (${s.pct}%)`}
            style={{ width: `${s.pct}%`, background: s.color, transition: "width 0.4s ease", minWidth: 4 }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", marginTop: 8 }}>
        {segments.map((s) => (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.74rem", color: "var(--color-text-muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label} <strong style={{ color: "var(--color-text-main)" }}>{s.count}</strong>
            <span style={{ color: "var(--color-text-subtle)" }}>({s.pct}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** SVG sparkline/polyline chart for trend data */
function TrendLine({ data = [], color = "#10B981" }) {
  if (!data.length) return null;
  const W = 100; // viewBox width in %
  const H = 60;
  const pad = 4;
  const max = Math.max(...data.map((d) => d.count), 1);

  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
    const y = H - pad - ((d.count / max) * (H - pad * 2));
    return `${x},${y}`;
  }).join(" ");

  const areaPoints = [
    `${pad},${H - pad}`,
    ...data.map((d, i) => {
      const x = pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
      const y = H - pad - ((d.count / max) * (H - pad * 2));
      return `${x},${y}`;
    }),
    `${W - pad},${H - pad}`,
  ].join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#trendGrad)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal workload bar for one member */
function WorkloadBar({ member }) {
  const total = (member.TODO || 0) + (member.IN_PROGRESS || 0) + (member.REVISION || 0);
  const maxBar = 300; // px reference — relative via % 
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-brand, #10B981)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, flexShrink: 0 }}>
        {(member.name || "?").charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>{member.name}</span>
          <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>{total} active</span>
        </div>
        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--color-border)", gap: 1 }}>
          {["TODO", "IN_PROGRESS", "REVISION"].map((s) =>
            member[s] > 0 ? (
              <div
                key={s}
                title={`${s}: ${member[s]}`}
                style={{ width: `${total > 0 ? (member[s] / total) * 100 : 0}%`, background: STATUS_COLOR[s], minWidth: 3, borderRadius: 2 }}
              />
            ) : null
          )}
        </div>
      </div>
      <span style={{ fontSize: "0.68rem", color: "var(--color-text-subtle)", flexShrink: 0, padding: "2px 6px", background: "var(--color-bg)", borderRadius: 4, border: "1px solid var(--color-border)" }}>
        {member.role}
      </span>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AuditReportsView({ currentUser, userPermissions, activeOrg }) {
  const [activeTab, setActiveTab] = useState("overview");

  // ── Overview state
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [trendDays, setTrendDays] = useState(30);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // ── Team state
  const [workload, setWorkload] = useState(null);
  const [memberActivity, setMemberActivity] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [activityRange, setActivityRange] = useState("30");

  // ── Security / Audit state
  const [stats, setStats] = useState(null);
  const [actionsList, setActionsList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [inspectLog, setInspectLog] = useState(null);

  // ── Resources state
  const [storageData, setStorageData] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);

  // ── Shared
  const [error, setError] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(null);
  const [exportingVelocity, setExportingVelocity] = useState(false);
  const [exportingAudit, setExportingAudit] = useState(false);

  // ── Permissions
  const permsSet = userPermissions instanceof Set
    ? userPermissions
    : new Set(Array.isArray(userPermissions) ? userPermissions : []);

  const isSuperAdmin = currentUser?.role?.toLowerCase?.().includes("admin") || false;
  const canReadAudit = isSuperAdmin || permsSet.has("audit:read") || permsSet.has("audit:view");
  const canReadMembers = isSuperAdmin || permsSet.has("members:manage") || permsSet.has("members:read") || permsSet.has("members:view") || permsSet.has("member:read");
  const canReadFiles = isSuperAdmin || permsSet.has("files:view") || permsSet.has("files:read") || permsSet.has("file:read") || permsSet.has("file:view");
  const canExportVelocity = canExportReport(userPermissions, "velocity");
  const canExportAudit = canExportReport(userPermissions, "audit");
  const canViewReports = canReadAudit || canExportVelocity || canReadMembers || canReadFiles;

  // ── Data fetchers
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const [sumRes, trendRes] = await Promise.all([
        api.getReportsSummary().catch(() => null),
        api.getReportsTrend(trendDays).catch(() => null),
      ]);
      if (sumRes?.summary) setSummary(sumRes.summary);
      if (trendRes?.trend) setTrend(trendRes.trend);
    } catch {/* silent */} finally {
      setOverviewLoading(false);
    }
  }, [trendDays]);

  const fetchOverdue = useCallback(async () => {
    setOverdueLoading(true);
    try {
      const res = await api.getReportsOverdue(10).catch(() => null);
      if (res?.tasks) setOverdue(res.tasks);
    } catch {/* silent */} finally {
      setOverdueLoading(false);
    }
  }, []);

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const to = new Date().toISOString();
      const from = new Date(Date.now() - Number(activityRange) * 24 * 60 * 60 * 1000).toISOString();
      const [wlRes, maRes] = await Promise.all([
        api.getReportsWorkload().catch(() => null),
        api.getReportsMemberActivity({ from, to }).catch(() => null),
      ]);
      if (wlRes) setWorkload(wlRes);
      if (maRes?.members) setMemberActivity(maRes.members);
    } catch {/* silent */} finally {
      setTeamLoading(false);
    }
  }, [activityRange]);

  const fetchAudit = useCallback(async () => {
    if (!canReadAudit) return;
    setAuditLoading(true);
    try {
      const [statsRes, actionsRes, logsRes] = await Promise.all([
        api.getAuditStats().catch(() => null),
        api.getAuditActions().catch(() => ({ actions: [] })),
        api.getAuditLogs({
          page,
          limit: 15,
          search: search || undefined,
          action: actionFilter || undefined,
          resourceType: resourceFilter || undefined,
          outcome: outcomeFilter || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
        }).catch(() => null),
      ]);
      if (statsRes) setStats(statsRes.data || statsRes);
      if (actionsRes?.actions) setActionsList(actionsRes.actions);
      else if (actionsRes?.data?.actions) setActionsList(actionsRes.data.actions);
      if (logsRes) {
        setLogs(logsRes.data || logsRes.logs || []);
        if (logsRes.pagination) setPagination(logsRes.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load audit logs");
    } finally {
      setAuditLoading(false);
    }
  }, [canReadAudit, page, search, actionFilter, resourceFilter, outcomeFilter, dateFrom, dateTo]);

  const fetchStorage = useCallback(async () => {
    setStorageLoading(true);
    try {
      const res = await api.getReportsStorage().catch(() => null);
      if (res) setStorageData(res);
    } catch {/* silent */} finally {
      setStorageLoading(false);
    }
  }, []);

  // ── Load on tab change
  useEffect(() => {
    if (activeTab === "overview") { fetchOverview(); fetchOverdue(); }
    if (activeTab === "team") fetchTeam();
    if (activeTab === "security") fetchAudit();
    if (activeTab === "resources") fetchStorage();
  }, [activeTab]); // eslint-disable-line

  // Re-fetch audit on filter change
  useEffect(() => {
    if (activeTab === "security") fetchAudit();
  }, [fetchAudit]); // eslint-disable-line

  // Re-fetch trend on day change
  useEffect(() => {
    if (activeTab === "overview") fetchOverview();
  }, [trendDays]); // eslint-disable-line

  // Re-fetch member activity on range change
  useEffect(() => {
    if (activeTab === "team") fetchTeam();
  }, [activityRange]); // eslint-disable-line

  // ── Exports
  const handleExportVelocityCsv = async () => {
    setExportingVelocity(true);
    try {
      const csv = await api.downloadTasksVelocityCsv();
      triggerCsvDownload(csv, generateExportFilename("velocity", activeOrg?.slug));
      setExportSuccess("Task velocity CSV downloaded");
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (e) { setError(e.message); } finally { setExportingVelocity(false); }
  };

  const handleExportAuditCsv = async () => {
    setExportingAudit(true);
    try {
      const csv = await api.downloadAuditComplianceCsv({ action: actionFilter, resourceType: resourceFilter });
      triggerCsvDownload(csv, generateExportFilename("compliance-audit", activeOrg?.slug));
      setExportSuccess("Compliance audit CSV downloaded");
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (e) { setError(e.message); } finally { setExportingAudit(false); }
  };

  const exportJson = () => {
    if (!logs.length) return;
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `teamguard-audit-${activeOrg?.slug || "org"}-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (!canViewReports) {
    return (
      <div className="audit-reports-view">
        <div className="section-placeholder-card">
          <div className="placeholder-lock-icon"><Lock size={36} className="text-amber" /></div>
          <h3>Reports Access Restricted</h3>
          <p>Your current role does not have permission to view workspace reports. Contact an Admin to request access.</p>
        </div>
      </div>
    );
  }

  // ─── Tab definitions ───────────────────────────────────────────────────────
  const tabs = [
    { id: "overview", label: "Overview", icon: <BarChart2 size={15} /> },
    { id: "team", label: "Team", icon: <Users size={15} /> },
    { id: "security", label: "Security", icon: <ShieldCheck size={15} />, locked: !canReadAudit },
    { id: "resources", label: "Resources", icon: <Database size={15} />, locked: !canReadFiles },
  ];

  const isLoading = activeTab === "overview" ? overviewLoading
    : activeTab === "team" ? teamLoading
    : activeTab === "security" ? auditLoading
    : storageLoading;

  return (
    <div className="audit-reports-view" data-testid="audit-reports-view">

      {/* ── Header ── */}
      <div className="reports-header-row">
        <div>
          <h2 className="reports-title">Reports & Analytics</h2>
          <p className="reports-subtitle">Workspace insights, team performance, security audit trail, and storage overview for {activeOrg?.name || "your workspace"}.</p>
        </div>
        <div className="reports-header-actions">
          {activeTab === "overview" && (
            <button type="button" className="btn-primary-emerald" onClick={handleExportVelocityCsv} disabled={exportingVelocity || !canExportVelocity}>
              {exportingVelocity ? <RefreshCw size={13} className="spin-icon" /> : <Download size={13} />}
              {exportingVelocity ? "Exporting…" : "Export CSV"}
            </button>
          )}
          {activeTab === "security" && (
            <>
              <button type="button" className="btn-secondary" onClick={handleExportAuditCsv} disabled={exportingAudit || !canExportAudit}>
                {exportingAudit ? <RefreshCw size={13} className="spin-icon" /> : <Download size={13} />}
                {exportingAudit ? "Streaming…" : "Export Audit CSV"}
              </button>
              <button type="button" className="btn-secondary" onClick={exportJson} disabled={!logs.length}>
                <FileText size={13} /> JSON
              </button>
            </>
          )}
          <button type="button" className="btn-secondary" onClick={() => {
            if (activeTab === "overview") { fetchOverview(); fetchOverdue(); }
            else if (activeTab === "team") fetchTeam();
            else if (activeTab === "security") fetchAudit();
            else fetchStorage();
          }} disabled={isLoading}>
            <RefreshCw size={13} className={isLoading ? "spin-icon" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Tab Nav ── */}
      <div style={{ display: "flex", gap: 4, margin: "14px 0 16px", borderBottom: "1px solid var(--color-border)", paddingBottom: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => !t.locked && setActiveTab(t.id)}
            disabled={t.locked}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px",
              borderRadius: "6px 6px 0 0",
              border: "none",
              borderBottom: activeTab === t.id ? "2px solid var(--color-brand, #10B981)" : "2px solid transparent",
              background: activeTab === t.id ? "var(--color-surface)" : "transparent",
              color: t.locked ? "var(--color-text-subtle)" : activeTab === t.id ? "var(--color-brand, #10B981)" : "var(--color-text-muted)",
              fontWeight: 600, cursor: t.locked ? "not-allowed" : "pointer", fontSize: "0.83rem",
              transition: "all 0.15s",
              opacity: t.locked ? 0.5 : 1,
            }}
          >
            {t.icon} {t.label}
            {t.locked && <Lock size={11} style={{ marginLeft: 2 }} />}
          </button>
        ))}
      </div>

      {/* ── Banners ── */}
      {exportSuccess && (
        <div style={{ padding: "9px 14px", marginBottom: 12, borderRadius: 8, background: "#ECFDF5", border: "1px solid #10B981", color: "#065F46", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={15} color="#10B981" /> <span>{exportSuccess}</span>
        </div>
      )}
      {error && (
        <div style={{ padding: "9px 14px", marginBottom: 12, borderRadius: 8, background: "#FEF2F2", border: "1px solid #EF4444", color: "#7F1D1D", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={15} /> <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "inherit" }}><X size={13} /></button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 1 — OVERVIEW
          ══════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {overviewLoading ? <LoadingView compact message="Loading overview…" /> : (
            <>
              {/* KPI Row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <KpiCard icon={<CheckCircle2 />} label="Completion Rate" value={summary ? `${summary.completionRate}%` : "—"} color="#10B981" bg="#ECFDF5" />
                <KpiCard icon={<Layers />} label="Total Tasks" value={summary?.totalTasks?.toLocaleString()} color="#3B82F6" bg="#EFF6FF" />
                <KpiCard icon={<AlertTriangle />} label="Overdue" value={summary?.overdueCount?.toLocaleString()} color="#EF4444" bg="#FEF2F2" sub="Not DONE, past due" />
                <KpiCard icon={<Clock />} label="Avg Lead Time" value={formatLeadTimeDays(summary?.avgLeadTimeDays)} color="#F59E0B" bg="#FFFBEB" />
                <KpiCard icon={<Activity />} label="Active Projects" value={summary?.totalProjects?.toLocaleString()} color="#8B5CF6" bg="#F5F3FF" />
              </div>

              {/* Status Funnel + Priority grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Status Funnel */}
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)", marginBottom: 10 }}>Task Status Distribution</div>
                  <StatusFunnelBar
                    todo={summary?.todoTasks || 0}
                    inProgress={summary?.inProgressTasks || 0}
                    revision={summary?.revisionTasks || 0}
                    done={summary?.completedTasks || 0}
                  />
                </div>

                {/* Priority Breakdown */}
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)", marginBottom: 10 }}>Priority Breakdown</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {["URGENT", "HIGH", "MEDIUM", "LOW"].map((p) => {
                      const count = summary?.priorityBreakdown?.[p] ?? 0;
                      const total = summary?.totalTasks || 1;
                      const pct = ((count / total) * 100).toFixed(0);
                      return (
                        <div key={p} style={{ background: "var(--color-bg)", borderRadius: 8, padding: "10px 12px", border: `1px solid ${PRIORITY_COLOR[p]}44` }}>
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: PRIORITY_COLOR[p], letterSpacing: "0.06em" }}>{p}</div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-text-main)" }}>{count}</div>
                          <div style={{ fontSize: "0.69rem", color: "var(--color-text-muted)" }}>{pct}% of total</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Completion Trend Chart */}
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)" }}>Task Completion Trend</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", marginTop: 2 }}>Tasks completed per day</div>
                  </div>
                  <select
                    value={trendDays}
                    onChange={(e) => setTrendDays(Number(e.target.value))}
                    style={{ fontSize: "0.76rem", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-main)", cursor: "pointer" }}
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={14}>Last 14 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                  </select>
                </div>
                {trend.length > 0 ? (
                  <>
                    <TrendLine data={trend} color="#10B981" />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--color-text-subtle)", marginTop: 4 }}>
                      <span>{trend[0]?.date}</span>
                      <span>{trend[trend.length - 1]?.date}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>No completion data for this period</div>
                )}
              </div>

              {/* Overdue Tasks */}
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)", display: "flex", alignItems: "center", gap: 7 }}>
                    <AlertTriangle size={15} color="#EF4444" /> Overdue Tasks
                    {overdue.length > 0 && <span style={{ background: "#FEF2F2", color: "#EF4444", fontSize: "0.68rem", fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>{overdue.length}</span>}
                  </div>
                </div>
                {overdueLoading ? <LoadingView compact message="Loading…" /> : overdue.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px 0", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                    <CheckCircle2 size={24} color="#10B981" style={{ marginBottom: 6, display: "block", margin: "0 auto 6px" }} />
                    No overdue tasks — great work!
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {overdue.map((t) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--color-border)" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: PRIORITY_COLOR[t.priority] || "#6B7280", background: PRIORITY_BG[t.priority] || "#F9FAFB", padding: "2px 7px", borderRadius: 10, flexShrink: 0 }}>{t.priority}</span>
                        <span style={{ flex: 1, fontSize: "0.78rem", color: "var(--color-text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", flexShrink: 0 }}>{t.projectKey || t.projectName}</span>
                        <span style={{ fontSize: "0.7rem", color: "#EF4444", fontWeight: 600, flexShrink: 0 }}>{t.daysOverdue}d overdue</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--color-text-subtle)", flexShrink: 0 }}>{t.assigneeName || "Unassigned"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 2 — TEAM
          ══════════════════════════════════════════════════════════ */}
      {activeTab === "team" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {teamLoading ? <LoadingView compact message="Loading team data…" /> : (
            <>
              {/* Team KPIs */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <KpiCard icon={<Users />} label="Active Members" value={workload?.members?.length} color="#8B5CF6" bg="#F5F3FF" />
                <KpiCard icon={<Zap />} label="Active Tasks" value={workload?.members?.reduce((s, m) => s + m.total, 0)?.toLocaleString()} color="#3B82F6" bg="#EFF6FF" />
                <KpiCard icon={<AlertTriangle />} label="Unassigned" value={workload?.unassigned?.total?.toLocaleString()} color="#F59E0B" bg="#FFFBEB" sub="Not DONE, no assignee" />
              </div>

              {/* Workload + Activity side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Workload Bars */}
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)", marginBottom: 10 }}>Active Workload by Member</div>
                  {!workload?.members?.length ? (
                    <div style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "16px 0" }}>No active task assignments</div>
                  ) : (
                    workload.members.filter((m) => m.total > 0).slice(0, 15).map((m) => (
                      <WorkloadBar key={m.userId} member={m} />
                    ))
                  )}
                  {workload?.unassigned?.total > 0 && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(245, 158, 11, 0.1)", borderRadius: 6, fontSize: "0.75rem", color: "var(--color-text-main)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                      <AlertTriangle size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />
                      {workload.unassigned.total} task{workload.unassigned.total !== 1 ? "s" : ""} unassigned
                    </div>
                  )}
                </div>

                {/* Member Activity Leaderboard */}
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)" }}>Member Activity</div>
                    <select
                      value={activityRange}
                      onChange={(e) => setActivityRange(e.target.value)}
                      style={{ fontSize: "0.73rem", padding: "3px 7px", borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-main)" }}
                    >
                      <option value="7">Last 7 days</option>
                      <option value="30">Last 30 days</option>
                      <option value="90">Last 90 days</option>
                    </select>
                  </div>
                  <div style={{ overflow: "auto", maxHeight: 320 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                          {["Member", "Created", "Done", "Avg Lead", "Last Active"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "5px 6px", color: "var(--color-text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {memberActivity.map((m) => (
                          <tr key={m.userId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "6px 6px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#10B981", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, flexShrink: 0 }}>
                                  {(m.name || "?").charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: "var(--color-text-main)", whiteSpace: "nowrap" }}>{m.name}</div>
                                  <div style={{ fontSize: "0.65rem", color: "var(--color-text-muted)" }}>{m.role}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "6px 6px", color: "var(--color-text-main)", textAlign: "center" }}>{m.tasksCreated}</td>
                            <td style={{ padding: "6px 6px", textAlign: "center" }}>
                              <span style={{ color: "#10B981", fontWeight: 600 }}>{m.tasksCompleted}</span>
                            </td>
                            <td style={{ padding: "6px 6px", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                              {m.avgLeadDays != null ? `${m.avgLeadDays}d` : "—"}
                            </td>
                            <td style={{ padding: "6px 6px", color: "var(--color-text-subtle)", whiteSpace: "nowrap" }}>{timeAgo(m.lastActive)}</td>
                          </tr>
                        ))}
                        {!memberActivity.length && (
                          <tr><td colSpan={5} style={{ textAlign: "center", padding: "20px 0", color: "var(--color-text-muted)" }}>No activity data</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 3 — SECURITY (Audit Trail)
          ══════════════════════════════════════════════════════════ */}
      {activeTab === "security" && (
        <>
          {!canReadAudit ? (
            <div className="section-placeholder-card">
              <Lock size={32} className="text-amber" />
              <h3>Audit Access Required</h3>
              <p>You need the <code>audit:read</code> permission to view the security audit trail.</p>
            </div>
          ) : (
            <>
              {/* KPI Bar */}
              {stats && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                  <KpiCard icon={<ShieldCheck />} label="Total Events" value={stats.totalEvents?.toLocaleString()} color="#10B981" bg="#ECFDF5" />
                  <KpiCard icon={<Activity />} label="Today" value={stats.todayEvents?.toLocaleString()} color="#3B82F6" bg="#EFF6FF" />
                  <KpiCard icon={<Calendar />} label="Last 7 Days" value={stats.last7DaysEvents?.toLocaleString()} color="#8B5CF6" bg="#F5F3FF" />
                  <KpiCard icon={<ShieldAlert />} label="Failed Events" value={stats.failedEvents?.toLocaleString()} color="#EF4444" bg="#FEF2F2" />
                </div>
              )}

              {/* Failed events spotlight */}
              {stats?.failedEvents > 0 && (
                <div style={{ padding: "9px 14px", marginBottom: 12, borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem" }}>
                  <ShieldAlert size={16} color="#EF4444" />
                  <span style={{ color: "#7F1D1D", flex: 1 }}>
                    <strong>{stats.failedEvents}</strong> failed security events detected.
                  </span>
                  <button type="button" style={{ fontSize: "0.76rem", color: "#EF4444", background: "none", border: "1px solid #EF4444", borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => { setOutcomeFilter("FAILURE"); setPage(1); }}>
                    Show Failures Only
                  </button>
                </div>
              )}

              {/* Filters Bar */}
              <div className="audit-filters-bar">
                <div className="audit-search-wrap">
                  <Search size={13} className="search-icon" />
                  <input
                    type="text"
                    className="audit-search-input"
                    placeholder="Search actor, summary, resource…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                  {search && <button type="button" className="search-clear-btn" onClick={() => setSearch("")}><X size={13} /></button>}
                </div>
                <div className="audit-filter-selects" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <select className="audit-select" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
                    <option value="">All Actions</option>
                    {actionsList.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select className="audit-select" value={resourceFilter} onChange={(e) => { setResourceFilter(e.target.value); setPage(1); }}>
                    <option value="">All Resources</option>
                    {["Task","Subtask","Project","Comment","Role","RolePermission","Membership","FileAsset","Report"].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <select className="audit-select" value={outcomeFilter} onChange={(e) => { setOutcomeFilter(e.target.value); setPage(1); }}>
                    <option value="">All Outcomes</option>
                    <option value="SUCCESS">SUCCESS</option>
                    <option value="FAILURE">FAILURE</option>
                    <option value="DENIED">DENIED</option>
                  </select>
                  <input type="date" className="audit-select" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} title="From date" style={{ padding: "5px 8px" }} />
                  <input type="date" className="audit-select" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} title="To date" style={{ padding: "5px 8px" }} />
                  {(actionFilter || resourceFilter || outcomeFilter || dateFrom || dateTo) && (
                    <button type="button" className="btn-secondary" style={{ fontSize: "0.73rem", padding: "4px 10px" }}
                      onClick={() => { setActionFilter(""); setResourceFilter(""); setOutcomeFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
                      <X size={12} /> Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Audit Table */}
              <div className="audit-table-card">
                {auditLoading ? <LoadingView compact message="Loading audit trail…" /> : logs.length === 0 ? (
                  <div className="audit-table-empty">
                    <FileText size={28} className="text-muted" /><h4>No Audit Records Found</h4>
                    <p>No actions match your current filter criteria.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="audit-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th><th>Actor</th><th>Action</th>
                          <th>Resource</th><th>Outcome</th><th>Summary</th>
                          <th style={{ width: 50 }}>Inspect</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => (
                          <tr key={log.id}>
                            <td className="cell-timestamp">{fmtDateTime(log.createdAt)}</td>
                            <td className="cell-actor"><span className="actor-name">{log.actor?.name || log.actor?.username || "System"}</span></td>
                            <td className="cell-action"><span className="action-badge">{log.action}</span></td>
                            <td className="cell-resource">
                              <span className="resource-tag">{log.resourceType}{log.resourceId ? ` #${log.resourceId}` : ""}</span>
                            </td>
                            <td className="cell-outcome">
                              <span className={`outcome-pill outcome-${(log.outcome || "SUCCESS").toLowerCase()}`}>{log.outcome || "SUCCESS"}</span>
                            </td>
                            <td className="cell-summary"><span className="summary-text">{log.summary}</span></td>
                            <td className="cell-actions">
                              <button type="button" className="btn-icon" onClick={() => setInspectLog(log)} title="Inspect"><Eye size={13} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {pagination?.totalPages > 1 && (
                  <div className="audit-pagination">
                    <span className="pagination-info">
                      Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                    </span>
                    <div className="pagination-buttons">
                      <button type="button" className="pagination-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                        <ChevronLeft size={13} /> Prev
                      </button>
                      <span className="page-indicator">{page} / {pagination.totalPages}</span>
                      <button type="button" className="pagination-btn" onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}>
                        Next <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 4 — RESOURCES (Files & Storage)
          ══════════════════════════════════════════════════════════ */}
      {activeTab === "resources" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!canReadFiles ? (
            <div className="section-placeholder-card">
              <Lock size={32} className="text-amber" /><h3>File Access Required</h3>
              <p>You need the <code>file:read</code> permission to view storage reports.</p>
            </div>
          ) : storageLoading ? <LoadingView compact message="Loading storage data…" /> : (
            <>
              {/* Storage KPIs */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <KpiCard icon={<Database />} label="Total Storage" value={fmtBytes(storageData?.totalBytes)} color="#8B5CF6" bg="#F5F3FF" />
                <KpiCard icon={<FileText />} label="Total Files" value={storageData?.totalFiles?.toLocaleString()} color="#3B82F6" bg="#EFF6FF" />
                <KpiCard icon={<Layers />} label="Largest File" value={fmtBytes(storageData?.largestFileBytes)} color="#F59E0B" bg="#FFFBEB" />
              </div>

              {/* Breakdown by Project + Recent files */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* By Project */}
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)", marginBottom: 10 }}>Storage by Project</div>
                  {!storageData?.breakdown?.length ? (
                    <div style={{ textAlign: "center", padding: "16px 0", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>No files uploaded yet</div>
                  ) : (
                    <div>
                      {storageData.breakdown.map((b, i) => {
                        const maxBytes = storageData.breakdown[0]?.totalBytes || 1;
                        const pct = ((b.totalBytes / maxBytes) * 100).toFixed(0);
                        return (
                          <div key={i} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 3 }}>
                              <span style={{ color: "var(--color-text-main)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>{b.projectName}</span>
                              <span style={{ color: "var(--color-text-muted)" }}>{fmtBytes(b.totalBytes)} · {b.fileCount} file{b.fileCount !== 1 ? "s" : ""}</span>
                            </div>
                            <div style={{ height: 6, background: "var(--color-border)", borderRadius: 3 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: "#8B5CF6", borderRadius: 3, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recent Uploads */}
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-main)", marginBottom: 10 }}>Recent Uploads</div>
                  <div style={{ overflow: "auto", maxHeight: 300 }}>
                    {!storageData?.recentFiles?.length ? (
                      <div style={{ textAlign: "center", padding: "16px 0", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>No files yet</div>
                    ) : storageData.recentFiles.map((f) => (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
                        <FileText size={14} color="#8B5CF6" style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--color-text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                          <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)" }}>{f.projectName} · {f.uploaderName}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: "0.68rem", color: "var(--color-text-muted)" }}>{fmtBytes(f.sizeBytes)}</div>
                          <div style={{ fontSize: "0.65rem", color: "var(--color-text-subtle)" }}>{timeAgo(f.createdAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Inspect Modal ── */}
      {inspectLog && (
        <div className="inspect-modal-overlay" onClick={() => setInspectLog(null)}>
          <div className="inspect-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="inspect-modal-header">
              <div>
                <h3 className="modal-title">Audit Record Details</h3>
                <span className="modal-subtitle">Log #{inspectLog.id}</span>
              </div>
              <button type="button" className="close-btn" onClick={() => setInspectLog(null)}><X size={15} /></button>
            </div>
            <div className="inspect-modal-body">
              <div className="inspect-meta-grid">
                <div><label>Action</label><p>{inspectLog.action}</p></div>
                <div><label>Resource</label><p>{inspectLog.resourceType} {inspectLog.resourceId ? `(${inspectLog.resourceId})` : ""}</p></div>
                <div><label>Actor</label><p>{inspectLog.actor?.name || "System"} ({inspectLog.actor?.email || "n/a"})</p></div>
                <div><label>Timestamp</label><p>{new Date(inspectLog.createdAt).toISOString()}</p></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94A3B8" }}>Detailed Payload</label>
                <pre className="inspect-details-pre">{JSON.stringify(inspectLog.details || {}, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
