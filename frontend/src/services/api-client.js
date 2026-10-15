const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";
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
  return readResponse(response);
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

  // Demo Persona Switcher
  switchPersona: (persona, organizationSlug = "acme-corp") =>
    request("/demo/switch-persona", {
      method: "POST",
      body: { persona, organizationSlug },
    }),

  // Organizations
  getOrganizations: () => request("/organizations"),
  createOrganization: (body) => request("/organizations", { method: "POST", body }),
  getMembers: () => request("/organizations/members"),

  // Dashboard
  getDashboard: () => request("/dashboard"),

  // Projects
  getProjects: () => request("/projects"),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (body) => request("/projects", { method: "POST", body }),
  updateProject: (id, body) => request(`/projects/${id}`, { method: "PATCH", body }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),

  // Tasks
  getTasks: (params = "") => request(`/tasks${params ? `?${params}` : ""}`),
  createTask: (body) => request("/tasks", { method: "POST", body }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: "PATCH", body }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: "DELETE" }),

  // Files
  getFiles: (params = "") => request(`/files${params ? `?${params}` : ""}`),
  createFile: (body) => request("/files", { method: "POST", body }),
  bulkDeleteFiles: (fileIds) => request("/files/bulk-delete", { method: "POST", body: { fileIds } }),
  bulkDuplicateFiles: (fileIds) => request("/files/bulk-duplicate", { method: "POST", body: { fileIds } }),
  deleteFile: (id) => request(`/files/${id}`, { method: "DELETE" }),

  // Permissions Matrix
  getPermissionsMatrix: () => request("/permissions-matrix"),
  togglePermission: (roleId, permissionId, enabled) =>
    request("/permissions-matrix/toggle", {
      method: "POST",
      body: { roleId, permissionId, enabled },
    }),
};
