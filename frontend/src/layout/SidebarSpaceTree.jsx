import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderPlus,
  Plus,
  Search,
  X,
  Archive,
  ExternalLink,
} from "lucide-react";

export function SidebarSpaceTree({
  projects = [],
  spaces = [],
  activeProjectId = null,
  section = "",
  onSelectProject,
  onOpenWizard,
  onOpenCreateSpace,
  onOpenDirectory,
}) {
  const [filterQuery, setFilterQuery] = useState("");
  const [collapsedSpaces, setCollapsedSpaces] = useState({});

  const toggleSpaceCollapse = (spaceKey) => {
    setCollapsedSpaces((prev) => ({
      ...prev,
      [spaceKey]: !prev[spaceKey],
    }));
  };

  // Group active (unarchived) projects by Space
  const spaceGroups = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();

    // Filter out archived projects: the active sidebar navigation only displays active projects.
    // Archived projects are accessible exclusively via the Project Directory modal.
    const activeProjects = (projects || []).filter(
      (p) => !p.isArchived && !p.archived && p.status !== "ARCHIVED"
    );

    // Map existing spaces
    const groups = spaces.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || "#6366F1",
      projects: [],
    }));

    // General Workspace bucket
    const generalGroup = {
      id: "GENERAL",
      name: "General Workspace",
      color: "#64748B",
      projects: [],
    };

    // Distribute active projects
    for (const proj of activeProjects) {
      if (proj.spaceId) {
        const found = groups.find((g) => g.id === proj.spaceId);
        if (found) {
          found.projects.push(proj);
          continue;
        }
      }
      generalGroup.projects.push(proj);
    }

    const allGroups = [...groups];
    if (generalGroup.projects.length > 0 || groups.length === 0) {
      allGroups.push(generalGroup);
    }

    // Filter by query if present
    if (q) {
      return allGroups
        .map((group) => {
          const matchingProjects = group.projects.filter(
            (p) =>
              (p.name || "").toLowerCase().includes(q) ||
              (p.key || "").toLowerCase().includes(q)
          );
          const groupNameMatches = group.name.toLowerCase().includes(q);
          return {
            ...group,
            projects: groupNameMatches ? group.projects : matchingProjects,
          };
        })
        .filter((group) => group.projects.length > 0);
    }

    return allGroups;
  }, [projects, spaces, filterQuery]);

  const MAX_DISPLAYED_PER_SPACE = 12;

  return (
    <div className="sidebar-spaces-tree-container">
      {/* Header and Filter Input */}
      <div className="space-tree-search-wrap">
        <Search
          size={13}
          className="space-tree-search-icon"
        />
        <input
          type="text"
          placeholder="Filter spaces & projects..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="space-tree-search-input"
          data-testid="space-tree-search-input"
        />
        {filterQuery && (
          <button
            type="button"
            onClick={() => setFilterQuery("")}
            className="space-tree-search-clear"
            title="Clear filter"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Spaces Accordions */}
      <div className="space-groups-container">
        {spaceGroups.map((group) => {
          const isCollapsed = Boolean(collapsedSpaces[group.id]) && !filterQuery;
          const totalProjects = group.projects.length;
          const displayedProjects = group.projects.slice(0, MAX_DISPLAYED_PER_SPACE);
          const hasOverflow = totalProjects > MAX_DISPLAYED_PER_SPACE;

          return (
            <div key={group.id} className="space-group-node" data-testid={`space-node-${group.id}`}>
              {/* Space Header Row */}
              <div
                className="space-group-header"
                onClick={() => toggleSpaceCollapse(group.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSpaceCollapse(group.id);
                  }
                }}
              >
                <div className="space-group-left">
                  <button
                    type="button"
                    className="space-group-collapse-btn"
                    tabIndex={-1}
                    aria-label={isCollapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                  </button>
                  <div
                    className="space-group-dot"
                    style={{ backgroundColor: group.color }}
                  />
                  <span className="space-group-name">
                    {group.name}
                  </span>
                </div>

                <div className="space-group-right">
                  <span className="space-group-count">
                    {totalProjects}
                  </span>
                  {onOpenWizard && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenWizard(group.id !== "GENERAL" ? group.id : null);
                      }}
                      title={`New project in ${group.name}`}
                      className="space-group-add-btn"
                      aria-label={`New project in ${group.name}`}
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Nested Projects List */}
              {!isCollapsed && (
                <div className="space-projects-list">
                  {displayedProjects.length === 0 ? (
                    <div className="space-empty-label">
                      No projects
                    </div>
                  ) : (
                    displayedProjects.map((proj) => {
                      const isActive =
                        section === `project-${proj.id}` ||
                        (section === "tasks" && String(activeProjectId) === String(proj.id));
                      const activeTaskCount =
                        proj.activeTaskCount ??
                        ((proj.todoCount || 0) + (proj.inProgressCount || 0));

                      return (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => onSelectProject(proj.id)}
                          title={`${proj.name} — ${activeTaskCount} active tasks (Todo + In Progress)`}
                          className={`space-project-btn sidebar-project-item project-item-btn ${
                            isActive ? "active" : ""
                          }`}
                          data-testid={`sidebar-project-${proj.id}`}
                        >
                          <div className="space-project-left">
                            <div
                              className="space-project-dot"
                              style={{ backgroundColor: proj.color || group.color }}
                            />
                            <span className="space-project-name">{proj.name}</span>
                          </div>
                          <div className="space-project-right">
                            <span
                              className={`space-project-count-badge ${activeTaskCount > 0 ? "has-tasks" : "zero-tasks"}`}
                              title={`${activeTaskCount} active tasks`}
                            >
                              {activeTaskCount}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}

                  {/* Overflow button when projects > 12 */}
                  {hasOverflow && (
                    <button
                      type="button"
                      onClick={() => onOpenDirectory(group.id)}
                      className="space-overflow-btn"
                    >
                      <span>View all {totalProjects} projects...</span>
                      <ExternalLink size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {spaceGroups.length === 0 && (
          <div className="space-empty-search">
            No matching spaces or projects
          </div>
        )}
      </div>

      {/* Action Buttons: New Space & New Project */}
      <div className="space-tree-actions">
        {onOpenCreateSpace && (
          <button
            type="button"
            onClick={onOpenCreateSpace}
            className="btn-space-action"
          >
            <FolderPlus size={13} style={{ color: "var(--color-primary)" }} />
            <span>New Space</span>
          </button>
        )}
        {onOpenWizard && (
          <button
            type="button"
            onClick={() => onOpenWizard(null)}
            className="btn-space-action btn-space-primary"
          >
            <Plus size={13} />
            <span>New Project</span>
          </button>
        )}
      </div>
    </div>
  );
}
