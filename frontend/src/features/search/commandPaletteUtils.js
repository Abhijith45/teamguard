/**
 * Pure utility functions for the Global Command Palette (Cmd/Ctrl+K)
 * Handles quick actions generation, filtering, multi-entity result flattening,
 * cyclic keyboard navigation indices, and grouped layout helpers.
 */

/**
 * Returns available system quick actions based on user permissions and workspace state.
 *
 * @param {Object} [options={}]
 * @param {string} [options.currentSection=""]
 * @param {Array<string>} [options.permissions=[]]
 * @returns {Array<Object>}
 */
export function getQuickActions({ currentSection = "", permissions = [] } = {}) {
  const actions = [
    {
      id: "nav-dashboard",
      type: "action",
      category: "Quick Actions",
      title: "Go to Dashboard",
      subtitle: "Overview metrics & active assignments",
      iconName: "LayoutDashboard",
      actionType: "navigate",
      targetSection: "dashboard",
      keywords: ["dashboard", "home", "metrics", "overview"],
    },
    {
      id: "nav-tasks",
      type: "action",
      category: "Quick Actions",
      title: "Go to Tasks & Kanban",
      subtitle: "Kanban boards, backlog & filters",
      iconName: "CheckSquare",
      actionType: "navigate",
      targetSection: "tasks",
      keywords: ["tasks", "kanban", "board", "backlog", "todo"],
    },
    {
      id: "nav-projects",
      type: "action",
      category: "Quick Actions",
      title: "Go to Projects",
      subtitle: "Project directory & milestones",
      iconName: "FolderGit2",
      actionType: "navigate",
      targetSection: "tasks",
      keywords: ["projects", "repos", "workspace", "initiatives"],
    },
    {
      id: "nav-members",
      type: "action",
      category: "Quick Actions",
      title: "Go to Member Directory",
      subtitle: "Team roster, departments & assignments",
      iconName: "Users",
      actionType: "navigate",
      targetSection: "members",
      keywords: ["members", "team", "users", "directory", "roster", "people"],
    },
    {
      id: "nav-roles",
      type: "action",
      category: "Quick Actions",
      title: "Go to Roles & Permissions",
      subtitle: "RBAC matrix & custom role configuration",
      iconName: "ShieldCheck",
      actionType: "navigate",
      targetSection: "permissions-matrix",
      keywords: ["roles", "permissions", "rbac", "matrix", "access", "security"],
    },
    {
      id: "nav-audit",
      type: "action",
      category: "Quick Actions",
      title: "Go to Audit Trail & Compliance",
      subtitle: "Immutable security events & actor activity",
      iconName: "ScrollText",
      actionType: "navigate",
      targetSection: "reports",
      keywords: ["audit", "compliance", "logs", "security", "trail", "history", "reports"],
    },
    {
      id: "nav-files",
      type: "action",
      category: "Quick Actions",
      title: "Go to Files & Documents",
      subtitle: "Workspace document library",
      iconName: "FileText",
      actionType: "navigate",
      targetSection: "files",
      keywords: ["files", "documents", "assets", "attachments"],
    },
    {
      id: "nav-settings",
      type: "action",
      category: "Quick Actions",
      title: "Go to Account Settings",
      subtitle: "Profile, passwords & credentials",
      iconName: "User",
      actionType: "navigate",
      targetSection: "account",
      keywords: ["settings", "account", "profile", "password", "security"],
    },
  ];

  // Dynamic creation actions based on RBAC permissions
  const perms = Array.isArray(permissions) ? permissions : [];
  if (perms.includes("task:create") || perms.includes("*")) {
    actions.unshift({
      id: "action-create-task",
      type: "action",
      category: "Quick Actions",
      title: "Create New Task",
      subtitle: "Add a work item to the active project",
      iconName: "Plus",
      actionType: "create-task",
      keywords: ["new task", "create task", "add task", "todo"],
    });
  }

  if (perms.includes("project:create") || perms.includes("*")) {
    actions.unshift({
      id: "action-create-project",
      type: "action",
      category: "Quick Actions",
      title: "Create New Project",
      subtitle: "Launch project setup wizard",
      iconName: "FolderPlus",
      actionType: "create-project",
      keywords: ["new project", "create project", "launch project"],
    });
  }

  return actions;
}

/**
 * Filters quick actions against a search query string.
 * When query is empty, returns the first 5 default actions.
 *
 * @param {Array<Object>} actions
 * @param {string} query
 * @returns {Array<Object>}
 */
export function filterQuickActions(actions, query = "") {
  const term = (query || "").trim().toLowerCase();
  if (!term) return (actions || []).slice(0, 5);
  return (actions || []).filter((act) => {
    if (act.title.toLowerCase().includes(term)) return true;
    if (act.subtitle.toLowerCase().includes(term)) return true;
    if (act.keywords && act.keywords.some((k) => k.toLowerCase().includes(term))) return true;
    return false;
  });
}

/**
 * Flattens categorized search results and quick actions into a single linear array
 * with continuous globalIndex tracking for cyclic keyboard arrow navigation.
 *
 * @param {Object} [options={}]
 * @param {Object} [options.results={}]
 * @param {Array<Object>} [options.quickActions=[]]
 * @returns {Array<Object>}
 */
export function flattenSearchResults({ results = {}, quickActions = [] } = {}) {
  const items = [];
  let index = 0;

  // 1. Quick Actions
  if (quickActions && quickActions.length > 0) {
    for (const act of quickActions) {
      items.push({
        ...act,
        category: "Quick Actions",
        globalIndex: index++,
      });
    }
  }

  // 2. Projects
  const projects = results.projects || [];
  for (const proj of projects) {
    items.push({
      id: `project-${proj.id}`,
      type: "project",
      category: "Projects",
      title: proj.name,
      subtitle: proj.key ? `Key: ${proj.key} • ${proj.status || "ACTIVE"}` : (proj.status || "ACTIVE"),
      status: proj.status,
      priority: proj.priority,
      payload: proj,
      globalIndex: index++,
    });
  }

  // 3. Tasks
  const tasks = results.tasks || [];
  for (const task of tasks) {
    const projectKey = task.project?.key ? `${task.project.key}-${task.id}` : `TASK-${task.id}`;
    const assigneeName = task.assignee?.name || "Unassigned";
    items.push({
      id: `task-${task.id}`,
      type: "task",
      category: "Tasks",
      title: task.title,
      subtitle: `${projectKey} • ${task.status} • Assignee: ${assigneeName}`,
      status: task.status,
      priority: task.priority,
      payload: task,
      globalIndex: index++,
    });
  }

  // 4. Members
  const members = results.members || [];
  for (const mem of members) {
    items.push({
      id: `member-${mem.id}`,
      type: "member",
      category: "Members",
      title: mem.name,
      subtitle: `${mem.email} • ${mem.primaryRole || "Member"}${mem.department ? ` (${mem.department})` : ""}`,
      avatarUrl: mem.avatarUrl,
      role: mem.primaryRole,
      payload: mem,
      globalIndex: index++,
    });
  }

  // 5. Files
  const files = results.files || [];
  for (const file of files) {
    const sizeKB = file.sizeBytes ? `${Math.round(file.sizeBytes / 1024)} KB` : "";
    items.push({
      id: `file-${file.id}`,
      type: "file",
      category: "Files",
      title: file.name,
      subtitle: `${file.fileType || "Document"}${sizeKB ? ` • ${sizeKB}` : ""}`,
      payload: file,
      globalIndex: index++,
    });
  }

  return items;
}

/**
 * Computes the next selected item index for cyclic arrow-key navigation with wrap-around.
 *
 * @param {number} currentIndex - Active index (-1 if none selected)
 * @param {number} totalCount - Total items in list
 * @param {"down" | "up"} direction - Arrow direction
 * @returns {number} Next active index
 */
export function getNextNavIndex(currentIndex, totalCount, direction) {
  if (!totalCount || totalCount <= 0) return -1;
  if (direction === "down") {
    if (currentIndex < 0 || currentIndex >= totalCount) return 0;
    return (currentIndex + 1) % totalCount;
  }
  if (direction === "up") {
    if (currentIndex < 0 || currentIndex >= totalCount) return totalCount - 1;
    return (currentIndex - 1 + totalCount) % totalCount;
  }
  return currentIndex;
}

/**
 * Groups flattened items by category while preserving their assigned globalIndex.
 *
 * @param {Array<Object>} flatItems
 * @returns {Array<{ category: string, items: Array<Object> }>}
 */
export function groupFlattenedItems(flatItems = []) {
  const groups = [];
  const groupMap = new Map();

  for (const item of flatItems) {
    const cat = item.category || "Other";
    if (!groupMap.has(cat)) {
      const g = { category: cat, items: [] };
      groupMap.set(cat, g);
      groups.push(g);
    }
    groupMap.get(cat).items.push(item);
  }

  return groups;
}
