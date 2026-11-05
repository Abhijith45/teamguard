function resolveApiBase() {
  const envUrl = typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL
    ? String(import.meta.env.VITE_API_URL).trim()
    : "http://localhost:5000/api";
  const cleaned = envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  return cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;
}

const apiBase = resolveApiBase();
let accessToken = null;
let activeOrganizationId = null;
let refreshRequest = null;

export function setAccessToken(token) { accessToken = token; }
export function clearAccessToken() { accessToken = null; }
export function getAccessToken() { return accessToken; }
export function getApiBase() { return apiBase; }

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
const MAX_CLIENT_CACHE = 150;

function setClientCache(key, data, etag = null) {
  if (queryCache.has(key)) {
    queryCache.delete(key);
  } else if (queryCache.size >= MAX_CLIENT_CACHE) {
    const oldestKey = queryCache.keys().next().value;
    if (oldestKey !== undefined) queryCache.delete(oldestKey);
  }
  queryCache.set(key, { timestamp: Date.now(), data, etag });
}

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
      if (key && key.startsWith("teamguard_") && key !== "teamguard_remember_me") {
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
  if (path.startsWith("/platform")) return false;
  return true;
}

async function readResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  let payload;
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => ({}));
  } else if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
    payload = await response.text();
  } else {
    payload = await response.json().catch(() => response.text());
  }

  if (!response.ok) {
    const errorMsg = typeof payload === "object" ? payload?.error : payload;
    const error = new Error(errorMsg ?? `Request failed (${response.status})`);
    error.status = response.status;
    if (typeof payload === "object") error.code = payload?.code;
    throw error;
  }
  return payload;
}

export function triggerCsvDownload(csvString, filename) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  } else if (!path.startsWith("/platform") && currentOrgId && !headers.has("x-organization-id")) {
    headers.set("x-organization-id", String(currentOrgId));
  }

  const method = (options.method || "GET").toUpperCase();
  const cacheKey = `${currentOrgId || "global"}:${path}`;

  const cached = method === "GET" && !options.skipCache ? queryCache.get(cacheKey) : null;
  const now = Date.now();

  // Fresh cache hit (< 15s) -> instant return
  if (cached && now - cached.timestamp < 15000) {
    return typeof structuredClone === "function"
      ? structuredClone(cached.data)
      : JSON.parse(JSON.stringify(cached.data));
  }

  // If cached entry has an ETag, send conditional If-None-Match header
  if (cached?.etag) {
    headers.set("If-None-Match", cached.etag);
  }

  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.status === 401 && retry && !path.startsWith("/auth/")) {
      const session = await refreshSession();
      if (session) return request(path, options, false);
    }

    // HTTP 304 Not Modified: Reuse cached data and refresh timestamp
    if (response.status === 304 && cached) {
      cached.timestamp = now;
      return typeof structuredClone === "function"
        ? structuredClone(cached.data)
        : JSON.parse(JSON.stringify(cached.data));
    }

    const payload = await readResponse(response);
    const responseETag = response.headers?.get("etag") || null;

    if (method === "GET") {
      setClientCache(cacheKey, payload, responseETag);
    } else {
      // Smart Invalidation for mutated tenant
      const pathLower = path.toLowerCase();
      for (const k of queryCache.keys()) {
        const isCurrentTenant = k.startsWith(`${currentOrgId}:`);
        if (!isCurrentTenant) continue;

        if (
          (pathLower.includes("/tasks") && (k.includes("/tasks") || k.includes("/dashboard") || k.includes("/reports"))) ||
          (pathLower.includes("/projects") && (k.includes("/projects") || k.includes("/spaces") || k.includes("/dashboard") || k.includes("/reports"))) ||
          (pathLower.includes("/members") && (k.includes("/members") || k.includes("/reports"))) ||
          (pathLower.includes("/roles") && (k.includes("/roles") || k.includes("/permissions"))) ||
          (pathLower.includes("/files") && (k.includes("/files") || k.includes("/reports"))) ||
          (pathLower.includes("/spaces") && (k.includes("/spaces") || k.includes("/projects")))
        ) {
          queryCache.delete(k);
        }
      }
    }

    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent("teamguard:api-intercept", {
          detail: {
            path,
            method,
            status: response.status,
            ok: true,
            timestamp: new Date().toISOString(),
            headers: Object.fromEntries(headers.entries()),
            body: options.body,
          },
        })
      );
    }

    return payload;
  } catch (err) {
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent("teamguard:api-intercept", {
          detail: {
            path,
            method,
            status: err.status || (response ? response.status : 500),
            ok: false,
            error: err.message,
            timestamp: new Date().toISOString(),
            headers: Object.fromEntries(headers.entries()),
            body: options.body,
          },
        })
      );
    }
    throw err;
  }
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

  // Member Invitations via Resend (TASK-505 / UD-005)
  getInvitations: (params = "") => request(`/invitations${params ? `?${params}` : ""}`, { skipCache: true }),
  createInvitation: (body) => request("/invitations", { method: "POST", body }),
  revokeInvitation: (id) => request(`/invitations/${id}/revoke`, { method: "POST" }),
  resendInvitation: (id) => request(`/invitations/${id}/resend`, { method: "POST" }),
  acceptInvitation: (token) => request("/invitations/accept", { method: "POST", body: { token } }),
  verifyInvitation: (token) => request(`/invitations/verify?token=${encodeURIComponent(token)}`),

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

  // Comments (TASK-302)
  getComments: (taskId) => request(`/tasks/${taskId}/comments`),
  createComment: (taskId, body) => request(`/tasks/${taskId}/comments`, { method: "POST", body }),
  updateComment: (taskId, commentId, body) =>
    request(`/tasks/${taskId}/comments/${commentId}`, { method: "PATCH", body }),
  deleteComment: (taskId, commentId) =>
    request(`/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),

  // Task Activity & Timeline (TASK-303 / US-ACT-001)
  getTaskActivity: (taskId) => request(`/tasks/${taskId}/activity`),

  // Centralized Compliance & Audit Logs (TASK-303 / US-AUDIT-001)
  getAuditLogs: (params = {}) => {
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
    return request(`/audit${queryStr}`);
  },
  getAuditActions: () => request("/audit/actions"),
  getAuditStats: () => request("/audit/stats"),

  // Files
  getFiles: (params = "", skipCache = false) => {
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
    return request(`/files${queryStr}`, { skipCache: Boolean(skipCache) });
  },
  getFile: (id) => request(`/files/${id}`),
  createFile: (body) => request("/files", { method: "POST", body }),
  updateFile: (id, body) => request(`/files/${id}`, { method: "PATCH", body }),
  bulkDeleteFiles: (fileIds) => request("/files/bulk-delete", { method: "POST", body: { fileIds } }),
  bulkDuplicateFiles: (fileIds) => request("/files/bulk-duplicate", { method: "POST", body: { fileIds } }),
  deleteFile: (id) => request(`/files/${id}`, { method: "DELETE" }),
  requestUploadUrl: (body) => request("/files/upload-url", { method: "POST", body }),
  confirmUpload: (body) => request("/files/confirm", { method: "POST", body }),
  getDownloadUrl: (id) => request(`/files/${id}/download-url`),
  getStorageQuota: () => request("/files/quota"),

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

  // Notifications (TASK-304 / US-NOTIF-001 & TG-NOTIF-001)
  getNotifications: (params = {}) => {
    let queryStr = "";
    if (params) {
      const q = new URLSearchParams();
      if (params.unreadOnly) q.set("unreadOnly", "true");
      if (params.page) q.set("page", params.page);
      if (params.limit) q.set("limit", params.limit);
      const s = q.toString();
      queryStr = s ? `?${s}` : "";
    }
    return request(`/notifications${queryStr}`);
  },
  getUnreadNotificationCount: () => request("/notifications/unread-count"),
  markNotificationAsRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsAsRead: () => request("/notifications/mark-all-read", { method: "PATCH" }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: "DELETE" }),
  clearReadNotifications: () => request("/notifications/clear-read", { method: "DELETE" }),
  getNotificationPreferences: () => request("/notifications/preferences"),
  updateNotificationPreferences: (body) => request("/notifications/preferences", { method: "PATCH", body }),

  // Global Multi-Entity Search (TASK-401 / US-CMD-001)
  globalSearch: (q, limit = 6) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (limit) params.set("limit", String(limit));
    return request(`/search?${params.toString()}`);
  },

  // Platform Super Admin Governance & Break-Glass Recovery (TASK-501 / UD-001)
  getPlatformTenants: () => request("/platform/tenants", { skipCache: true }),
  updateTenantStatus: (tenantId, isSuspended, reason) =>
    request(`/platform/tenants/${tenantId}/status`, {
      method: "PATCH",
      body: { isSuspended, reason },
    }),
  verifyPlatformMfa: (totpCode, targetOrganizationId) =>
    request("/platform/mfa/verify", {
      method: "POST",
      body: { totpCode, targetOrganizationId },
    }),
  executeBreakGlass: ({ targetOrganizationId, designatedMemberId, ticketId, justification, mfaToken }) =>
    request("/platform/break-glass", {
      method: "POST",
      headers: mfaToken ? { "x-mfa-token": mfaToken } : {},
      body: { targetOrganizationId, designatedMemberId, ticketId, justification, mfaToken },
    }),
  getPlatformAuditLogs: () => request("/platform/audit-logs", { skipCache: true }),

  // Compliance & Velocity Reporting (TASK-507 / DP-REP-001 / US-REP-001)
  getReportsSummary: () => request("/reports/summary"),
  getReportsTrend: (days = 30) => request(`/reports/trend?days=${days}`),
  getReportsWorkload: () => request("/reports/workload"),
  getReportsMemberActivity: (params = {}) => {
    const q = new URLSearchParams();
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    const queryStr = q.toString() ? `?${q.toString()}` : "";
    return request(`/reports/member-activity${queryStr}`);
  },
  getReportsStorage: () => request("/reports/storage"),
  getReportsOverdue: (limit = 10) => request(`/reports/overdue?limit=${limit}`),
  downloadTasksVelocityCsv: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.projectId) q.set("projectId", params.projectId);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    const queryStr = q.toString() ? `?${q.toString()}` : "";
    return request(`/reports/tasks/csv${queryStr}`, { skipCache: true });
  },
  downloadAuditComplianceCsv: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.action) q.set("action", params.action);
    if (params.resourceType) q.set("resourceType", params.resourceType);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    const queryStr = q.toString() ? `?${q.toString()}` : "";
    return request(`/reports/audit/csv${queryStr}`, { skipCache: true });
  },
  // Spaces (ReBAC Container Hierarchy)
  getSpaces: () =>
    request("/spaces")
      .then((data) => ({ spaces: Array.isArray(data) ? data : (data?.spaces || []) }))
      .catch(() => ({ spaces: [] })),
  createSpace: (body) => request("/spaces", { method: "POST", body }),

  // Access Requests (Self-Service Privilege Escalation)
  getAccessRequests: (status) =>
    request(status ? `/access-requests?status=${status}` : "/access-requests")
      .then((data) => ({ requests: Array.isArray(data) ? data : (data?.accessRequests || data?.requests || []) }))
      .catch(() => ({ requests: [] })),
  createAccessRequest: (body) => request("/access-requests", { method: "POST", body }),
  reviewAccessRequest: (id, body) => request(`/access-requests/${id}/review`, { method: "PATCH", body }),

  // Time Tracking Engine
  getTimeEntries: (taskId) => request(`/tasks/${taskId}/time-entries`).catch(() => ({ timeEntries: [] })),
  createTimeEntry: (taskId, body) => request(`/tasks/${taskId}/time-entries`, { method: "POST", body }),

  // Team Collaboration Channels (#Chat)
  getChannels: () => request("/channels").catch(() => ({ channels: [] })),
  getChannelMessages: (channelId) => request(`/channels/${channelId}/messages`).catch(() => ({ messages: [] })),
  sendChannelMessage: (channelId, body) => request(`/channels/${channelId}/messages`, { method: "POST", body }),
};

export const apiClient = api;
