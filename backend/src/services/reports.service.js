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
  const now = new Date();

  const [
    totalTasks,
    completedTasks,
    inProgressTasks,
    revisionTasks,
    todoTasks,
    totalProjects,
    totalAuditLogs,
    overdueCount,
    unassignedCount,
    urgentCount,
    highCount,
    mediumCount,
    lowCount,
    recentCompleted,
  ] = await Promise.all([
    prisma.task.count({ where: { organizationId: orgId } }),
    prisma.task.count({ where: { organizationId: orgId, status: "DONE" } }),
    prisma.task.count({ where: { organizationId: orgId, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { organizationId: orgId, status: "REVISION" } }),
    prisma.task.count({ where: { organizationId: orgId, status: "TODO" } }),
    prisma.project.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.auditLog.count({ where: { organizationId: orgId } }),
    prisma.task.count({
      where: { organizationId: orgId, status: { not: "DONE" }, dueDate: { lt: now } },
    }),
    prisma.task.count({
      where: { organizationId: orgId, status: { not: "DONE" }, assigneeId: null },
    }),
    prisma.task.count({ where: { organizationId: orgId, priority: "URGENT" } }),
    prisma.task.count({ where: { organizationId: orgId, priority: "HIGH" } }),
    prisma.task.count({ where: { organizationId: orgId, priority: "MEDIUM" } }),
    prisma.task.count({ where: { organizationId: orgId, priority: "LOW" } }),
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
    revisionTasks,
    todoTasks,
    totalProjects,
    totalAuditLogs,
    completionRate,
    avgLeadTimeDays,
    overdueCount,
    unassignedCount,
    priorityBreakdown: { URGENT: urgentCount, HIGH: highCount, MEDIUM: mediumCount, LOW: lowCount },
  };
}

/**
 * Returns daily task completion counts for the past N days (default 30).
 */
export async function getCompletionTrendService({ organizationId, days = 30 }) {
  const orgId = Number(organizationId);
  const numDays = Math.min(Math.max(Number(days) || 30, 7), 90);
  const from = new Date();
  from.setDate(from.getDate() - numDays + 1);
  from.setHours(0, 0, 0, 0);

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: orgId,
      status: "DONE",
      OR: [
        { completedAt: { gte: from } },
        { updatedAt: { gte: from }, completedAt: null },
      ],
    },
    select: { completedAt: true, updatedAt: true },
  });

  const countByDate = new Map();
  for (let i = 0; i < numDays; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    countByDate.set(d.toISOString().slice(0, 10), 0);
  }

  for (const t of tasks) {
    const dateKey = new Date(t.completedAt || t.updatedAt).toISOString().slice(0, 10);
    if (countByDate.has(dateKey)) {
      countByDate.set(dateKey, countByDate.get(dateKey) + 1);
    }
  }

  return Array.from(countByDate.entries()).map(([date, count]) => ({ date, count }));
}

/**
 * Returns workload distribution grouped by assignee.
 */
export async function getWorkloadReportService({ organizationId }) {
  const orgId = Number(organizationId);

  const [tasks, memberships] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: orgId, status: { not: "DONE" } },
      select: {
        status: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true, email: true, username: true } },
      },
    }),
    prisma.membership.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
        roles: { include: { role: { select: { name: true } } } },
      },
    }),
  ]);

  const memberMap = new Map();
  for (const m of memberships) {
    const roleName = m.roles?.[0]?.role?.name || "Member";
    memberMap.set(m.user.id, {
      userId: m.user.id,
      name: m.user.name || m.user.username || m.user.email,
      role: roleName,
      TODO: 0,
      IN_PROGRESS: 0,
      REVISION: 0,
      total: 0,
    });
  }

  const unassignedByStatus = { TODO: 0, IN_PROGRESS: 0, REVISION: 0, total: 0 };

  for (const t of tasks) {
    if (t.assigneeId && memberMap.has(t.assigneeId)) {
      const entry = memberMap.get(t.assigneeId);
      entry[t.status] = (entry[t.status] || 0) + 1;
      entry.total += 1;
    } else if (!t.assigneeId) {
      unassignedByStatus[t.status] = (unassignedByStatus[t.status] || 0) + 1;
      unassignedByStatus.total += 1;
    }
  }

  const members = Array.from(memberMap.values()).sort((a, b) => b.total - a.total);
  return { members, unassigned: unassignedByStatus };
}

/**
 * Returns per-member activity stats.
 */
export async function getMemberActivityService({ organizationId, from, to }) {
  const orgId = Number(organizationId);

  const dateFilter = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);
  const hasDateFilter = from || to;

  const memberships = await prisma.membership.findMany({
    where: { organizationId: orgId, status: "ACTIVE" },
    include: {
      user: { select: { id: true, name: true, email: true, username: true } },
      roles: { include: { role: { select: { name: true } } } },
    },
  });

  const results = await Promise.all(
    memberships.map(async (m) => {
      const userId = m.user.id;
      const baseFilter = { organizationId: orgId };
      if (hasDateFilter) baseFilter.createdAt = dateFilter;

      const [created, completedTasks, lastAudit] = await Promise.all([
        prisma.task.count({ where: { ...baseFilter, creatorId: userId } }),
        prisma.task.findMany({
          where: { ...baseFilter, assigneeId: userId, status: "DONE" },
          select: { createdAt: true, completedAt: true, updatedAt: true },
        }),
        prisma.auditLog.findFirst({
          where: { organizationId: orgId, actorId: userId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);

      let totalMs = 0;
      for (const t of completedTasks) {
        const finish = t.completedAt ? new Date(t.completedAt).getTime() : new Date(t.updatedAt).getTime();
        totalMs += Math.max(0, finish - new Date(t.createdAt).getTime());
      }
      const avgLeadDays =
        completedTasks.length > 0
          ? Number((totalMs / completedTasks.length / (1000 * 60 * 60 * 24)).toFixed(1))
          : null;

      const roleName = m.roles?.[0]?.role?.name || "Member";
      return {
        userId,
        name: m.user.name || m.user.username || m.user.email,
        role: roleName,
        tasksCreated: created,
        tasksCompleted: completedTasks.length,
        avgLeadDays,
        lastActive: lastAudit?.createdAt || null,
      };
    })
  );

  return results.sort((a, b) => b.tasksCompleted - a.tasksCompleted);
}

/**
 * Returns file/storage breakdown by project.
 */
export async function getStorageReportService({ organizationId }) {
  const orgId = Number(organizationId);

  const [files, storageByProject, totalStorage] = await Promise.all([
    prisma.fileAsset.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        project: { select: { id: true, name: true, key: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.fileAsset.groupBy({
      by: ["projectId"],
      where: { organizationId: orgId },
      _count: { id: true },
      _sum: { sizeBytes: true },
      _max: { createdAt: true },
    }),
    prisma.fileAsset.aggregate({
      where: { organizationId: orgId },
      _sum: { sizeBytes: true },
      _count: { id: true },
      _max: { sizeBytes: true },
    }),
  ]);

  const projectIds = storageByProject.map((r) => r.projectId).filter(Boolean);
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, organizationId: orgId },
    select: { id: true, name: true, key: true },
  });
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const breakdown = storageByProject
    .map((r) => {
      const proj = r.projectId ? projectMap.get(r.projectId) : null;
      return {
        projectId: r.projectId,
        projectName: proj?.name || "No Project",
        projectKey: proj?.key || null,
        fileCount: r._count.id,
        totalBytes: Number(r._sum.sizeBytes || 0),
        lastUpload: r._max.createdAt,
      };
    })
    .sort((a, b) => b.totalBytes - a.totalBytes);

  return {
    totalBytes: Number(totalStorage._sum.sizeBytes || 0),
    totalFiles: totalStorage._count.id || 0,
    largestFileBytes: Number(totalStorage._max.sizeBytes || 0),
    breakdown,
    recentFiles: files.map((f) => ({
      id: f.id,
      name: f.name,
      sizeBytes: Number(f.sizeBytes || 0),
      type: f.type,
      projectName: f.project?.name || "No Project",
      uploaderName: f.uploadedBy?.name || f.uploadedBy?.email || "Unknown",
      createdAt: f.createdAt,
    })),
  };
}

/**
 * Returns top overdue tasks (not DONE and past due date).
 */
export async function getOverdueTasksService({ organizationId, limit = 10 }) {
  const orgId = Number(organizationId);
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: orgId,
      status: { not: "DONE" },
      dueDate: { lt: now },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
    take: Number(limit),
    include: {
      project: { select: { id: true, name: true, key: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    daysOverdue: Math.ceil((now.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24)),
    projectName: t.project?.name || "No Project",
    projectKey: t.project?.key || null,
    assigneeName: t.assignee?.name || null,
  }));
}
