import { prisma } from "../../config/prisma.js";

export async function getDashboardData(req, res, next) {
  try {
    const orgId = req.organizationId;
    const userId = req.auth.userId;

    // 1. Project stats
    const totalProjects = await prisma.project.count({
      where: { organizationId: orgId },
    });

    // 2. Task stats
    const [totalTasks, inProgressTasks, completedTasks, revisionTasks, todoTasks] = await Promise.all([
      prisma.task.count({ where: { organizationId: orgId } }),
      prisma.task.count({ where: { organizationId: orgId, status: "IN_PROGRESS" } }),
      prisma.task.count({ where: { organizationId: orgId, status: "DONE" } }),
      prisma.task.count({ where: { organizationId: orgId, status: "REVISION" } }),
      prisma.task.count({ where: { organizationId: orgId, status: "TODO" } }),
    ]);

    // Task distribution counts
    const [highCount, mediumCount, lowCount] = await Promise.all([
      prisma.task.count({ where: { organizationId: orgId, priority: "HIGH" } }),
      prisma.task.count({ where: { organizationId: orgId, priority: "MEDIUM" } }),
      prisma.task.count({ where: { organizationId: orgId, priority: "LOW" } }),
    ]);

    // 3. Recent Projects (top 4)
    const recentProjects = await prisma.project.findMany({
      where: { organizationId: orgId },
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

    // Format recent projects with aggregated team avatars and link/comment totals
    const formattedProjects = recentProjects.map((p) => {
      const uniqueAssignees = [];
      const seen = new Set();
      let totalComments = 0;
      let totalAttachments = 0;

      for (const t of p.tasks) {
        totalComments += t.commentsCount;
        totalAttachments += t.attachmentsCount;
        if (t.assignee && !seen.has(t.assignee.id)) {
          seen.add(t.assignee.id);
          uniqueAssignees.push(t.assignee);
        }
      }

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        progress: p.progress,
        priority: p.priority,
        team: uniqueAssignees.slice(0, 4),
        commentsCount: totalComments,
        attachmentsCount: totalAttachments,
      };
    });

    // 4. Today's Tasks (assigned to current user, or high priority if unassigned)
    const todayTasks = await prisma.task.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["TODO", "IN_PROGRESS"] },
      },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
      take: 3,
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    // 5. Sample Upcoming Meetings for the tenant workspace
    const upcomingMeetings = [
      { id: 1, title: "Dev Sync Meeting", date: "Monday, Oct 19 — 10:00 AM", platform: "Google Meet" },
      { id: 2, title: "Retrospective Meeting", date: "Tuesday, Oct 20 — 09:00 AM", platform: "Zoom" },
      { id: 3, title: "QA Alignment Call", date: "Thursday, Oct 22 — 11:00 AM", platform: "Google Meet" },
    ];

    // 6. Time-based Activity map (heat levels 0 to 4 for Mon-Fri over 4 weeks)
    const activityMap = [
      [1, 2, 3, 2, 4],
      [2, 3, 2, 4, 3],
      [1, 2, 4, 3, 2],
      [2, 1, 3, 2, 1],
    ];

    return res.json({
      stats: {
        totalProjects,
        totalTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
        revision: revisionTasks,
        todo: todoTasks,
      },
      taskDistribution: {
        high: highCount,
        medium: mediumCount,
        low: lowCount,
        total: totalTasks || 1,
      },
      recentProjects: formattedProjects,
      todayTasks,
      upcomingMeetings,
      activityMap,
    });
  } catch (error) {
    next(error);
  }
}
