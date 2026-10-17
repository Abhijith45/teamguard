import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Users,
  CheckCircle2,
  RefreshCw,
  Clock,
  Key,
  Lock,
  Unlock,
  Hash,
  Copy,
  Check,
  X,
  Send,
  FileCheck2,
  FolderGit2,
} from "lucide-react";
import { api } from "../../services/api-client.js";

export function PlatformAdminView({ currentUser, onShowNotice }) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalTenants: 0,
    activeTenants: 0,
    suspendedTenants: 0,
    totalUsers: 0,
  });
  const [tenants, setTenants] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [chainIntegrity, setChainIntegrity] = useState({ chainValid: true, verifiedRecordCount: 0 });
  const [activeTab, setActiveTab] = useState("tenants"); // "tenants" | "audit"

  // Break-glass modal state
  const [breakGlassModalOpen, setBreakGlassModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [mfaVerified, setMfaVerified] = useState(false);
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaSecondsLeft, setMfaSecondsLeft] = useState(0);
  const [ticketId, setTicketId] = useState("");
  const [justification, setJustification] = useState("");
  const [designatedMemberId, setDesignatedMemberId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [breakGlassResult, setBreakGlassResult] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);

  // Suspension confirmation state
  const [suspensionModalOpen, setSuspensionModalOpen] = useState(false);
  const [targetTenantToSuspend, setTargetTenantToSuspend] = useState(null);
  const [suspensionReason, setSuspensionReason] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [tenantsRes, auditRes] = await Promise.all([
        api.getPlatformTenants(),
        api.getPlatformAuditLogs(),
      ]);

      if (tenantsRes?.metrics) setMetrics(tenantsRes.metrics);
      if (tenantsRes?.tenants) setTenants(tenantsRes.tenants);
      if (auditRes?.logs) setAuditLogs(auditRes.logs);
      if (auditRes?.integrity) setChainIntegrity(auditRes.integrity);
    } catch (err) {
      if (onShowNotice) {
        onShowNotice({
          type: "error",
          message: `Failed to load platform data: ${err.message}`,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [onShowNotice]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // MFA 5-minute countdown timer
  useEffect(() => {
    if (!mfaVerified || mfaSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setMfaSecondsLeft((prev) => {
        if (prev <= 1) {
          setMfaVerified(false);
          setMfaToken(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [mfaVerified, mfaSecondsLeft]);

  function handleOpenBreakGlass(tenant) {
    setSelectedTenant(tenant);
    setTotpCode("");
    setMfaVerified(false);
    setMfaToken(null);
    setMfaSecondsLeft(0);
    setTicketId("");
    setJustification("");
    setDesignatedMemberId(tenant.owners?.[0]?.id || "");
    setBreakGlassResult(null);
    setBreakGlassModalOpen(true);
  }

  async function handleVerifyMfa() {
    if (!totpCode || totpCode.trim().length !== 6) {
      onShowNotice?.({
        type: "error",
        message: "Please enter a valid 6-digit TOTP code.",
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.verifyPlatformMfa(totpCode.trim(), selectedTenant.id);
      setMfaVerified(true);
      setMfaToken(res.mfaToken);
      setMfaSecondsLeft(res.expiresInSeconds || 300);
      onShowNotice?.({
        type: "success",
        message: "Step-up MFA verified successfully. Valid for 5 minutes.",
      });
    } catch (err) {
      onShowNotice?.({
        type: "error",
        message: `MFA Step-Up Failed: ${err.message}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExecuteBreakGlass(e) {
    e?.preventDefault();
    if (!mfaToken) {
      onShowNotice?.({ type: "error", message: "MFA verification is required before executing break-glass." });
      return;
    }

    if (!ticketId || !/^TG-[0-9]{4,8}$/.test(ticketId.trim())) {
      onShowNotice?.({ type: "error", message: "ITSM ticket ID must match format TG-XXXX (4-8 digits)." });
      return;
    }

    if (!justification || justification.trim().length < 20) {
      onShowNotice?.({ type: "error", message: "Justification must be at least 20 characters documenting reason." });
      return;
    }

    if (!designatedMemberId) {
      onShowNotice?.({ type: "error", message: "Please select an active member of the target tenant." });
      return;
    }

    try {
      setSubmitting(true);
      const result = await api.executeBreakGlass({
        targetOrganizationId: selectedTenant.id,
        designatedMemberId: Number(designatedMemberId),
        ticketId: ticketId.trim(),
        justification: justification.trim(),
        mfaToken,
      });

      setBreakGlassResult(result);
      onShowNotice?.({
        type: "success",
        message: "Emergency break-glass recovery executed. Super Admin role assigned.",
      });
      loadData();
    } catch (err) {
      onShowNotice?.({
        type: "error",
        message: `Break-Glass Execution Failed: ${err.message}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenSuspensionModal(tenant) {
    setTargetTenantToSuspend(tenant);
    setSuspensionReason(tenant.isSuspended ? "" : "Administrative compliance review");
    setSuspensionModalOpen(true);
  }

  async function handleConfirmSuspension() {
    if (!targetTenantToSuspend) return;
    try {
      setSubmitting(true);
      const newSuspendedState = !targetTenantToSuspend.isSuspended;
      await api.updateTenantStatus(
        targetTenantToSuspend.id,
        newSuspendedState,
        suspensionReason.trim() || undefined
      );

      onShowNotice?.({
        type: "success",
        message: `Tenant ${targetTenantToSuspend.name} ${newSuspendedState ? "suspended" : "reactivated"} successfully.`,
      });
      setSuspensionModalOpen(false);
      loadData();
    } catch (err) {
      onShowNotice?.({
        type: "error",
        message: `Failed to update tenant status: ${err.message}`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function copyToClipboard(text, id) {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2500);
  }

  return (
    <div className="platform-admin-container" style={{ padding: "24px 32px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Platform Operator Governance Banner */}
      <div
        className="platform-banner"
        style={{
          background: "linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "12px",
          padding: "20px 24px",
          marginBottom: "28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444",
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: "700", color: "#f8fafc" }}>
                Platform Super Admin Governance & Break-Glass Recovery
              </h2>
              <span
                style={{
                  background: "rgba(239, 68, 68, 0.2)",
                  color: "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Decision UD-001 (Option B)
              </span>
            </div>
            <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "0.875rem" }}>
              Global tenant oversight with fail-closed segregation. Emergency recovery is strictly limited to Owner reassignment with SHA-256 hash chaining.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            <ShieldCheck size={16} />
            <span>Audit Chain: {chainIntegrity.chainValid ? "Verified (Valid)" : "Tampered"}</span>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={loadData}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Aggregate KPI Stat Cards */}
      <div
        className="platform-kpi-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <div className="stat-card" style={{ background: "rgba(30, 41, 59, 0.7)", border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "10px", padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase" }}>Total Tenants</span>
            <Building2 size={20} style={{ color: "#38bdf8" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "700", color: "#f8fafc" }}>{metrics.totalTenants}</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Multi-tenant workspaces</div>
        </div>

        <div className="stat-card" style={{ background: "rgba(30, 41, 59, 0.7)", border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "10px", padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase" }}>Active Tenants</span>
            <CheckCircle2 size={20} style={{ color: "#10b981" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "700", color: "#10b981" }}>{metrics.activeTenants}</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Operational & healthy</div>
        </div>

        <div className="stat-card" style={{ background: "rgba(30, 41, 59, 0.7)", border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "10px", padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase" }}>Suspended</span>
            <AlertTriangle size={20} style={{ color: "#f59e0b" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "700", color: metrics.suspendedTenants > 0 ? "#f59e0b" : "#94a3b8" }}>
            {metrics.suspendedTenants}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Administrative hold</div>
        </div>

        <div className="stat-card" style={{ background: "rgba(30, 41, 59, 0.7)", border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "10px", padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase" }}>Total Users</span>
            <Users size={20} style={{ color: "#a855f7" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: "700", color: "#f8fafc" }}>{metrics.totalUsers}</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Active platform accounts</div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(148, 163, 184, 0.2)", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("tenants")}
          style={{
            padding: "10px 20px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "tenants" ? "2px solid #ef4444" : "2px solid transparent",
            color: activeTab === "tenants" ? "#f8fafc" : "#94a3b8",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Building2 size={16} />
          <span>Tenants Overview ({tenants.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          style={{
            padding: "10px 20px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "audit" ? "2px solid #ef4444" : "2px solid transparent",
            color: activeTab === "audit" ? "#f8fafc" : "#94a3b8",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Hash size={16} />
          <span>Platform Audit Trail ({auditLogs.length})</span>
        </button>
      </div>

      {/* Tab 1: Tenants Overview Table */}
      {activeTab === "tenants" && (
        <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "rgba(30, 41, 59, 0.8)", borderBottom: "1px solid rgba(148, 163, 184, 0.15)", color: "#94a3b8" }}>
                <th style={{ padding: "12px 16px" }}>Organization</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }}>Members</th>
                <th style={{ padding: "12px 16px" }}>Projects</th>
                <th style={{ padding: "12px 16px" }}>Designated Super Admins</th>
                <th style={{ padding: "12px 16px" }}>Created</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const isSuspended = Boolean(tenant.isSuspended);
                return (
                  <tr
                    key={tenant.id}
                    style={{
                      borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: "600", color: "#f8fafc" }}>{tenant.name}</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>slug: {tenant.slug} (ID: {tenant.id})</div>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      {isSuspended ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#fbbf24",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                          }}
                        >
                          <Lock size={12} />
                          Suspended
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#34d399",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                          }}
                        >
                          <CheckCircle2 size={12} />
                          Active
                        </span>
                      )}
                    </td>

                    <td style={{ padding: "14px 16px", color: "#cbd5e1" }}>
                      {tenant.activeMemberCount} members
                    </td>

                    <td style={{ padding: "14px 16px", color: "#cbd5e1" }}>
                      {tenant.activeProjectCount} projects
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      {tenant.owners && tenant.owners.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {tenant.owners.map((owner) => (
                            <div key={owner.id} style={{ fontSize: "12px", color: "#cbd5e1" }}>
                              <strong>{owner.name}</strong> <span style={{ color: "#64748b" }}>({owner.email})</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#f87171", fontSize: "12px", fontStyle: "italic" }}>
                          No Super Admin (Orphaned!)
                        </span>
                      )}
                    </td>

                    <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "12px" }}>
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>

                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleOpenSuspensionModal(tenant)}
                          style={{
                            padding: "6px 10px",
                            fontSize: "12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {isSuspended ? <Unlock size={13} /> : <Lock size={13} />}
                          <span>{isSuspended ? "Reactivate" : "Suspend"}</span>
                        </button>

                        <button
                          type="button"
                          className="btn-primary-emerald"
                          onClick={() => handleOpenBreakGlass(tenant)}
                          style={{
                            padding: "6px 12px",
                            fontSize: "12px",
                            background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                            border: "1px solid #ef4444",
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                          title="Execute audited emergency break-glass recovery"
                        >
                          <ShieldAlert size={13} />
                          <span>Break-Glass</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Platform Audit Trail Table */}
      {activeTab === "audit" && (
        <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "rgba(30, 41, 59, 0.5)", borderBottom: "1px solid rgba(148, 163, 184, 0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "#94a3b8" }}>
              Immutable append-only ledger protected with cryptographic SHA-256 hash chaining.
            </span>
            <span style={{ fontSize: "12px", color: "#10b981", fontWeight: "600" }}>
              Chain Integrity: {chainIntegrity.verifiedRecordCount} records verified
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "rgba(30, 41, 59, 0.8)", borderBottom: "1px solid rgba(148, 163, 184, 0.15)", color: "#94a3b8" }}>
                <th style={{ padding: "12px 16px" }}>Timestamp</th>
                <th style={{ padding: "12px 16px" }}>Operator</th>
                <th style={{ padding: "12px 16px" }}>Target Tenant</th>
                <th style={{ padding: "12px 16px" }}>Ticket ID</th>
                <th style={{ padding: "12px 16px" }}>Action</th>
                <th style={{ padding: "12px 16px" }}>Justification</th>
                <th style={{ padding: "12px 16px" }}>SHA-256 Hash</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                  <td style={{ padding: "12px 16px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#f8fafc" }}>
                    {log.operator?.name || `Operator #${log.operatorId}`}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#cbd5e1" }}>
                    {log.targetOrganization?.name || `Tenant #${log.targetOrganizationId}`}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <code style={{ background: "rgba(148, 163, 184, 0.15)", padding: "2px 6px", borderRadius: "4px", color: "#38bdf8" }}>
                      {log.ticketId}
                    </code>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "700",
                        background: log.action.includes("BREAK_GLASS") ? "rgba(239, 68, 68, 0.2)" : "rgba(59, 130, 246, 0.2)",
                        color: log.action.includes("BREAK_GLASS") ? "#f87171" : "#60a5fa",
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#cbd5e1", maxWidth: "260px" }}>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={log.justification}>
                      {log.justification}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <code style={{ fontSize: "11px", color: "#a5b4fc" }}>
                        {log.currentHash.substring(0, 12)}…{log.currentHash.substring(56)}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(log.currentHash, log.id)}
                        style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "2px" }}
                        title="Copy full SHA-256 hash"
                      >
                        {copiedHash === log.id ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                    No platform audit events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Emergency Break-Glass Modal */}
      {breakGlassModalOpen && selectedTenant && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            className="modal-container"
            style={{
              background: "#0f172a",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "680px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(15, 23, 42, 0.9) 100%)",
                padding: "20px 24px",
                borderBottom: "1px solid rgba(239, 68, 68, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <ShieldAlert size={24} style={{ color: "#ef4444" }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#f8fafc", fontWeight: "700" }}>
                    Emergency Break-Glass Recovery
                  </h3>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Target Tenant: <strong>{selectedTenant.name}</strong> (ID: {selectedTenant.id})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBreakGlassModalOpen(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Alert policy callout */}
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  fontSize: "12px",
                  color: "#fca5a5",
                  lineHeight: "1.5",
                }}
              >
                <strong>Restricted Recovery Protocol (UD-001 / US-PLAT-002):</strong> This procedure assigns the Super Admin role to a designated active member of this organization. You will NOT be granted browsing access to customer tasks, files, or comments. All actions are cryptographically hash-chained and broadcast to the Security Operations Center.
              </div>

              {/* Step 1: MFA Verification */}
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: mfaVerified ? "1px solid #10b981" : "1px solid rgba(148, 163, 184, 0.2)",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Key size={18} style={{ color: mfaVerified ? "#10b981" : "#f59e0b" }} />
                    <span style={{ fontWeight: "700", color: "#f8fafc", fontSize: "13px" }}>
                      Step 1: Step-Up Multi-Factor Authentication (MFA)
                    </span>
                  </div>
                  {mfaVerified && (
                    <span style={{ fontSize: "12px", color: "#10b981", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={13} /> Token Active: {Math.floor(mfaSecondsLeft / 60)}:{(mfaSecondsLeft % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </div>

                {!mfaVerified ? (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                      Enter 6-digit TOTP authenticator code:
                    </label>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="123456"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                        style={{
                          flex: 1,
                          padding: "10px 14px",
                          borderRadius: "8px",
                          background: "#1e293b",
                          border: "1px solid #475569",
                          color: "#f8fafc",
                          fontSize: "16px",
                          letterSpacing: "4px",
                          fontFamily: "monospace",
                        }}
                      />
                      <button
                        type="button"
                        className="btn-primary-emerald"
                        onClick={handleVerifyMfa}
                        disabled={submitting || totpCode.length !== 6}
                        style={{ padding: "0 18px", whiteSpace: "nowrap" }}
                      >
                        Verify Code
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setTotpCode("123456")}
                        style={{ fontSize: "11px", padding: "0 10px" }}
                        title="Auto-fill demo TOTP code"
                      >
                        Use Demo (123456)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#34d399", fontSize: "13px" }}>
                    <CheckCircle2 size={16} />
                    <span>MFA Verified. Ephemeral single-use step-up token bound to this operator & tenant context.</span>
                  </div>
                )}
              </div>

              {/* Step 2: Emergency Recovery Form (enabled after MFA) */}
              <form onSubmit={handleExecuteBreakGlass} style={{ opacity: mfaVerified ? 1 : 0.45, pointerEvents: mfaVerified ? "auto" : "none", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                    Verified External ITSM Ticket Reference *
                  </label>
                  <input
                    type="text"
                    placeholder="TG-849201"
                    value={ticketId}
                    onChange={(e) => setTicketId(e.target.value.toUpperCase())}
                    disabled={!mfaVerified || submitting}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "#1e293b",
                      border: "1px solid #475569",
                      color: "#f8fafc",
                      fontSize: "14px",
                      fontFamily: "monospace",
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", display: "block" }}>
                    Format must match <code>TG-XXXX</code> (4 to 8 digits, e.g. ServiceNow/Jira incident ticket).
                  </span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                    Formal Justification & Dual-Control Audit Reason *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Document verified administrative lockout cause and stakeholder authorization..."
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    disabled={!mfaVerified || submitting}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "#1e293b",
                      border: "1px solid #475569",
                      color: "#f8fafc",
                      fontSize: "13px",
                      resize: "vertical",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: justification.length >= 20 ? "#10b981" : "#f59e0b", marginTop: "3px" }}>
                    <span>{justification.length} / 20 characters minimum required</span>
                    {justification.length >= 20 && <span>Meets requirement</span>}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                    Designated Replacement Super Admin (Active Member) *
                  </label>
                  <select
                    value={designatedMemberId}
                    onChange={(e) => setDesignatedMemberId(e.target.value)}
                    disabled={!mfaVerified || submitting}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "#1e293b",
                      border: "1px solid #475569",
                      color: "#f8fafc",
                      fontSize: "14px",
                    }}
                  >
                    <option value="">-- Select Member to designate as Super Admin --</option>
                    {selectedTenant.owners?.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name} ({owner.email}) - Current Owner
                      </option>
                    ))}
                    {currentUser && (
                      <option value={currentUser.id}>
                        {currentUser.name} ({currentUser.email}) - Current Session User
                      </option>
                    )}
                  </select>
                  <span style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", display: "block" }}>
                    Must be an existing active member of this organization. Non-members are strictly rejected.
                  </span>
                </div>

                {/* Break-glass execution result */}
                {breakGlassResult && (
                  <div
                    style={{
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      borderRadius: "8px",
                      padding: "14px",
                      fontSize: "12px",
                      color: "#34d399",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", marginBottom: "6px" }}>
                      <FileCheck2 size={16} />
                      <span>Break-Glass Reassignment Executed & Hash Chained</span>
                    </div>
                    <div>Audit Log ID: <strong>#{breakGlassResult.auditLogId}</strong></div>
                    <div>SHA-256 Hash: <code style={{ fontSize: "11px", color: "#f8fafc" }}>{breakGlassResult.currentHash}</code></div>
                    <div>Outbox Alert Delivery: <strong>{breakGlassResult.alertStatus}</strong></div>
                  </div>
                )}

                {/* Footer Buttons */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setBreakGlassModalOpen(false)}
                    disabled={submitting}
                  >
                    Cancel / Abort
                  </button>

                  <button
                    type="submit"
                    className="btn-primary-emerald"
                    disabled={!mfaVerified || submitting || justification.length < 20 || !ticketId}
                    style={{
                      background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
                      border: "1px solid #ef4444",
                      padding: "10px 20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {submitting ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    <span>Authorize & Execute Recovery</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Suspension / Reactivation Modal */}
      {suspensionModalOpen && targetTenantToSuspend && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            className="modal-container"
            style={{
              background: "#0f172a",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "520px",
              padding: "24px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <AlertTriangle size={24} style={{ color: "#f59e0b" }} />
              <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#f8fafc", fontWeight: "700" }}>
                {targetTenantToSuspend.isSuspended ? "Reactivate Workspace" : "Suspend Tenant Workspace"}
              </h3>
            </div>

            <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.5", margin: "0 0 16px 0" }}>
              {targetTenantToSuspend.isSuspended
                ? `Reactivating ${targetTenantToSuspend.name} will immediately restore access for all tenant members.`
                : `Suspending ${targetTenantToSuspend.name} will immediately block access to projects, tasks, and files for all members.`}
            </p>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                Reason for state change (Logged to PlatformAuditLog):
              </label>
              <input
                type="text"
                placeholder="e.g., Compliance audit hold / Billing non-payment"
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "#1e293b",
                  border: "1px solid #475569",
                  color: "#f8fafc",
                  fontSize: "13px",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSuspensionModalOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-primary-emerald"
                onClick={handleConfirmSuspension}
                disabled={submitting}
                style={{
                  background: targetTenantToSuspend.isSuspended ? undefined : "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                  border: targetTenantToSuspend.isSuspended ? undefined : "1px solid #f59e0b",
                }}
              >
                {submitting ? "Updating..." : targetTenantToSuspend.isSuspended ? "Confirm Reactivation" : "Confirm Suspension"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
