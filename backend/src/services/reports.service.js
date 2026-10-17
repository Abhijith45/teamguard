import { prisma } from "../../config/prisma.js";
import { formatActivitySummary } from "./audit.service.js";

/**
 * Escapes values for standard RFC 4180 CSV output with formula injection prevention.
 */
export function escapeCsvValue(val) {
  if (val === null || val === undefined) return "";
  let str = String(val);

  // Prevent spreadsheet formula injection (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If containing quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts array of rows into RFC 4180 CSV string.
 */
export function buildCsvString(headers, rows) {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvValue).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

/**
 * Generates task velocity and completion rate data scoped strictly to an organization.
 */
export async function getVelocityReportData({ organizationId, projectId, from, to }) {
  const orgId = Number(organizationId);
  const where = {
    organizationId: orgId,
  };

  if (projectId) {
    const pId = Number(projectId);
    if (!isNaN(pId)) where.projectId = pId;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, key: true } },
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  let totalLeadTimeMs = 0;
  let completedCount = 0;
  let inProgressCount = 0;
  let revisionCount = 0;
  let todoCount = 0;

  const rows = tasks.map((t) => {
    const isCompleted = t.status === "DONE";
    let leadTimeDays = "";
    if (isCompleted) {
      completedCount++;
      const finishTime = t.completedAt ? new Date(t.completedAt).getTime() : new Date(t.updatedAt).getTime();
      const startTime = new Date(t.createdAt).getTime();
      const diffMs = Math.max(0, finishTime - startTime);
      totalLeadTimeMs += diffMs;
      leadTimeDays = (diffMs / (1000 * 60 * 60 * 24)).toFixed(1);
    } else if (t.status === "IN_PROGRESS") {
      inProgressCount++;
    } else if (t.status === "REVISION") {
      revisionCount++;
    } else if (t.status === "TODO") {
      todoCount++;
    }

    const taskKey = t.project?.key ? `${t.project.key}-${t.id}` : `TASK-${t.id}`;

    return [
      t.id,
      taskKey,
      t.title,
      t.status,
      t.priority,
      t.projectId,
      t.project?.name || "Unassigned",
      t.assignee?.name || t.assignee?.email || "Unassigned",
      t.creator?.name || t.creator?.email || "System",
      t.createdAt ? new Date(t.createdAt).toISOString() : "",
      t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
      t.completedAt ? new Date(t.completedAt).toISOString() : "",
      leadTimeDays,
    ];
  });

  const headers = [
    "Task ID",
    "Task Key",
    "Title",
    "Status",
    "Priority",
    "Project ID",
    "Project Name",
    "Assignee",
    "Creator",
    "Created At",
    "Due Date",
    "Completed At",
    "Lead Time (Days)",
  ];

  const totalTasks = tasks.length;
  const completionRate = totalTasks > 0 ? Number(((completedCount / totalTasks) * 100).toFixed(1)) : 0;
  const avgLeadTimeDays =
    completedCount > 0 ? Number((totalLeadTimeMs / completedCount / (1000 * 60 * 60 * 24)).toFixed(1)) : 0;

  const csv = buildCsvString(headers, rows);

  return {
    csv,
    count: totalTasks,
    summary: {
      totalTasks,
      completedCount,
      inProgressCount,
      revisionCount,
      todoCount,
      completionRate,
      avgLeadTimeDays,
    },
  };
}

/**
 * Generates compliance and security audit trail data scoped strictly to an organization.
 */
export async function getAuditComplianceReportData({ organizationId, action, resourceType, outcome, from, to }) {
  const orgId = Number(organizationId);
  const where = {
    organizationId: orgId,
  };

  if (action) where.action = action;
  if (resourceType) where.resourceType = resourceType;
  if (outcome) where.outcome = outcome;

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      actor: { select: { id: true, name: true, email: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = logs.map((l) => {
    let detailsObj = null;
    let detailsSummary = "";
    try {
      if (typeof l.details === "string") {
        detailsObj = JSON.parse(l.details);
      } else if (typeof l.details === "object" && l.details !== null) {
        detailsObj = l.details;
      }
    } catch {
      detailsSummary = String(l.details || "");
    }

    const summaryText = formatActivitySummary(
      l.action,
      l.resourceType,
      detailsObj,
      l.actor?.name || l.actor?.username || "System"
    );

    return [
      l.id,
      l.createdAt ? new Date(l.createdAt).toISOString() : "",
      l.actorId || "System",
      l.actor?.name || l.actor?.username || "System",
      l.actor?.email || "",
      l.action,
      l.resourceType,
      l.resourceId || "",
      l.outcome,
      summaryText || detailsSummary,
    ];
  });

  const headers = [
    "Audit Log ID",
    "Timestamp",
    "Actor ID",
    "Actor Name",
    "Actor Email",
    "Action",
    "Resource Type",
    "Resource ID",
    "Outcome",
    "Summary",
  ];

  const csv = buildCsvString(headers, rows);

  return {
    csv,
    count: logs.length,
  };
}

/**
 * Generates aggregated JSON summary metrics for workspace reporting dashboard.
 */
export async function getReportsSummaryService({ organizationId }) {
  const orgId = Number(organizationId);

  const [totalTasks, completedTasks, inProgressTasks, totalProjects, totalAuditLogs, recentCompleted] =
    await Promise.all([
      prisma.task.count({ where: { organizationId: orgId } }),
      prisma.task.count({ where: { organizationId: orgId, status: "DONE" } }),
      prisma.task.count({ where: { organizationId: orgId, status: "IN_PROGRESS" } }),
      prisma.project.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.auditLog.count({ where: { organizationId: orgId } }),
      prisma.task.findMany({
        where: { organizationId: orgId, status: "DONE" },
        select: { createdAt: true, completedAt: true, updatedAt: true },
        take: 100,
      }),
    ]);

  let totalLeadTimeMs = 0;
  for (const t of recentCompleted) {
    const finish = t.completedAt ? new Date(t.completedAt).getTime() : new Date(t.updatedAt).getTime();
    const start = new Date(t.createdAt).getTime();
    totalLeadTimeMs += Math.max(0, finish - start);
  }

  const avgLeadTimeDays =
    recentCompleted.length > 0
      ? Number((totalLeadTimeMs / recentCompleted.length / (1000 * 60 * 60 * 24)).toFixed(1))
      : 0;

  const completionRate = totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0;

  return {
    totalTasks,
    completedTasks,
    inProgressTasks,
    totalProjects,
    totalAuditLogs,
    completionRate,
    avgLeadTimeDays,
  };
}
