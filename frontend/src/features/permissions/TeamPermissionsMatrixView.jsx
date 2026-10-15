import { useEffect, useState, useMemo } from "react";
import {
  AlertCircle,
  Building2,
  Check,
  Edit3,
  Layers,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api } from "../../services/api-client.js";

export function TeamPermissionsMatrixView({
  activeOrg,
  userPermissions,
  onShowNotice,
  onOrgUpdated,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingToggles, setPendingToggles] = useState(new Set());

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  // Organization Rename Modal state
  const [editOrgModalOpen, setEditOrgModalOpen] = useState(false);
  const [renameOrgName, setRenameOrgName] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  const canManageRoles = userPermissions.has("roles:manage");

  async function loadMatrix() {
    try {
      setLoading(true);
      setError(null);
      setData(null);
      setPendingToggles(new Set());
      const res = await api.getPermissionsMatrix();
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMatrix();
  }, [activeOrg?.id]);

  // TASK-003: Broadcast event listener for global workspace cache purges
  useEffect(() => {
    function handlePurge() {
      setData(null);
      setPendingToggles(new Set());
      setLoading(true);
    }
    window.addEventListener("teamguard:workspace-purged", handlePurge);
    return () => window.removeEventListener("teamguard:workspace-purged", handlePurge);
  }, []);

  async function handleToggle(roleId, permissionId, currentEnabled, roleName, permName) {
    if (!canManageRoles) {
      onShowNotice({
        type: "error",
        message: "RBAC Denial: You do not have 'roles:manage' permission to modify roles.",
      });
      return;
    }

    if (roleName === "Super Admin" && currentEnabled) {
      onShowNotice({
        type: "error",
        message: "Privilege Guard: Super Admin permissions cannot be revoked to prevent administrative lockout.",
      });
      return;
    }

    const toggleKey = `${roleId}:${permissionId}`;
    try {
      setPendingToggles((prev) => new Set(prev).add(toggleKey));
      const nextEnabled = !currentEnabled;
      await api.togglePermission(roleId, permissionId, nextEnabled);

      setData((prev) => {
        if (!prev) return prev;
        const currentList = prev.matrix[roleId] || [];
        const nextList = nextEnabled
          ? [...currentList, permissionId]
          : currentList.filter((id) => id !== permissionId);

        return {
          ...prev,
          matrix: {
            ...prev.matrix,
            [roleId]: nextList,
          },
        };
      });

      onShowNotice({
        type: "success",
        message: `${nextEnabled ? "Granted" : "Revoked"} "${permName}" for ${roleName}.`,
      });
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setPendingToggles((prev) => {
        const next = new Set(prev);
        next.delete(toggleKey);
        return next;
      });
    }
  }

  async function handleRenameOrgSubmit(e) {
    e.preventDefault();
    const trimmed = renameOrgName.trim();
    if (trimmed.length < 2) return;

    try {
      setSavingOrg(true);
      const res = await api.updateOrganization(activeOrg.id, { name: trimmed });
      setEditOrgModalOpen(false);
      onShowNotice({
        type: "success",
        message: `Workspace renamed to "${res.organization.name}".`,
      });
      if (onOrgUpdated) {
        onOrgUpdated(res.organization);
      }
    } catch (err) {
      onShowNotice({ type: "error", message: `Failed to rename workspace: ${err.message}` });
    } finally {
      setSavingOrg(false);
    }
  }

  const roles = data?.roles ?? [];
  const categories = data?.categories ?? [];
  const matrix = data?.matrix ?? {};

  // Compute metrics
  const totalPermissionsCount = useMemo(() => {
    return categories.reduce((acc, cat) => acc + (cat.permissions?.length || 0), 0);
  }, [categories]);

  // Filter categories and permissions based on search and category tab
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return categories
      .filter((cat) => selectedCategory === "ALL" || cat.id === selectedCategory)
      .map((cat) => {
        if (!q) return cat;
        const matchingPerms = cat.permissions.filter(
          (p) =>
            p.action.toLowerCase().includes(q) ||
            p.resource.toLowerCase().includes(q) ||
            (p.description && p.description.toLowerCase().includes(q))
        );
        return { ...cat, permissions: matchingPerms };
      })
      .filter((cat) => cat.permissions.length > 0);
  }, [categories, searchQuery, selectedCategory]);

  if (loading) {
    return (
      <div className="view-loading-container">
        <div className="loading-spinner" />
        <span>Loading role & permission matrix…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view-error-container">
        <AlertCircle size={20} className="text-destructive" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="permissions-matrix-container">
      {/* Executive Header */}
      <div className="matrix-view-header">
        <div className="matrix-header-left">
          <h2>Team & Permissions Matrix</h2>
          <p>
            Control granular privileges, audit assigned capabilities, and manage role authority across workspace modules.
          </p>
        </div>

        <div className="matrix-header-right" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="matrix-header-badge">
            <Building2 size={15} style={{ color: "#10B981" }} />
            <span>Workspace: <strong>{activeOrg?.name}</strong></span>
          </div>

          {canManageRoles && (
            <button
              type="button"
              className="button button-quiet"
              style={{ padding: "6px 12px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={() => {
                setRenameOrgName(activeOrg?.name || "");
                setEditOrgModalOpen(true);
              }}
              title="Edit workspace metadata"
            >
              <Edit3 size={14} />
              <span>Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards Strip */}
      <div className="members-kpi-grid" style={{ marginBottom: "20px" }}>
        <div className="members-kpi-card">
          <div className="kpi-icon-badge" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10B981" }}>
            <Layers size={18} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Configured Roles</span>
            <strong className="kpi-value">{roles.length}</strong>
          </div>
        </div>

        <div className="members-kpi-card">
          <div className="kpi-icon-badge" style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3B82F6" }}>
            <SlidersHorizontal size={18} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Module Categories</span>
            <strong className="kpi-value">{categories.length}</strong>
          </div>
        </div>

        <div className="members-kpi-card">
          <div className="kpi-icon-badge" style={{ background: "rgba(139, 92, 246, 0.12)", color: "#8B5CF6" }}>
            <ShieldCheck size={18} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Atomic Permissions</span>
            <strong className="kpi-value">{totalPermissionsCount}</strong>
          </div>
        </div>

        <div className="members-kpi-card">
          <div className="kpi-icon-badge" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#F59E0B" }}>
            <Lock size={18} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Lockout Guard</span>
            <strong className="kpi-value" style={{ fontSize: "1.1rem", color: "#10B981" }}>Active (BR-004)</strong>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="members-filter-bar" style={{ marginBottom: "20px" }}>
        <div className="filter-search-wrap" style={{ maxWidth: "340px" }}>
          <Search size={15} className="filter-search-icon" />
          <input
            type="text"
            className="filter-search-input"
            placeholder="Search permissions or actions…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="filter-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="department-filter-chips">
          <button
            type="button"
            className={`dept-chip ${selectedCategory === "ALL" ? "active" : ""}`}
            onClick={() => setSelectedCategory("ALL")}
          >
            All Modules ({categories.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`dept-chip ${selectedCategory === cat.id ? "active" : ""}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label} ({cat.permissions?.length || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Tables by Category */}
      {filteredCategories.length === 0 ? (
        <div className="empty-directory-card" style={{ padding: "40px 20px", textAlign: "center" }}>
          <ShieldAlert size={36} style={{ color: "var(--color-text-muted)", margin: "0 auto 12px" }} />
          <h4>No matching permissions found</h4>
          <p>Try refining your search keyword or selecting "All Modules".</p>
        </div>
      ) : (
        <div className="matrix-categories-stack">
          {filteredCategories.map((category) => (
            <div key={category.id} className="matrix-category-card">
              <div className="matrix-card-table-wrapper">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th className="th-category-name">{category.label}</th>
                      {category.permissions.map((perm) => (
                        <th key={perm.id} className="th-permission-action" title={perm.description || `${perm.resource}:${perm.action}`}>
                          {perm.action
                            .replace("update:own", "Edit Own")
                            .replace("update:any", "Edit Any")
                            .replace("update", "Edit")
                            .replace("view", "View")
                            .replace("read", "Read")
                            .replace("create", "Create")
                            .replace("delete", "Delete")
                            .replace("manage", "Manage")
                            .replace("assign", "Assign")
                            .replace("export", "Export")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => {
                      const rolePerms = new Set(matrix[role.id] || []);
                      const isSuperAdmin = role.name === "Super Admin" || role.slug === "super-admin";

                      return (
                        <tr key={role.id}>
                          <td className="td-role-name">
                            <strong>{role.name}</strong>
                            {isSuperAdmin && (
                              <small className="superadmin-tag" title="Super Admin permissions are permanently protected against lockout (BR-004)">
                                <Lock size={10} style={{ display: "inline", marginRight: "3px" }} />
                                Protected
                              </small>
                            )}
                          </td>

                          {category.permissions.map((perm) => {
                            const isEnabled = rolePerms.has(perm.id);
                            const toggleKey = `${role.id}:${perm.id}`;
                            const isPending = pendingToggles.has(toggleKey);

                            return (
                              <td key={perm.id} className="td-matrix-checkbox">
                                <button
                                  type="button"
                                  className={`custom-checkbox-btn ${isEnabled ? "checked" : ""} ${isSuperAdmin ? "locked" : ""}`}
                                  onClick={() => handleToggle(role.id, perm.id, isEnabled, role.name, `${perm.resource}:${perm.action}`)}
                                  disabled={isPending || isSuperAdmin || !canManageRoles}
                                  title={
                                    isSuperAdmin
                                      ? "Super Admin permissions are permanently protected against lockout (BR-004 / SEC-05)"
                                      : !canManageRoles
                                      ? "Requires roles:manage permission to edit"
                                      : `${isEnabled ? "Revoke" : "Grant"} ${perm.resource}:${perm.action} for ${role.name}`
                                  }
                                >
                                  {isPending ? (
                                    <div className="mini-spinner" />
                                  ) : isSuperAdmin ? (
                                    <Lock size={12} className="lock-icon" />
                                  ) : isEnabled ? (
                                    <Check size={14} className="check-icon" />
                                  ) : null}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Organization Rename / Settings Modal */}
      {editOrgModalOpen && (
        <div className="member-modal-backdrop" onClick={() => !savingOrg && setEditOrgModalOpen(false)}>
          <div className="member-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="member-dialog-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Building2 size={20} style={{ color: "#10B981" }} />
                <h3>Workspace Settings</h3>
              </div>
              <button
                className="member-modal-close"
                onClick={() => setEditOrgModalOpen(false)}
                disabled={savingOrg}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRenameOrgSubmit}>
              <div className="member-dialog-body">
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "16px", lineHeight: "1.5" }}>
                  Update the organization workspace display name. This identifier appears in team reports, audit logs, and navigation headers.
                </p>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                    Workspace Name *
                  </label>
                  <input
                    type="text"
                    className="filter-search-input"
                    style={{ width: "100%", padding: "10px 12px" }}
                    value={renameOrgName}
                    onChange={(e) => setRenameOrgName(e.target.value)}
                    disabled={savingOrg}
                    autoFocus
                  />
                </div>

                <div style={{ background: "var(--color-surface-alt)", padding: "10px 12px", borderRadius: "6px", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  <span>Tenant Slug: </span>
                  <code style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>{activeOrg?.slug}</code>
                </div>
              </div>

              <div className="member-dialog-actions">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setEditOrgModalOpen(false)}
                  disabled={savingOrg}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={savingOrg || renameOrgName.trim().length < 2 || renameOrgName.trim() === activeOrg?.name}
                >
                  {savingOrg ? "Saving Changes…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
