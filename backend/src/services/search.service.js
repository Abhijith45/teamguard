import { prisma } from "../../config/prisma.js";

/**
 * Executes a multi-entity search across projects, tasks, members, and files
 * strictly scoped to the caller's active organization tenant boundary.
 *
 * @param {Object} params
 * @param {number} params.organizationId - Active organization ID
 * @param {string} params.query - Search search term
 * @param {number} [params.limit=6] - Max items per category
 * @returns {Promise<Object>} Categorized search results
 */
export async function globalSearchService({
  organizationId,
  query = "",
  limit = 6,
}) {
  const orgId = Number(organizationId);
  const term = typeof query === "string" ? query.trim() : "";
  const maxItems = Math.min(25, Math.max(1, parseInt(limit, 10) || 6));

  if (!orgId) {
    const error = new Error("organizationId is required for tenant search scoping");
    error.statusCode = 400;
    throw error;
  }

  if (!term) {
    return {
      query: "",
      total: 0,
      results: {
        projects: [],
        tasks: [],
        members: [],
        files: [],
      },
    };
  }

  // Check for numeric ID or Jira-like key match (e.g. "TASK-42" -> 42 or "42")
  const keyMatch = term.match(/(?:[a-zA-Z]+-)?(\d+)/);
  const parsedId = keyMatch && keyMatch[1] ? Number(keyMatch[1]) : null;
  const isNumericMatch = Number.isSafeInteger(parsedId) && parsedId > 0;

  const taskOrConditions = [
    { title: { contains: term, mode: "insensitive" } },
    { description: { contains: term, mode: "insensitive" } },
  ];
  if (isNumericMatch) {
    taskOrConditions.push({ id: parsedId });
  }

  // Execute parallel queries across all core domain entities scoped to tenant
  const [projects, tasks, rawMembers, files] = await Promise.all([
    // 1. Projects
    prisma.project.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { key: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        key: true,
        description: true,
        status: true,
        priority: true,
        isArchived: true,
        updatedAt: true,
      },
      take: maxItems,
      orderBy: { updatedAt: "desc" },
    }),

    // 2. Tasks
    prisma.task.findMany({
      where: {
        organizationId: orgId,
        project: { deletedAt: null },
        OR: taskOrConditions,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        projectId: true,
        dueDate: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            key: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
      take: maxItems,
      orderBy: { updatedAt: "desc" },
    }),

    // 3. Organization Members
    prisma.membership.findMany({
      where: {
        organizationId: orgId,
        status: "ACTIVE",
        user: {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { username: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ],
        },
      },
      select: {
        id: true,
        department: true,
        status: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
        roles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      take: maxItems,
    }),

    // 4. File Assets
    prisma.fileAsset.findMany({
      where: {
        organizationId: orgId,
        name: { contains: term, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        fileType: true,
        sizeBytes: true,
        createdAt: true,
      },
      take: maxItems,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Format member records cleanly
  const members = rawMembers.map((m) => ({
    id: m.id,
    userId: m.user.id,
    name: m.user.name,
    username: m.user.username,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    department: m.department,
    status: m.status,
    roles: m.roles.map((r) => r.role.name),
    primaryRole: m.roles[0]?.role.name || "Member",
  }));

  const total = projects.length + tasks.length + members.length + files.length;

  return {
    query: term,
    total,
    results: {
      projects,
      tasks,
      members,
      files,
    },
  };
}
