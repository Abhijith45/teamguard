import { prisma } from "../../config/prisma.js";
import { getNotificationPreferencesService } from "./notifications.service.js";

/**
 * Format bytes into human-readable string (e.g. "14.2 MB", "256 KB")
 */
export function formatStorageBytes(bytes = 0) {
  const b = Number(bytes) || 0;
  if (b === 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i] || "MB"}`;
}

/**
 * Calculates a 90-day GitHub-style contribution matrix (13 weeks x 7 days = 91 days).
 * Aggregates task completions (completedAt) and audit logs (createdAt) by date.
 */
export function calculate90DayHeatmap(completedTasks = [], auditLogs = [], referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  ref.setHours(23, 59, 59, 999);

  // Group events by YYYY-MM-DD
  const dateCounts = new Map();

  for (const t of completedTasks) {
    const d = t.completedAt || t.updatedAt;
    if (d) {
      const key = new Date(d).toISOString().slice(0, 10);
      dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
    }
  }

  for (const a of auditLogs) {
    if (a.createdAt) {
      const key = new Date(a.createdAt).toISOString().slice(0, 10);
      dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
    }
  }

  // Generate 91 days ending on ref date (13 full weeks)
  const days = [];
  for (let i = 90; i >= 0; i--) {
    const d = new Date(ref);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const count = dateCounts.get(dateStr) || 0;

    let level = 0;
    if (count >= 8) level = 4;
    else if (count >= 5) level = 3;
    else if (count >= 3) level = 2;
    else if (count >= 1) level = 1;

    days.push({
      date: dateStr,
      count,
      level,
      dayOfWeek: d.getDay(), // 0 = Sun, 1 = Mon ...
    });
  }

  // Partition into 13 weeks of 7 days
  const weeks = [];
  for (let w = 0; w < 13; w++) {
    const weekDays = days.slice(w * 7, (w + 1) * 7);
    weeks.push(weekDays.map((d) => d.level));
  }

  return {
    totalEvents: Array.from(dateCounts.values()).reduce((sum, n) => sum + n, 0),
    days,
    weeks,
    activeDaysCount: Array.from(dateCounts.values()).filter((c) => c > 0).length,
  };
}

/**
 * Main dashboard data aggregation service.
 * Strictly scopes all queries by organizationId to guarantee multi-tenant security.
 */
export async function getDashboardDataService({ organizationId, userId }) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);

  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);

  // 1. KPI Counts
  const [
    totalProjects,
    activeProjects,
    totalTasks,
    inProgressTasks,
    completedTasks,
    revisionTasks,
    todoTasks,
    activeMembers,
    urgentCount,
    highCount,
    mediumCount,
    lowCount,
    storageAgg,
  ] = await Promise.all([
    prisma.project.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.project.count({ where: { organizationId: orgId, deletedAt: null, isArchived: false } }),
    prisma.task.count({ where: { organizationId: orgId } }),
    prisma.task.count({ where: { organizationId: orgId, status: "IN_PROGRESS" } }),
    prisma.task.count({ where: { organizationId: orgId, status: "DONE" } }),
    prisma.task.count({ where: { organizationId: orgId, status: "REVISION" } }),
    prisma.task.count({ where: { organizationId: orgId, status: "TODO" } }),
    prisma.membership.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.task.count({ where: { organizationId: orgId, priority: "URGENT" } }),
    prisma.task.count({ where: { organizationId: orgId, priority: "HIGH" } }),
    prisma.task.count({ where: { organizationId: orgId, priority: "MEDIUM" } }),
    prisma.task.count({ where: { organizationId: orgId, priority: "LOW" } }),
    prisma.fileAsset.aggregate({
      where: { organizationId: orgId },
      _sum: { sizeBytes: true },
    }),
  ]);

  const storageBytes = storageAgg?._sum?.sizeBytes || 0;

  // 2. Urgent Tasks Due Within 48 Hours Feed (US-DASH-002)
  const urgent48hTasks = await prisma.task.findMany({
    where: {
      organizationId: orgId,
      status: { not: "DONE" },
      OR: [
        { dueDate: { lte: in48Hours } },
        { priority: "URGENT" },
      ],
    },
    orderBy: [
      { dueDate: "asc" },
      { priority: "asc" },
    ],
    take: 6,
    include: {
      project: { select: { id: true, name: true, key: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  // 3. Today's Tasks Interactive Checklist (US-DASH-004)
  const todayTasks = await prisma.task.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["TODO", "IN_PROGRESS", "REVISION"] },
      OR: [
        { assigneeId: targetUserId },
        { assigneeId: null },
      ],
    },
    orderBy: [
      { priority: "asc" },
      { dueDate: "asc" },
      { updatedAt: "desc" },
    ],
    take: 5,
    include: {
      project: { select: { id: true, name: true, key: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  // 4. Recent Projects Overview with Live Visual Progress Bars (US-DASH-002)
  const recentProjects = await prisma.project.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 4,
    include: {
      tasks: {
        select: {
          id: true,
          status: true,
          commentsCount: true,
          attachmentsCount: true,
          assignee: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      },
    },
  });

  const formattedProjects = recentProjects.map((p) => {
    const uniqueAssignees = [];
    const seen = new Set();
    let totalComments = 0;
    let totalAttachments = 0;
    let doneCount = 0;

    for (const t of p.tasks) {
      totalComments += t.commentsCount;
      totalAttachments += t.attachmentsCount;
      if (t.status === "DONE") doneCount += 1;
      if (t.assignee && !seen.has(t.assignee.id)) {
        seen.add(t.assignee.id);
        uniqueAssignees.push(t.assignee);
      }
    }

    const progress = p.tasks.length > 0 ? Math.round((doneCount / p.tasks.length) * 100) : p.progress;

    return {
      id: p.id,
      name: p.name,
      key: p.key,
      isArchived: p.isArchived,
      description: p.description,
      status: p.status,
      progress,
      priority: p.priority,
      team: uniqueAssignees.slice(0, 4),
      commentsCount: totalComments,
      attachmentsCount: totalAttachments,
      tasksTotal: p.tasks.length,
      tasksDone: doneCount,
    };
  });

  // 5. Recent Workspace Activity Feed Stream (US-DASH-005)
  const recentActivityLogs = await prisma.auditLog.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  const activityFeed = recentActivityLogs.map((log) => ({
    id: log.id,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    details: log.details,
    outcome: log.outcome,
    createdAt: log.createdAt,
    actor: log.actor || { name: "System", username: "system" },
  }));

  // 6. 90-Day Contribution Heatmap Aggregation (US-DASH-006 / US-DASH-005)
  const [doneTasksPast90Days, auditLogsPast90Days] = await Promise.all([
    prisma.task.findMany({
      where: {
        organizationId: orgId,
        status: "DONE",
        updatedAt: { gte: ninetyDaysAgo },
      },
      select: { completedAt: true, updatedAt: true },
    }),
    prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: ninetyDaysAgo },
      },
      select: { createdAt: true },
    }),
  ]);

  const heatmap = calculate90DayHeatmap(doneTasksPast90Days, auditLogsPast90Days, now);

  // 7. Notification Preferences (US-NOTIF-003)
  const preferences = await getNotificationPreferencesService({
    organizationId: orgId,
    userId: targetUserId,
  });

  return {
    stats: {
      totalProjects,
      activeProjects,
      totalTasks,
      inProgress: inProgressTasks,
      completed: completedTasks,
      revision: revisionTasks,
      todo: todoTasks,
      activeMembers,
      storageBytes,
      storageFormatted: formatStorageBytes(storageBytes),
      urgentTasksCount: urgent48hTasks.length,
    },
    taskDistribution: {
      urgent: urgentCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      total: totalTasks || 1,
    },
    recentProjects: formattedProjects,
    todayTasks,
    urgent48hTasks,
    activityFeed,
    contributionHeatmap: heatmap,
    // Backwards-compatible fields for existing components
    activityMap: heatmap.weeks.slice(0, 4), // 4-week slice for existing widget
    upcomingMeetings: [
      { id: 1, title: "Sprint Release Review", date: "Monday — 10:00 AM", platform: "Google Meet" },
      { id: 2, title: "Architecture & Security Sync", date: "Wednesday — 02:00 PM", platform: "Zoom" },
      { id: 3, title: "QA Release Sign-off", date: "Friday — 11:30 AM", platform: "Google Meet" },
    ],
    userPreferences: preferences,
  };
}
