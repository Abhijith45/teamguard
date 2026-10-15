const apiBase = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ?? "http://localhost:5000/api";
let accessToken = null;
let activeOrganizationId = null;
let refreshRequest = null;

export function setAccessToken(token) { accessToken = token; }
export function clearAccessToken() { accessToken = null; }

export function setActiveOrgId(orgId) {
  const parsed = orgId ? Number(orgId) : null;
  if (parsed && Number.isSafeInteger(parsed) && parsed > 0) {
    activeOrganizationId = parsed;
    localStorage.setItem("teamguard_active_org", String(parsed));
  } else {
    activeOrganizationId = null;
    localStorage.removeItem("teamguard_active_org");
  }
}

export function getActiveOrgId() {
  if (!activeOrganizationId) {
    const saved = localStorage.getItem("teamguard_active_org");
    if (saved) {
      const parsed = Number(saved);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        activeOrganizationId = parsed;
      } else {
        localStorage.removeItem("teamguard_active_org");
        activeOrganizationId = null;
      }
    }
  }
  return activeOrganizationId;
}

const queryCache = new Map();

/**
 * TASK-003: Purges all client-side query caches and in-memory tenant state.
 * Removes tenant-scoped filter keys, project selections, and caches from localStorage.
 */
export function purgeTenantWorkspaceCache(newOrgId = null) {
  // 1. Invalidate in-memory query cache
  queryCache.clear();

  // 2. Clear tenant-scoped keys from localStorage
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("teamguard_") && key !== "teamguard_active_org") {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    if (newOrgId) {
      setActiveOrgId(newOrgId);
    }
  } catch {
    // Graceful fallback if localStorage is blocked
  }

  // 3. Dispatch broadcast event for active React views to synchronously flush state
  if (typeof window !== "undefined" && window.dispatchEvent) {
    window.dispatchEvent(
      new CustomEvent("teamguard:workspace-purged", {
        detail: { activeOrgId: newOrgId },
      })
    );
  }
}

/**
 * TASK-003 / US-AUTH-004: Complete logout purge.
 * Wipes access tokens, active organization ID, all localStorage keys, and query cache.
 */
export function clearSessionStorageAndCache() {
  clearAccessToken();
  activeOrganizationId = null;
  queryCache.clear();
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("teamguard_")) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Graceful fallback
  }
  if (typeof window !== "undefined" && window.dispatchEvent) {
    window.dispatchEvent(
      new CustomEvent("teamguard:workspace-purged", {
        detail: { activeOrgId: null },
      })
    );
  }
}

function isTenantScoped(path) {
  if (path.startsWith("/auth/") || path.startsWith("/demo/")) return false;
  if (path === "/organizations" || path === "/organizations/") return false;
  return true;
}

async function readResponse(response) {
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error ?? `Request failed (${response.status})`);
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

export function refreshSession() {
  if (!refreshRequest) {
    const headers = { "Content-Type": "application/json" };
    const orgId = getActiveOrgId();
    if (orgId) headers["x-organization-id"] = String(orgId);

    refreshRequest = fetch(`${apiBase}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers,
    }).then(async (response) => {
      if (!response.ok) {
        clearAccessToken();
        return null;
      }
      const session = await response.json();
      setAccessToken(session.accessToken);
      return session;
    }).finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest;
}

export function getQueryCacheSize() {
  return queryCache.size;
}

export function isQueryCacheEmpty() {
  return queryCache.size === 0;
}

async function request(path, options = {}, retry = true) {
  const headers = new Headers(options.headers ?? {});
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const currentOrgId = getActiveOrgId();
  if (isTenantScoped(path)) {
    if (currentOrgId && !headers.has("x-organization-id")) {
      headers.set("x-organization-id", String(currentOrgId));
    } else if (!headers.has("x-organization-id")) {
      const error = new Error("No organization selected. Please select a workspace.");
      error.status = 400;
      error.code = "NO_ORGANIZATION_SELECTED";
      throw error;
    }
  } else if (currentOrgId && !headers.has("x-organization-id")) {
    headers.set("x-organization-id", String(currentOrgId));
  }

  const method = (options.method || "GET").toUpperCase();
  const cacheKey = `${currentOrgId || "global"}:${path}`;

  if (method === "GET" && !options.skipCache) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return typeof structuredClone === "function"
        ? structuredClone(cached.data)
        : JSON.parse(JSON.stringify(cached.data));
    }
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    const session = await refreshSession();
    if (session) return request(path, options, false);
  }
  const payload = await readResponse(response);

  if (method === "GET") {
    queryCache.set(cacheKey, { timestamp: Date.now(), data: payload });
  } else {
    // Invalidate queries for current tenant upon mutation
    for (const k of queryCache.keys()) {
      if (k.startsWith(`${currentOrgId}:`)) {
        queryCache.delete(k);
      }
    }
  }

  return payload;
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { method: "POST", body, ...options }),
  put: (path, body, options) => request(path, { method: "PUT", body, ...options }),
  patch: (path, body, options) => request(path, { method: "PATCH", body, ...options }),
  delete: (path, options) => request(path, { method: "DELETE", ...options }),

  // Auth & Session
  login: (body) => request("/auth/login", { method: "POST", body }),
  register: (body) => request("/auth/register", { method: "POST", body }),
  refresh: refreshSession,
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  updateProfile: (body) => request("/auth/profile", { method: "PATCH", body }),
  changePassword: (body) => request("/auth/change-password", { method: "POST", body }),
  cleanupSessions: (body = {}) => request("/auth/sessions/cleanup", { method: "POST", body }),

  // Demo Persona Switcher
  switchPersona: (persona, organizationSlug = "acme-corp") =>
    request("/demo/switch-persona", {
      method: "POST",
      body: { persona, organizationSlug },
    }),

  // Organizations & Members (TASK-101 / TASK-102)
  getOrganizations: () => request("/organizations"),
  createOrganization: (body) => request("/organizations", { method: "POST", body }),
  getOrganization: (id) => request(id ? `/organizations/${id}` : "/organizations/current"),
  updateOrganization: (id, body) => request(`/organizations/${id}`, { method: "PATCH", body }),
  getMembers: (params = "") => request(`/members${params ? `?${params}` : ""}`),
  getMemberRoles: () => request("/members/roles"),
  reassignMemberRole: (membershipId, roleId) =>
    request(`/members/${membershipId}/role`, { method: "PATCH", body: { roleId } }),
  updateMemberDepartment: (membershipId, department) =>
    request(`/members/${membershipId}/department`, { method: "PATCH", body: { department } }),
  updateMemberStatus: (membershipId, status) =>
    request(`/members/${membershipId}/status`, { method: "PATCH", body: { status } }),
  removeMember: (membershipId) =>
    request(`/members/${membershipId}`, { method: "DELETE" }),

  // Dashboard
  getDashboard: () => request("/dashboard"),

  // Projects (TASK-201 & TASK-202)
  getProjects: (params = "") => request(`/projects${params ? `?${params}` : ""}`),
  getProject: (id, params = "") => request(`/projects/${id}${params ? `?${params}` : ""}`),
  createProject: (body) => request("/projects", { method: "POST", body }),
  updateProject: (id, body) => request(`/projects/${id}`, { method: "PATCH", body }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),
  restoreProject: (id) => request(`/projects/${id}/restore`, { method: "POST" }),
  archiveProject: (id) => request(`/projects/${id}/archive`, { method: "POST" }),
  unarchiveProject: (id) => request(`/projects/${id}/unarchive`, { method: "POST" }),

  // Tasks
  getTasks: (params = "") => {
    let queryStr = "";
    if (typeof params === "string") {
      queryStr = params ? (params.startsWith("?") ? params : `?${params}`) : "";
    } else if (params && typeof params === "object") {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") {
          q.set(k, String(v));
        }
      }
      const s = q.toString();
      queryStr = s ? `?${s}` : "";
    }
    return request(`/tasks${queryStr}`);
  },
  getTask: (id) => request(`/tasks/${id}`),
  createTask: (body) => request("/tasks", { method: "POST", body }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: "PATCH", body }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: "DELETE" }),

  // Subtasks (TASK-301)
  getSubtasks: (taskId) => request(`/tasks/${taskId}/subtasks`),
  createSubtask: (taskId, body) => request(`/tasks/${taskId}/subtasks`, { method: "POST", body }),
  updateSubtask: (taskId, subtaskId, body) =>
    request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: "PATCH", body }),
  deleteSubtask: (taskId, subtaskId) =>
    request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: "DELETE" }),
  reorderSubtasks: (taskId, subtaskIds) =>
    request(`/tasks/${taskId}/subtasks/reorder`, { method: "PUT", body: { subtaskIds } }),

  // Files
  getFiles: (params = "") => request(`/files${params ? `?${params}` : ""}`),
  createFile: (body) => request("/files", { method: "POST", body }),
  bulkDeleteFiles: (fileIds) => request("/files/bulk-delete", { method: "POST", body: { fileIds } }),
  bulkDuplicateFiles: (fileIds) => request("/files/bulk-duplicate", { method: "POST", body: { fileIds } }),
  deleteFile: (id) => request(`/files/${id}`, { method: "DELETE" }),

  // Roles & Custom Templates (TASK-103)
  getRoles: () => request("/roles"),
  createRole: (body) => request("/roles", { method: "POST", body }),
  updateRole: (id, body) => request(`/roles/${id}`, { method: "PATCH", body }),
  deleteRole: (id) => request(`/roles/${id}`, { method: "DELETE" }),
  bulkToggleModule: (roleId, module, enabled) =>
    request(`/roles/${roleId}/modules/${module}/toggle`, {
      method: "POST",
      body: { enabled },
    }),

  // Permissions Matrix
  getPermissionsMatrix: () => request("/permissions-matrix"),
  togglePermission: (roleId, permissionId, enabled) =>
    request("/permissions-matrix/toggle", {
      method: "POST",
      body: { roleId, permissionId, enabled },
    }),
};
