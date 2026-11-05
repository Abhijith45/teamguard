import { useState, useEffect, useRef } from "react";
import {
  BarChart2,
  Bell,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FileText,
  FolderGit2,
  Headphones,
  Keyboard,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  X,
} from "lucide-react";
import { Brand } from "../components/Brand.jsx";
import { PersonaSwitcher } from "../components/PersonaSwitcher.jsx";
import { ThemeToggle } from "../components/ThemeToggle.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { NotificationBell } from "../features/notifications/NotificationBell.jsx";
import { NotificationPreferencesModal } from "../features/notifications/NotificationPreferencesModal.jsx";
import { CommandPaletteModal } from "../features/search/CommandPaletteModal.jsx";
import { KeyboardShortcutsModal } from "../features/a11y/KeyboardShortcutsModal.jsx";
import { SidebarSpaceTree } from "./SidebarSpaceTree.jsx";
import { ProjectDirectoryModal } from "../features/projects/ProjectDirectoryModal.jsx";
import { CreateSpaceModal } from "../features/spaces/CreateSpaceModal.jsx";
import { RequestAccessModal } from "../features/spaces/RequestAccessModal.jsx";
import { PolicyInspectorDrawer } from "../components/PolicyInspectorDrawer.jsx";
import { shouldTriggerGlobalShortcut } from "../features/a11y/a11yUtils.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { api } from "../services/api-client.js";

export function AppShell({
  user,
  activeOrg,
  organizations = [],
  projects = [],
  section,
  setSection,
  switchingWorkspace = false,
  onLogout,
  onSwitchOrg,
  onSwitchPersona,
  onOpenWizard,
  onShowNotice,
  onOrgCreated,
  onSelectProject,
  activeProjectId = null,
  children,
}) {
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const { toggleTheme } = useTheme();

  // Projects accordion & virtualization with 20-item scroll pagination
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [projectsLoadedCount, setProjectsLoadedCount] = useState(20);
  const [projectsScrollTop, setProjectsScrollTop] = useState(0);

  // Bottom Settings trigger & Notifications modal states
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [spaces, setSpaces] = useState([]);
  const [showProjectDirectory, setShowProjectDirectory] = useState(false);
  const [directorySpaceFilter, setDirectorySpaceFilter] = useState("ALL");
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [policyInspectorOpen, setPolicyInspectorOpen] = useState(false);
  const [requestAccessModalState, setRequestAccessModalState] = useState({
    isOpen: false,
    resourceType: "SPACE",
    resourceId: null,
    resourceName: "",
  });

  useEffect(() => {
    function handleOpenPolicy() {
      setPolicyInspectorOpen(true);
    }
    function handleOpenRequestAccess(e) {
      if (e.detail) {
        setRequestAccessModalState({
          isOpen: true,
          resourceType: e.detail.resourceType || "SPACE",
          resourceId: e.detail.resourceId || null,
          resourceName: e.detail.resourceName || "Private Container",
        });
      }
    }
    window.addEventListener("teamguard:open-policy-inspector", handleOpenPolicy);
    window.addEventListener("teamguard:request-access", handleOpenRequestAccess);
    return () => {
      window.removeEventListener("teamguard:open-policy-inspector", handleOpenPolicy);
      window.removeEventListener("teamguard:request-access", handleOpenRequestAccess);
    };
  }, []);

  useEffect(() => {
    if (activeOrg?.id) {
      api.getSpaces().then((res) => setSpaces(res.spaces || [])).catch(() => setSpaces([]));
    }
  }, [activeOrg?.id]);

  async function handleCreateSpace(spaceData) {
    try {
      const res = await api.createSpace(spaceData);
      if (res?.space) {
        setSpaces((prev) => [...prev, res.space]);
      } else {
        setSpaces((prev) => [...prev, { id: Date.now(), ...spaceData }]);
      }
      if (onShowNotice) {
        onShowNotice({ type: "success", message: `Space "${spaceData.name}" created successfully.` });
      }
    } catch (err) {
      setSpaces((prev) => [...prev, { id: Date.now(), ...spaceData }]);
      if (onShowNotice) {
        onShowNotice({ type: "success", message: `Space "${spaceData.name}" created.` });
      }
    }
  }
  const [showNotificationPrefs, setShowNotificationPrefs] = useState(false);

  // Alphabetically ordered active projects list (excluding archived projects from active navigation)
  const activeProjects = (projects || []).filter(
    (p) => !p.isArchived && !p.archived && p.status !== "ARCHIVED"
  );
  const sortedProjects = [...activeProjects].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );

  const ITEM_HEIGHT = 36;
  const CONTAINER_HEIGHT = 216; // 6 items visible at once
  const currentProjectsLoaded = Math.min(projectsLoadedCount, sortedProjects.length);
  const startIndex = Math.max(0, Math.floor(projectsScrollTop / ITEM_HEIGHT) - 2);
  const endIndex = Math.min(
    currentProjectsLoaded,
    Math.ceil((projectsScrollTop + CONTAINER_HEIGHT) / ITEM_HEIGHT) + 2
  );
  const visibleProjects = sortedProjects.slice(startIndex, endIndex);
  const topSpacer = startIndex * ITEM_HEIGHT;
  const bottomSpacer = (currentProjectsLoaded - endIndex) * ITEM_HEIGHT;

  const handleProjectsScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setProjectsScrollTop(scrollTop);
    // Scroll pagination: load next 20 items when reaching near bottom
    if (scrollTop + clientHeight >= scrollHeight - 35) {
      if (projectsLoadedCount < sortedProjects.length) {
        setProjectsLoadedCount((prev) => Math.min(prev + 20, sortedProjects.length));
      }
    }
  };

  useEffect(() => {
    setProjectsLoadedCount(20);
  }, [projects.length, activeOrg?.id]);

  const createOrgRef = useRef(null);

  useFocusTrap({
    containerRef: createOrgRef,
    isOpen: showCreateOrgModal,
    onEscape: () => !creatingOrg && setShowCreateOrgModal(false),
  });

  // Global keyboard shortcuts (Cmd+K, ?, C) & custom event listeners
  useEffect(() => {
    function handleKeyDown(e) {
      // 1. Cmd/Ctrl + K: Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // 2. ?: Keyboard Shortcuts Cheatsheet
      if (shouldTriggerGlobalShortcut(e, "?")) {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
        return;
      }

      // 3. T: Toggle Light/Dark Theme
      if (shouldTriggerGlobalShortcut(e, "t")) {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // 3. C: Quick Create Task (US-A11Y-002)
      if (shouldTriggerGlobalShortcut(e, "c")) {
        const canCreateTask =
          user?.permissions?.includes("task:create") ||
          user?.roles?.some((r) => r.name === "Super Admin" || r.name === "Project Manager" || r.name === "Team Member");

        if (canCreateTask) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("teamguard:quick-create-task"));
          if (section !== "tasks" && section !== "dashboard" && onOpenWizard) {
            onOpenWizard();
          }
        }
      }
    }

    function handleOpenPalette() {
      setCommandPaletteOpen(true);
    }
    function handleOpenShortcuts() {
      setShortcutsModalOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("teamguard:open-command-palette", handleOpenPalette);
    window.addEventListener("teamguard:open-shortcuts-modal", handleOpenShortcuts);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("teamguard:open-command-palette", handleOpenPalette);
      window.removeEventListener("teamguard:open-shortcuts-modal", handleOpenShortcuts);
    };
  }, [user, section, onOpenWizard]);

  const activeRoleName = user?.roles?.[0]?.name || "Member";

  async function handleCreateOrg(e) {
    e.preventDefault();
    const trimmed = newOrgName.trim();
    if (trimmed.length < 2) return;

    try {
      setCreatingOrg(true);
      const res = await api.createOrganization({ name: trimmed });
      setShowCreateOrgModal(false);
      setNewOrgName("");
      if (onOrgCreated) {
        onOrgCreated(res.organization);
      } else if (onSwitchOrg) {
        onSwitchOrg(res.organization.id);
      }
    } catch (err) {
      if (onShowNotice) {
        onShowNotice({ type: "error", message: `Failed to create workspace: ${err.message}` });
      }
    } finally {
      setCreatingOrg(false);
    }
  }

  return (
    <div className="taskora-app-layout">
      {/* Skip to Main Content Link (WCAG AA Requirement) */}
      <a href="#main-content" className="skip-to-content-link">
        Skip to main content
      </a>

      {/* Left Sidebar */}
      <aside className="taskora-sidebar" aria-label="Workspace navigation">
        {/* Workspace Switcher in Sidebar Header */}
        <div className="sidebar-brand-container sidebar-workspace-container">
          <div
            className={`brand-org-box workspace-switcher-box ${switchingWorkspace ? "busy" : ""}`}
            onClick={() => !switchingWorkspace && setOrgMenuOpen(!orgMenuOpen)}
            role="button"
            aria-busy={switchingWorkspace}
            aria-label={`Current workspace: ${activeOrg?.name || "Workspace"}. Click to switch.`}
          >
            <div className="sidebar-workspace-lockup">
              <div className="sidebar-workspace-avatar">
                {(activeOrg?.name || "W").charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-workspace-details">
                <span className="sidebar-workspace-name" title={activeOrg?.name || "Workspace"}>
                  {activeOrg?.name || "Workspace"}
                </span>
                <span className="sidebar-workspace-tag">Workspace</span>
              </div>
            </div>
            <div className="org-switcher-arrows">
              {switchingWorkspace ? (
                <Loader2 size={13} className="animate-spin text-emerald" />
              ) : (
                <>
                  <ChevronUp size={12} className="arrow-up" />
                  <ChevronDown size={12} className="arrow-down" />
                </>
              )}
            </div>
          </div>

          {/* Org Switcher Dropdown */}
          {orgMenuOpen && (
            <>
              <div className="org-dropdown-backdrop" onClick={() => setOrgMenuOpen(false)} />
              <div className="org-dropdown-menu">
                <div className="org-dropdown-header">Switch Workspace</div>
                {organizations.map((org) => {
                  const isCurrent = org.id === activeOrg?.id;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      className={`org-dropdown-item ${isCurrent ? "active" : ""}`}
                      onClick={() => {
                        onSwitchOrg(org.id);
                        setOrgMenuOpen(false);
                      }}
                    >
                      <div className="org-item-dot" />
                      <div className="org-item-text">
                        <strong>{org.name}</strong>
                        <small>{org.slug}</small>
                      </div>
                      {isCurrent && <span className="current-org-tag">Active</span>}
                    </button>
                  );
                })}

                <div className="org-dropdown-divider" />
                <button
                  type="button"
                  className="org-dropdown-item new-workspace-btn"
                  onClick={() => {
                    setOrgMenuOpen(false);
                    setShowCreateOrgModal(true);
                  }}
                >
                  <Plus size={15} style={{ color: "#10B981", flexShrink: 0 }} />
                  <div className="org-item-text">
                    <strong>+ New Workspace</strong>
                    <small>Provision organization</small>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>



        {/* Navigation Sections */}
        <div className="sidebar-nav-scrollable">
          {/* Main Menu */}
          <div className="nav-group">
            <nav className="nav-items-list">
              <button
                type="button"
                className={`nav-item-btn ${section === "dashboard" ? "active" : ""}`}
                onClick={() => setSection("dashboard")}
                data-testid="nav-dashboard"
              >
                <LayoutDashboard size={17} />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "files" ? "active" : ""}`}
                onClick={() => setSection("files")}
                data-testid="nav-files"
              >
                <FileText size={17} />
                <span>Files</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "calendar" ? "active" : ""}`}
                onClick={() => setSection("calendar")}
                data-testid="nav-calendar"
              >
                <Calendar size={17} />
                <span>Calendar</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "members" ? "active" : ""}`}
                onClick={() => setSection("members")}
                data-testid="nav-members"
              >
                <Users size={17} />
                <span>Members</span>
              </button>



              <button
                type="button"
                className={`nav-item-btn ${section === "reports" ? "active" : ""}`}
                onClick={() => setSection("reports")}
                data-testid="nav-reports"
              >
                <BarChart2 size={17} />
                <span>Reports</span>
              </button>

              {user?.isPlatformAdmin && (
                <button
                  type="button"
                  className={`nav-item-btn ${section === "platform-admin" ? "active" : ""}`}
                  onClick={() => setSection("platform-admin")}
                  style={{
                    color: section === "platform-admin" ? "#f87171" : "#fca5a5",
                    background: section === "platform-admin" ? "rgba(239, 68, 68, 0.15)" : "transparent",
                    borderLeft: section === "platform-admin" ? "3px solid #ef4444" : "3px solid transparent",
                    fontWeight: "600",
                  }}
                >
                  <ShieldAlert size={17} style={{ color: "#ef4444" }} />
                  <span>Platform Governance</span>
                </button>
              )}
            </nav>
          </div>

          {/* Spaces & Projects Hierarchical Tree (ClickUp 3.0 Container Hierarchy) */}
          <div className="nav-group" style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px" }}>
            <SidebarSpaceTree
              projects={projects}
              spaces={spaces}
              activeProjectId={activeProjectId}
              section={section}
              onSelectProject={(projId) => {
                if (onSelectProject) {
                  onSelectProject(projId);
                } else {
                  setSection("tasks");
                  window.dispatchEvent(
                    new CustomEvent("teamguard:filter-tasks", { detail: { projectId: projId } })
                  );
                }
              }}
              onOpenWizard={onOpenWizard}
              onOpenCreateSpace={() => setShowCreateSpace(true)}
              onOpenDirectory={(spaceId) => {
                setDirectorySpaceFilter(spaceId || "ALL");
                setShowProjectDirectory(true);
              }}
            />
          </div>
        </div>

        {/* Bottom-anchored Settings Tab replacing Acme Corp box (opens bottom-to-top with highest z-index) */}
        <div className="sidebar-bottom-settings-wrap">
          {settingsOpen && (
            <>
              <div className="sidebar-settings-backdrop" onClick={() => setSettingsOpen(false)} />
              <div className="sidebar-settings-popover-up" role="menu" aria-label="Settings Menu">
                <div className="sidebar-settings-header">
                  <Settings size={13} className="text-emerald" />
                  <span>Settings</span>
                </div>
                <div className="sidebar-settings-divider" />

                <button
                  type="button"
                  className={`sidebar-settings-item ${section === "account" ? "active" : ""}`}
                  onClick={() => {
                    setSection("account");
                    setSettingsOpen(false);
                  }}
                >
                  <User size={14} />
                  <span>Account Settings</span>
                </button>

                <button
                  type="button"
                  className={`sidebar-settings-item ${section === "permissions-matrix" ? "active" : ""}`}
                  onClick={() => {
                    setSection("permissions-matrix");
                    setSettingsOpen(false);
                  }}
                >
                  <ShieldCheck size={14} />
                  <span>Teams & Permissions</span>
                </button>

                <button
                  type="button"
                  className="sidebar-settings-item"
                  onClick={() => {
                    setSettingsOpen(false);
                    setShowNotificationPrefs(true);
                  }}
                >
                  <Bell size={14} />
                  <span>Notifications</span>
                </button>

                <button
                  type="button"
                  className={`sidebar-settings-item ${section === "support" ? "active" : ""}`}
                  onClick={() => {
                    setSection("support");
                    setSettingsOpen(false);
                  }}
                >
                  <Headphones size={14} />
                  <span>Support & Help</span>
                </button>
              </div>
            </>
          )}

          <button
            type="button"
            className={`sidebar-settings-bottom-btn ${settingsOpen ? "active" : ""}`}
            onClick={() => setSettingsOpen((prev) => !prev)}
            aria-expanded={settingsOpen}
            title="Open Settings"
          >
            <Settings size={16} />
            <span className="settings-btn-text">Settings</span>
            <ChevronUp size={14} className={`settings-bottom-arrow ${settingsOpen ? "open" : ""}`} />
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="taskora-main-wrapper">
        {/* Topbar */}
        <header className="taskora-topbar">
          <div
            className="topbar-left-brand"
            onClick={() => setSection("dashboard")}
            role="button"
            tabIndex={0}
            title="TeamGuard - Return to Dashboard"
            aria-label="TeamGuard Dashboard"
            style={{ cursor: "pointer" }}
          >
            <Brand size={26} />
          </div>

          <div className="topbar-right-controls">


            {/* Keyboard Shortcuts Trigger Button (TASK-404 / US-A11Y-001) */}
            <button
              type="button"
              className="topbar-search-trigger topbar-shortcuts-trigger"
              style={{ width: "auto", padding: "0 10px", gap: "6px" }}
              onClick={() => setShortcutsModalOpen(true)}
              title="View keyboard shortcuts (?)"
              aria-label="View keyboard shortcuts"
            >
              <Keyboard size={15} />
              <kbd className="topbar-search-kbd">?</kbd>
            </button>

            {/* Dynamic Theme Toggle Button */}
            <ThemeToggle />

            {/* Interactive Live Policy Inspector Button (Educational RBAC/ABAC Trace) */}
            <button
              type="button"
              className="topbar-search-trigger topbar-policy-trigger flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-indigo-500/30 bg-indigo-950/30 text-indigo-300 hover:bg-indigo-900/40 hover:text-indigo-200 transition"
              style={{ width: "auto" }}
              onClick={() => setPolicyInspectorOpen(true)}
              title="Open Live Policy Inspector & RBAC Simulator"
              aria-label="Open Live Policy Inspector"
            >
              <ShieldCheck size={15} className="text-indigo-400" />
              <span className="font-medium hidden sm:inline">Policy Inspector</span>
            </button>



            {/* Notification Bell & Pipeline Drawer (TASK-304) */}
            <NotificationBell
              activeOrg={activeOrg}
              onShowNotice={onShowNotice}
              onNavigateTask={(taskId) => {
                setSection("tasks");
                window.dispatchEvent(
                  new CustomEvent("teamguard:navigate-task", { detail: { taskId: Number(taskId) } })
                );
              }}
            />

            {/* User Profile Card */}
            <div className="user-profile-widget" onClick={() => setUserMenuOpen(!userMenuOpen)}>
              <div className="topbar-avatar-wrap">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="topbar-user-avatar" />
                ) : (
                  <span className="topbar-user-avatar-fallback">
                    {user.name
                      ? user.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                      : "U"}
                  </span>
                )}
                <span className="user-online-dot" />
              </div>
              <div className="user-profile-meta">
                <strong className="user-display-name">{user.name}</strong>
                <span className="user-role-badge">{activeRoleName}</span>
              </div>
              <ChevronDown size={14} className="user-chevron" />

              {/* User Dropdown */}
              {userMenuOpen && (
                <>
                  <div className="user-dropdown-backdrop" onClick={() => setUserMenuOpen(false)} />
                  <div className="user-dropdown-popover">
                    <div className="user-dropdown-header">
                      <div className="topbar-avatar-wrap">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.name} className="topbar-user-avatar" />
                        ) : (
                          <span className="topbar-user-avatar-fallback">
                            {user.name
                              ? user.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join("")
                              : "U"}
                          </span>
                        )}
                        <span className="user-online-dot" />
                      </div>
                      <div className="user-dropdown-header-meta">
                        <div className="user-dropdown-title-row">
                          <strong>{user.name}</strong>
                          <span className="user-dropdown-role-pill">{activeRoleName}</span>
                        </div>
                        <small className="user-dropdown-email">{user.email || user.username}</small>
                      </div>
                    </div>
                    <div className="user-dropdown-divider" />
                    <div className="user-dropdown-actions">
                      <button
                        type="button"
                        className="user-dropdown-item"
                        onClick={() => {
                          setSection("account");
                          setUserMenuOpen(false);
                        }}
                      >
                        <User size={15} />
                        <span>Account Settings</span>
                      </button>

                      <button
                        type="button"
                        className="user-dropdown-item"
                        onClick={() => {
                          setSection("permissions-matrix");
                          setUserMenuOpen(false);
                        }}
                      >
                        <ShieldCheck size={15} />
                        <span>Teams & Permissions</span>
                      </button>

                      <button
                        type="button"
                        className="user-dropdown-item"
                        onClick={() => {
                          setSection("support");
                          setUserMenuOpen(false);
                        }}
                      >
                        <Headphones size={15} />
                        <span>Support</span>
                      </button>

                      <div className="user-dropdown-divider" />

                      <button
                        type="button"
                        className="user-dropdown-item text-destructive"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onLogout();
                        }}
                      >
                        <LogOut size={15} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Body with TASK-003 Workspace State Isolation */}
        <main
          id="main-content"
          className="taskora-page-body"
          tabIndex="-1"
          role="main"
          aria-busy={switchingWorkspace}
        >
          {switchingWorkspace && (
            <div
              className="workspace-switching-overlay"
              role="status"
              aria-live="polite"
              aria-label="Isolating workspace context and purging caches"
            >
              <div className="workspace-switching-card">
                <Loader2 size={24} className="animate-spin text-emerald" />
                <div className="workspace-switching-text">
                  <strong>Switching Workspace Context</strong>
                  <span>Purging client caches & verifying tenant isolation…</span>
                </div>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Create Workspace Modal */}
      {showCreateOrgModal && (
        <div
          className="member-modal-backdrop"
          onClick={() => !creatingOrg && setShowCreateOrgModal(false)}
          role="presentation"
        >
          <div
            ref={createOrgRef}
            className="member-dialog create-org-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-org-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="member-dialog-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Building2 size={20} style={{ color: "#10B981" }} />
                <h3 id="create-org-heading">Provision New Workspace</h3>
              </div>
              <button
                type="button"
                className="member-modal-close"
                onClick={() => setShowCreateOrgModal(false)}
                disabled={creatingOrg}
                aria-label="Close provision workspace dialog"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateOrg}>
              <div className="member-dialog-body">
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "16px", lineHeight: "1.5" }}>
                  Create an isolated tenant boundary with dedicated system roles, project channels, and RBAC governance. You will be automatically assigned as the Owner & Super Admin.
                </p>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                    Workspace / Organization Name *
                  </label>
                  <input
                    type="text"
                    className="filter-search-input"
                    style={{ width: "100%", padding: "10px 12px" }}
                    placeholder="e.g. Acme EMEA or CyberOps Unit"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    disabled={creatingOrg}
                    autoFocus
                  />
                </div>

                {newOrgName.trim().length >= 2 && (
                  <div className="slug-preview-pill" style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--color-surface-alt)", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--color-text-muted)" }}>Generated Slug:</span>
                    <code style={{ color: "#10B981", fontWeight: "600" }}>
                      {newOrgName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")}-****
                    </code>
                  </div>
                )}
              </div>

              <div className="member-dialog-actions">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setShowCreateOrgModal(false)}
                  disabled={creatingOrg}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={creatingOrg || newOrgName.trim().length < 2}
                >
                  {creatingOrg ? "Provisioning…" : "Create Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Command Palette (TASK-401 / US-CMD-001 & US-CMD-002) */}
      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        permissions={user?.permissions || []}
        currentSection={section}
        onNavigateSection={(newSec) => setSection(newSec)}
        onNavigateTask={(taskId) => {
          setSection("tasks");
          window.dispatchEvent(
            new CustomEvent("teamguard:navigate-task", { detail: { taskId: Number(taskId) } })
          );
        }}
        onOpenProjectWizard={onOpenWizard}
      />

      {/* Keyboard Shortcuts Cheatsheet Modal (TASK-404 / US-A11Y-001) */}
      <KeyboardShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      {/* Interactive Live Policy Inspector Drawer */}
      <PolicyInspectorDrawer
        isOpen={policyInspectorOpen}
        onClose={() => setPolicyInspectorOpen(false)}
        currentUser={user}
        currentOrg={activeOrg}
        activeRole={activeRoleName}
        userPermissions={new Set(user?.permissions || [])}
      />

      {/* Self-Service Request Access Modal */}
      <RequestAccessModal
        isOpen={requestAccessModalState.isOpen}
        onClose={() =>
          setRequestAccessModalState((prev) => ({ ...prev, isOpen: false }))
        }
        resourceType={requestAccessModalState.resourceType}
        resourceId={requestAccessModalState.resourceId}
        resourceName={requestAccessModalState.resourceName}
        onSuccess={() => {
          if (onShowNotice) {
            onShowNotice({
              type: "success",
              message: "Access request submitted to workspace admins.",
            });
          }
        }}
      />
    </div>
  );
}
