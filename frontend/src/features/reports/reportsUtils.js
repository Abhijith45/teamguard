/**
 * Utility functions for Workspace Compliance & Velocity Reporting (TASK-507 / DP-REP-001).
 */

/**
 * Calculates task completion rate percentage formatted to 1 decimal place.
 */
export function calculateCompletionRate(completed = 0, total = 0) {
  const c = Number(completed) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Number(((c / t) * 100).toFixed(1));
}

/**
 * Formats lead time in days into a human-readable string.
 */
export function formatLeadTimeDays(days) {
  if (days === null || days === undefined || isNaN(days)) return "—";
  const num = Number(days);
  if (num <= 0) return "0.0 days";
  return `${num.toFixed(1)} days`;
}

/**
 * Sanitizes and generates export filename for CSV downloads.
 */
export function generateExportFilename(reportType, orgSlug = "workspace") {
  const sanitizedSlug = (orgSlug || "workspace").toLowerCase().replace(/[^a-z0-9]/g, "-");
  const timestamp = new Date().toISOString().slice(0, 10);
  return `teamguard-${reportType}-${sanitizedSlug}-${timestamp}.csv`;
}

/**
 * Builds valid query parameters object from report filter inputs.
 */
export function buildExportQueryParams(filters = {}) {
  const params = {};
  if (filters.projectId) params.projectId = String(filters.projectId);
  if (filters.action) params.action = String(filters.action);
  if (filters.resourceType) params.resourceType = String(filters.resourceType);
  if (filters.from) params.from = String(filters.from);
  if (filters.to) params.to = String(filters.to);
  return params;
}

/**
 * Evaluates whether current user has permission to export specific reports.
 */
export function canExportReport(userPermissions, reportType = "velocity") {
  if (!userPermissions) return false;
  const perms =
    userPermissions instanceof Set
      ? userPermissions
      : new Set(Array.isArray(userPermissions) ? userPermissions : []);

  if (perms.has("report:export")) return true;

  if (reportType === "velocity") {
    return perms.has("dashboard:export") || perms.has("task:export");
  }

  if (reportType === "audit") {
    return perms.has("audit:read");
  }

  return false;
}
