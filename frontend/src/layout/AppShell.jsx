import { useState } from "react";
import {
  BarChart2,
  Bell,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderGit2,
  Headphones,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  User,
  Users,
  X,
} from "lucide-react";
import { Brand } from "../components/Brand.jsx";
import { PersonaSwitcher } from "../components/PersonaSwitcher.jsx";
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
  children,
}) {
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

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
      {/* Left Sidebar */}
      <aside className="taskora-sidebar">
        {/* Brand & Organization Switcher */}
        <div className="sidebar-brand-container">
          <div
            className={`brand-org-box ${switchingWorkspace ? "busy" : ""}`}
            onClick={() => !switchingWorkspace && setOrgMenuOpen(!orgMenuOpen)}
            role="button"
            aria-busy={switchingWorkspace}
            aria-label={`Current workspace: ${activeOrg?.name || "Workspace"}. Click to switch.`}
          >
            <Brand size={30} />
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
            <span className="nav-group-title">Main Menu</span>
            <nav className="nav-items-list">
              <button
                type="button"
                className={`nav-item-btn ${section === "dashboard" ? "active" : ""}`}
                onClick={() => setSection("dashboard")}
              >
                <LayoutDashboard size={17} />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "tasks" ? "active" : ""}`}
                onClick={() => setSection("tasks")}
              >
                <CheckSquare size={17} />
                <span>Tasks</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "files" ? "active" : ""}`}
                onClick={() => setSection("files")}
              >
                <FileText size={17} />
                <span>Files</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "calendar" ? "active" : ""}`}
                onClick={() => setSection("calendar")}
              >
                <Calendar size={17} />
                <span>Calendar</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "members" ? "active" : ""}`}
                onClick={() => setSection("members")}
              >
                <Users size={17} />
                <span>Member</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "reports" ? "active" : ""}`}
                onClick={() => setSection("reports")}
              >
                <BarChart2 size={17} />
                <span>Reports</span>
              </button>
            </nav>
          </div>

          {/* Projects Section */}
          <div className="nav-group">
            <div className="nav-group-header-row">
              <span className="nav-group-title">Projects</span>
              <button
                type="button"
                className="add-project-icon-btn"
                onClick={onOpenWizard}
                title="Launch Project Setup Wizard"
              >
                <Plus size={15} />
              </button>
            </div>
            <nav className="nav-items-list">
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  className={`nav-item-btn ${section === `project-${proj.id}` ? "active" : ""}`}
                  onClick={() => setSection("tasks")}
                >
                  <FolderGit2 size={16} className="text-emerald" />
                  <span className="truncate">{proj.name}</span>
                </button>
              ))}
              {projects.length === 0 && (
                <span className="sidebar-empty-hint">No projects yet</span>
              )}
            </nav>
          </div>

          {/* Settings Section */}
          <div className="nav-group">
            <span className="nav-group-title">Settings</span>
            <nav className="nav-items-list">
              <button
                type="button"
                className={`nav-item-btn ${section === "account" ? "active" : ""}`}
                onClick={() => setSection("account")}
              >
                <User size={17} />
                <span>Account Settings</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "permissions-matrix" ? "active" : ""}`}
                onClick={() => setSection("permissions-matrix")}
              >
                <ShieldCheck size={17} />
                <span>Team & Permissions</span>
              </button>

              <button
                type="button"
                className={`nav-item-btn ${section === "support" ? "active" : ""}`}
                onClick={() => setSection("support")}
              >
                <Headphones size={17} />
                <span>Support</span>
              </button>
            </nav>
          </div>
        </div>

        <div className="sidebar-footer-status">
          <span className="status-indicator-live" />
          <span>Tenant: <strong>{activeOrg?.name}</strong></span>
        </div>
      </aside>

      {/* Main Container */}
      <div className="taskora-main-wrapper">
        {/* Topbar */}
        <header className="taskora-topbar">
          <div className="topbar-left-titles">
            <h1>
              {section === "dashboard" && "Dashboard"}
              {section === "tasks" && "Tasks"}
              {section === "files" && "Files"}
              {section === "permissions-matrix" && "Team & Permissions"}
              {section === "account" && "Account Settings"}
              {section === "calendar" && "Workspace Calendar"}
              {section === "members" && "Organization Members"}
              {section === "reports" && "Performance Reports"}
              {section === "support" && "Help & Support"}
            </h1>
            <p className="topbar-subtitle">
              {section === "dashboard" && `Welcome back, ${user.name.split(" ")[0]}! Here's your latest snapshot.`}
              {section === "tasks" && "Manage and track your team's tasks seamlessly with clear priorities and progress."}
              {section === "files" && "Access, manage, and share your project files with ease."}
              {section === "permissions-matrix" && "Control access levels and assign roles to your team."}
              {section === "account" && "Review your active session credentials and profile settings."}
              {section === "calendar" && "View scheduled release milestones and meetings."}
              {section === "members" && "Directory of collaborators in this active organization."}
              {section === "reports" && "Audit events and security metrics."}
              {section === "support" && "Documentation and role policy guides."}
            </p>
          </div>

          <div className="topbar-right-controls">
            {/* Live Demo Persona Switcher */}
            <PersonaSwitcher
              currentRole={activeRoleName}
              activeOrgSlug={activeOrg?.slug}
              onSwitch={onSwitchPersona}
            />

            {/* Notification Bell */}
            <button type="button" className="notification-bell-btn" title="Notifications">
              <Bell size={17} />
              <span className="notification-badge-dot" />
            </button>

            {/* User Profile Card */}
            <div className="user-profile-widget" onClick={() => setUserMenuOpen(!userMenuOpen)}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="topbar-user-avatar" />
              ) : (
                <span className="topbar-user-avatar-fallback">
                  {user.name ? user.name[0] : "U"}
                </span>
              )}
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
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </div>
                    <div className="user-dropdown-divider" />
                    <button
                      type="button"
                      className="user-dropdown-item"
                      onClick={() => {
                        setSection("account");
                        setUserMenuOpen(false);
                      }}
                    >
                      <User size={15} />
                      <span>My Profile</span>
                    </button>
                    <button
                      type="button"
                      className="user-dropdown-item text-destructive"
                      onClick={onLogout}
                    >
                      <LogOut size={15} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Body with TASK-003 Workspace State Isolation */}
        <main className="taskora-page-body" aria-busy={switchingWorkspace}>
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
        <div className="member-modal-backdrop" onClick={() => !creatingOrg && setShowCreateOrgModal(false)}>
          <div className="member-dialog create-org-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="member-dialog-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Building2 size={20} style={{ color: "#10B981" }} />
                <h3>Provision New Workspace</h3>
              </div>
              <button
                className="member-modal-close"
                onClick={() => setShowCreateOrgModal(false)}
                disabled={creatingOrg}
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
    </div>
  );
}
