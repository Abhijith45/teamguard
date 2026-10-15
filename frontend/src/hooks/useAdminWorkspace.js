import { useCallback, useState } from "react";
import { api } from "../services/api-client.js";

export function useAdminWorkspace() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState(null);

  const loadSection = useCallback(async (section) => {
    setLoading(true);
    try {
      if (section === "users") {
        const [userResult, roleResult, permissionResult] = await Promise.all([
          api.get("/admin/users?page=1&pageSize=100"),
          api.get("/admin/roles"),
          api.get("/admin/permissions"),
        ]);
        setUsers(userResult.users);
        setRoles(roleResult.roles);
        setPermissions(permissionResult.permissions);
      } else if (section === "roles") {
        const [roleResult, permissionResult] = await Promise.all([
          api.get("/admin/roles"),
          api.get("/admin/permissions"),
        ]);
        setRoles(roleResult.roles);
        setPermissions(permissionResult.permissions);
      } else {
        const result = await api.get("/admin/permissions");
        setPermissions(result.permissions);
      }
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  async function saveUserAccess(dialog) {
    try {
      await Promise.all([
        api.put(`/admin/users/${dialog.targetUser.id}/roles`, { ids: dialog.roleIds }),
        api.put(`/admin/users/${dialog.targetUser.id}/permissions`, { ids: dialog.permissionIds }),
      ]);
      setNotice({ type: "success", message: `Access updated for ${dialog.targetUser.name}.` });
      await loadSection("users");
      return true;
    } catch (error) {
      setNotice({ type: "error", message: error.message });
      return false;
    }
  }

  async function toggleUserActive(person) {
    try {
      await api.patch(`/admin/users/${person.id}/status`, { isActive: !person.isActive });
      setNotice({ type: "success", message: `${person.username} is now ${person.isActive ? "inactive" : "active"}.` });
      await loadSection("users");
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  }

  async function saveRole(dialog, section) {
    try {
      if (dialog.targetRole) {
        await Promise.all([
          api.put(`/admin/roles/${dialog.targetRole.id}/permissions`, { ids: dialog.permissionIds }),
          api.patch(`/admin/roles/${dialog.targetRole.id}`, { name: dialog.name, description: dialog.description || null }),
        ]);
      } else {
        await api.post("/admin/roles", { name: dialog.name, description: dialog.description || null });
      }
      setNotice({ type: "success", message: dialog.targetRole ? "Role updated." : "Role created." });
      await loadSection(section);
      return true;
    } catch (error) {
      setNotice({ type: "error", message: error.message });
      return false;
    }
  }

  async function savePermission(dialog, section) {
    try {
      await api.post("/admin/permissions", dialog.permission);
      setNotice({ type: "success", message: "Permission created." });
      await loadSection(section);
      return true;
    } catch (error) {
      setNotice({ type: "error", message: error.message });
      return false;
    }
  }

  async function deleteItem(kind, item, section) {
    const label = kind === "role" ? item.name : `${item.resource}:${item.action}`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      const path = kind === "role" ? `/admin/roles/${item.id}` : `/admin/permissions/${item.id}`;
      await api.delete(path);
      setNotice({ type: "success", message: `${label} deleted.` });
      await loadSection(section);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  }

  function reset() {
    setUsers([]);
    setRoles([]);
    setPermissions([]);
    setNotice(null);
  }

  return {
    users,
    roles,
    permissions,
    loading,
    query,
    setQuery,
    notice,
    dismissNotice: () => setNotice(null),
    loadSection,
    saveUserAccess,
    toggleUserActive,
    saveRole,
    savePermission,
    deleteItem,
    reset,
  };
}
