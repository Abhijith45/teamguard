import { useEffect, useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  Copy,
  Edit3,
  Layers,
  Lock,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import { LoadingView } from "../../components/LoadingView.jsx";

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
  const [pendingBulkToggles, setPendingBulkToggles] = useState(new Set());

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  // Organization Rename Modal state
  const [editOrgModalOpen, setEditOrgModalOpen] = useState(false);
  const [renameOrgName, setRenameOrgName] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  // Custom Role Modal state
  const [createRoleModalOpen, setCreateRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [cloneFromRoleId, setCloneFromRoleId] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

  // Custom Role Delete Modal state
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [deletingRole, setDeletingRole] = useState(false);

  const canManageRoles = userPermissions.has("roles:manage");

  async function loadMatrix() {
    try {
      setLoading(true);
      setError(null);
      setData(null);
      setPendingToggles(new Set());
      setPendingBulkToggles(new Set());
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
      setPendingBulkToggles(new Set());
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

  async function handleBulkToggle(roleId, moduleId, enabled, roleName, moduleLabel) {
    if (!canManageRoles) {
      onShowNotice({
        type: "error",
        message: "RBAC Denial: You do not have 'roles:manage' permission to modify roles.",
      });
      return;
    }

    if (roleName === "Super Admin" && !enabled) {
      onShowNotice({
        type: "error",
        message: "Privilege Guard: Super Admin permissions cannot be revoked to prevent administrative lockout.",
      });
      return;
    }

    const bulkKey = `${roleId}:${moduleId}`;
    try {
      setPendingBulkToggles((prev) => new Set(prev).add(bulkKey));

      await api.bulkToggleModule(roleId, moduleId, enabled);

      const targetCategory = categories.find((c) => c.id === moduleId);
      const targetPermIds = (targetCategory?.permissions || []).map((p) => p.id);

      setData((prev) => {
        if (!prev) return prev;
        const currentList = prev.matrix[roleId] || [];
        const nextList = enabled
          ? Array.from(new Set([...currentList, ...targetPermIds]))
          : currentList.filter((id) => !targetPermIds.includes(id));

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
        message: `${enabled ? "Granted all" : "Cleared all"} ${moduleLabel} permissions for ${roleName}.`,
      });
    } catch (err) {
      onShowNotice({ type: "error", message: `Bulk action failed: ${err.message}` });
    } finally {
      setPendingBulkToggles((prev) => {
        const next = new Set(prev);
        next.delete(bulkKey);
        return next;
      });
    }
  }

  async function handleCreateRoleSubmit(e) {
    e.preventDefault();
    const trimmedName = newRoleName.trim();
    if (trimmedName.length < 2) return;

    try {
      setCreatingRole(true);
      const res = await api.createRole({
        name: trimmedName,
        description: newRoleDescription.trim() || undefined,
        cloneFromRoleId: cloneFromRoleId ? parseInt(cloneFromRoleId, 10) : undefined,
      });

      setCreateRoleModalOpen(false);
      setNewRoleName("");
      setNewRoleDescription("");
      setCloneFromRoleId("");

      await loadMatrix();

      const cloneMsg = res.clonedPermissionCount
        ? ` (cloned ${res.clonedPermissionCount} permissions)`
        : "";
      onShowNotice({
        type: "success",
        message: `Custom role "${res.role.name}" created successfully${cloneMsg}.`,
      });
    } catch (err) {
      onShowNotice({
        type: "error",
        message: `Failed to create role: ${err.message}`,
      });
    } finally {
      setCreatingRole(false);
    }
  }

  async function handleDeleteRoleConfirm() {
    if (!roleToDelete) return;
    if (!canManageRoles) {
      onShowNotice({
        type: "error",
        message: "RBAC Denial: You do not have 'roles:manage' permission to delete roles.",
      });
      return;
    }

    try {
      setDeletingRole(true);
      await api.deleteRole(roleToDelete.id);
      const deletedName = roleToDelete.name;
      setRoleToDelete(null);
      await loadMatrix();
      onShowNotice({
        type: "success",
        message: `Custom role "${deletedName}" was successfully deleted.`,
      });
    } catch (err) {
      onShowNotice({
        type: "error",
        message: `Cannot delete role: ${err.message}`,
      });
    } finally {
      setDeletingRole(false);
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
    return <LoadingView message="Loading role & permission matrix…" />;
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
            Control granular privileges, audit assigned capabilities, and manage custom role authority across workspace modules.
          </p>
        </div>

        <div className="matrix-header-right" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="matrix-header-badge">
            <Building2 size={15} style={{ color: "#10B981" }} />
            <span>Workspace: <strong>{activeOrg?.name}</strong></span>
          </div>

          {canManageRoles && (
            <>
              <button
                type="button"
                className="button button-primary"
                style={{ padding: "6px 14px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
                onClick={() => {
                  setNewRoleName("");
                  setNewRoleDescription("");
                  setCloneFromRoleId("");
                  setCreateRoleModalOpen(true);
                }}
                title="Create a custom role scoped to this workspace"
              >
                <Plus size={14} />
                <span>Add Custom Role</span>
              </button>

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
            </>
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
                      const isBulkPending = pendingBulkToggles.has(`${role.id}:${category.id}`);

                      return (
                        <tr key={role.id}>
                          <td className="td-role-name">
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <strong>{role.name}</strong>
                                  {isSuperAdmin && (
                                    <small className="superadmin-tag" title="Super Admin permissions are permanently protected against lockout (BR-004)">
                                      <Lock size={10} style={{ display: "inline", marginRight: "3px" }} />
                                      Protected
                                    </small>
                                  )}
                                  {!role.isSystem && (
                                    <span className="custom-role-badge" title="Workspace-scoped custom role">
                                      Custom
                                    </span>
                                  )}
                                </div>

                                {!role.isSystem && canManageRoles && (
                                  <button
                                    type="button"
                                    className="delete-role-inline-btn"
                                    onClick={() => setRoleToDelete(role)}
                                    title={`Delete custom role "${role.name}"`}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>

                              {canManageRoles && !isSuperAdmin && (
                                <div className="role-module-bulk-btns">
                                  <span style={{ fontSize: "0.66rem", color: "var(--color-text-muted)", marginRight: "2px" }}>Bulk:</span>
                                  <button
                                    type="button"
                                    className="bulk-pill-btn select-all"
                                    disabled={isBulkPending}
                                    onClick={() => handleBulkToggle(role.id, category.id, true, role.name, category.label)}
                                    title={`Grant all ${category.label} permissions to ${role.name}`}
                                  >
                                    Select All
                                  </button>
                                  <button
                                    type="button"
                                    className="bulk-pill-btn clear-all"
                                    disabled={isBulkPending}
                                    onClick={() => handleBulkToggle(role.id, category.id, false, role.name, category.label)}
                                    title={`Clear all ${category.label} permissions from ${role.name}`}
                                  >
                                    Clear All
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>

                          {category.permissions.map((perm) => {
                            const isEnabled = rolePerms.has(perm.id);
                            const toggleKey = `${role.id}:${perm.id}`;
                            const isPending = pendingToggles.has(toggleKey) || isBulkPending;

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

      {/* Create Custom Role Modal */}
      {createRoleModalOpen && (
        <div className="member-modal-backdrop" onClick={() => !creatingRole && setCreateRoleModalOpen(false)}>
          <div className="member-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="member-dialog-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={20} style={{ color: "#7C3AED" }} />
                <h3>Create Custom Role</h3>
              </div>
              <button
                className="member-modal-close"
                onClick={() => setCreateRoleModalOpen(false)}
                disabled={creatingRole}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateRoleSubmit}>
              <div className="member-dialog-body">
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "16px", lineHeight: "1.5" }}>
                  Define a new workspace-scoped custom role. You can start with a clean slate or clone all permissions from an existing template role.
                </p>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                    Role Name *
                  </label>
                  <input
                    type="text"
                    className="filter-search-input"
                    style={{ width: "100%", padding: "10px 12px" }}
                    placeholder="e.g. QA Specialist, Security Reviewer, Release Manager"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    disabled={creatingRole}
                    required
                    autoFocus
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    className="filter-search-input"
                    style={{ width: "100%", padding: "10px 12px" }}
                    placeholder="Brief description of the role responsibilities"
                    value={newRoleDescription}
                    onChange={(e) => setNewRoleDescription(e.target.value)}
                    disabled={creatingRole}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                    Base Template (Template Cloning)
                  </label>
                  <select
                    className="filter-search-input"
                    style={{ width: "100%", padding: "10px 12px", background: "var(--color-surface)" }}
                    value={cloneFromRoleId}
                    onChange={(e) => setCloneFromRoleId(e.target.value)}
                    disabled={creatingRole}
                  >
                    <option value="">Clean Slate (0 initial permissions)</option>
                    {roles.map((r) => {
                      const count = matrix[r.id]?.length || 0;
                      return (
                        <option key={r.id} value={r.id}>
                          Clone from {r.name} ({count} permissions)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div style={{ background: "rgba(124, 58, 237, 0.06)", border: "1px solid rgba(124, 58, 237, 0.2)", padding: "10px 12px", borderRadius: "6px", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#7C3AED", fontWeight: "600", marginBottom: "3px" }}>
                    <Copy size={13} />
                    <span>Template Cloning Advantage</span>
                  </div>
                  <span>Selecting a template clones its full atomic privilege set immediately. You can fine-tune or bulk-toggle permissions at any time via the matrix.</span>
                </div>
              </div>

              <div className="member-dialog-actions">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setCreateRoleModalOpen(false)}
                  disabled={creatingRole}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  style={{ background: "#7C3AED", borderColor: "#7C3AED" }}
                  disabled={creatingRole || newRoleName.trim().length < 2}
                >
                  {creatingRole ? "Creating Role…" : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Custom Role Confirmation Modal */}
      {roleToDelete && (
        <div className="member-modal-backdrop" onClick={() => !deletingRole && setRoleToDelete(null)}>
          <div className="member-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="member-dialog-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={20} style={{ color: "#EF4444" }} />
                <h3>Delete Custom Role</h3>
              </div>
              <button
                className="member-modal-close"
                onClick={() => setRoleToDelete(null)}
                disabled={deletingRole}
              >
                <X size={16} />
              </button>
            </div>

            <div className="member-dialog-body">
              <p style={{ fontSize: "0.88rem", color: "var(--color-text-main)", marginBottom: "12px", lineHeight: "1.5" }}>
                Are you sure you want to delete the custom role <strong>"{roleToDelete.name}"</strong>?
              </p>
              <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", lineHeight: "1.5" }}>
                This action is permanent and cannot be undone. All assigned permissions will be cleared. System default roles cannot be deleted, and custom roles currently assigned to workspace members cannot be removed until members are reassigned.
              </p>
            </div>

            <div className="member-dialog-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setRoleToDelete(null)}
                disabled={deletingRole}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                style={{ background: "#EF4444", borderColor: "#EF4444" }}
                onClick={handleDeleteRoleConfirm}
                disabled={deletingRole}
              >
                {deletingRole ? "Deleting Role…" : "Delete Role"}
              </button>
            </div>
          </div>
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
