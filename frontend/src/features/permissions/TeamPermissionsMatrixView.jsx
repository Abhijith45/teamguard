import { useEffect, useState } from "react";
import { AlertCircle, Check, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "../../services/api-client.js";

export function TeamPermissionsMatrixView({ user, activeOrg, userPermissions, onShowNotice }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingToggles, setPendingToggles] = useState(new Set());

  const canManageRoles = userPermissions.has("roles:manage");

  async function loadMatrix() {
    try {
      setLoading(true);
      setError(null);
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

  const roles = data?.roles ?? [];
  const categories = data?.categories ?? [];
  const matrix = data?.matrix ?? {};

  return (
    <div className="permissions-matrix-container">
      {/* Header */}
      <div className="matrix-view-header">
        <div className="matrix-header-left">
          <h2>Team & Permissions</h2>
          <p>Control access levels and assign roles to your team across modules.</p>
        </div>

        <div className="matrix-header-badge">
          <ShieldCheck size={16} className="text-emerald" />
          <span>Active Organization: <strong>{activeOrg?.name}</strong></span>
        </div>
      </div>

      {/* Tables by Category */}
      <div className="matrix-categories-stack">
        {categories.map((category) => (
          <div key={category.id} className="matrix-category-card">
            <div className="matrix-card-table-wrapper">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th className="th-category-name">{category.label}</th>
                    {category.permissions.map((perm) => (
                      <th key={perm.id} className="th-permission-action">
                        {perm.action.replace("update:", "Edit ").replace("view", "View").replace("create", "Create").replace("delete", "Delete").replace("manage", "Manage")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => {
                    const rolePerms = new Set(matrix[role.id] || []);
                    const isSuperAdmin = role.name === "Super Admin";

                    return (
                      <tr key={role.id}>
                        <td className="td-role-name">
                          <strong>{role.name}</strong>
                          {isSuperAdmin && <small className="superadmin-tag">Protected</small>}
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
                                onClick={() => handleToggle(role.id, perm.id, isEnabled, role.name, perm.action)}
                                disabled={isPending || (!canManageRoles && !isSuperAdmin)}
                                title={
                                  isSuperAdmin
                                    ? "Super Admin permissions are permanently protected against lockout"
                                    : `${isEnabled ? "Revoke" : "Grant"} ${perm.resource}:${perm.action} for ${role.name}`
                                }
                              >
                                {isPending ? (
                                  <div className="mini-spinner" />
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
    </div>
  );
}
