import { useState } from "react";
import {
  Activity,
  BarChart2,
  Bell,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderGit2,
  Headphones,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { Brand } from "../components/Brand.jsx";
import { PersonaSwitcher } from "../components/PersonaSwitcher.jsx";

export function AppShell({
  user,
  activeOrg,
  organizations = [],
  projects = [],
  section,
  setSection,
  onLogout,
  onSwitchOrg,
  onSwitchPersona,
  onOpenWizard,
  children,
}) {
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const activeRoleName = user?.roles?.[0]?.name || "Member";

  return (
    <div className="taskora-app-layout">
      {/* Left Sidebar */}
      <aside className="taskora-sidebar">
        {/* Brand & Organization Switcher */}
        <div className="sidebar-brand-container">
          <div className="brand-org-box" onClick={() => setOrgMenuOpen(!orgMenuOpen)}>
            <Brand size={30} />
            <div className="org-switcher-arrows">
              <ChevronUp size={12} className="arrow-up" />
              <ChevronDown size={12} className="arrow-down" />
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

        {/* Page Content Body */}
        <main className="taskora-page-body">
          {children}
        </main>
      </div>
    </div>
  );
}
