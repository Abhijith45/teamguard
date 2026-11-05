import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, X } from "lucide-react";
import { AccountPage } from "./features/account/AccountPage.jsx";
import { AuthPage } from "./features/auth/AuthPage.jsx";
import { DashboardView } from "./features/dashboard/DashboardView.jsx";
import { FilesBulkView } from "./features/files/FilesBulkView.jsx";
import { KanbanBoardView } from "./features/tasks/KanbanBoardView.jsx";
import { MembersView } from "./features/members/MembersView.jsx";
import { TeamPermissionsMatrixView } from "./features/permissions/TeamPermissionsMatrixView.jsx";
import { ProjectSetupWizardModal } from "./features/projects/ProjectSetupWizardModal.jsx";
import AuditReportsView from "./features/reports/AuditReportsView.jsx";
import { CalendarView } from "./features/calendar/CalendarView.jsx";
import { PlatformAdminView } from "./features/platform/PlatformAdminView.jsx";
import { AcceptInvitationModal } from "./features/invitations/AcceptInvitationModal.jsx";
import { AppShell } from "./layout/AppShell.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import {
  api,
  clearAccessToken,
  clearSessionStorageAndCache,
  purgeTenantWorkspaceCache,
  setAccessToken,
  setActiveOrgId,
} from "./services/api-client.js";
import "./App.css";


// Parses /{workspace_id}/{view_type}/{project_id}
// view_type: b (Board), l (List), gr (Table grouped by status)
const PROJECT_VIEW_ROUTE_REGEX = /^\/([^\/]+)\/(b|l|gr|table)\/(0|[1-9][0-9]*)\/?$/i;

function parseProjectViewRoute(pathname) {
  if (!pathname) return null;
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // fallback
  }
  const match = decoded.trim().match(PROJECT_VIEW_ROUTE_REGEX);
  if (!match) return null;
  const rawType = match[2].toLowerCase();
  return {
    workspaceId: match[1],
    viewType: rawType === "table" ? "gr" : rawType,
    projectId: Number(match[3]),
  };
}



// Canonical URL route-to-section mapping
const SECTION_TO_PATH = {
  dashboard: "/dashboard",
  tasks: "/tasks",
  files: "/files",
  calendar: "/calendar",
  members: "/members",
  "permissions-matrix": "/permissions",
  reports: "/reports",
  account: "/profile",
  support: "/support",
  "platform-admin": "/platform-governance",
};

const PATH_TO_SECTION = {
  "/": "dashboard",
  "/dashboard": "dashboard",
  "/tasks": "tasks",
  "/files": "files",
  "/calendar": "calendar",
  "/members": "members",
  "/permissions": "permissions-matrix",
  "/team-and-permissions": "permissions-matrix",
  "/reports": "reports",
  "/profile": "account",
  "/account": "account",
  "/support": "support",
  "/platform-governance": "platform-admin",
  "/platform-admin": "platform-admin",
};

function getSectionFromPath(pathname) {
  if (typeof window === "undefined") return "dashboard";
  const clean = (pathname || window.location.pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
  if (parseProjectViewRoute(clean)) return "tasks";
  if (PATH_TO_SECTION[clean]) return PATH_TO_SECTION[clean];
  for (const [route, sec] of Object.entries(PATH_TO_SECTION)) {
    if (route !== "/" && clean.startsWith(route)) {
      return sec;
    }
  }
  return "dashboard";
}

function getPathForSection(sectionName) {
  return SECTION_TO_PATH[sectionName] || "/dashboard";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [activeOrg, setActiveOrg] = useState(null);
  const [projects, setProjects] = useState([]);
  const initialProjectRoute = typeof window !== "undefined" ? parseProjectViewRoute(window.location.pathname) : null;
  const [activeProjectId, setActiveProjectId] = useState(() => initialProjectRoute?.projectId || null);
  const [taskViewType, setTaskViewType] = useState(() => initialProjectRoute?.viewType || "b");
  const [section, setSectionState] = useState(() => {
    if (typeof window !== "undefined") {
      return getSectionFromPath(window.location.pathname);
    }
    return "dashboard";
  });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [inviteToken, setInviteToken] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("token") || null;
    }
    return null;
  });

  // Route to /{workspace_id}/{view_type}/{project_id}
  const navigateToProjectView = useCallback((projectId, viewType = "b", options = {}) => {
    const rawKey = activeOrg?.slug || activeOrg?.name || activeOrg?.id || "workspace";
    const orgKey = String(rawKey).trim().toLowerCase().replace(/\s+/g, "-");
    const targetPath = `/${orgKey}/${viewType}/${projectId}`;
    setActiveProjectId(Number(projectId));
    setTaskViewType(viewType);
    setSectionState("tasks");
    if (typeof window !== "undefined" && window.history?.pushState) {
      if (window.location.pathname !== targetPath) {
        if (options.replace) {
          window.history.replaceState({ section: "tasks", projectId, viewType }, "", targetPath);
        } else {
          window.history.pushState({ section: "tasks", projectId, viewType }, "", targetPath);
        }
      }
    }
  }, [activeOrg]);


  const setSection = useCallback((nextSection, options = {}) => {
    setSectionState(nextSection);
    if (typeof window !== "undefined" && window.history?.pushState) {
      const targetPath = getPathForSection(nextSection);
      if (window.location.pathname !== targetPath) {
        if (options.replace) {
          window.history.replaceState({ section: nextSection }, "", targetPath);
        } else {
          window.history.pushState({ section: nextSection }, "", targetPath);
        }
      }
    }
  }, []);

  // Synchronize route with browser back/forward buttons
  useEffect(() => {
    function handlePopState() {
      const route = parseProjectViewRoute(window.location.pathname);
      if (route) {
        setActiveProjectId(route.projectId);
        setTaskViewType(route.viewType);
        setSectionState("tasks");
      } else {
        const routeSection = getSectionFromPath(window.location.pathname);
        setSectionState(routeSection);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Synchronize route upon authentication restoration
  useEffect(() => {
    if (user && typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      const projectRoute = parseProjectViewRoute(currentPath);
      if (projectRoute) {
        setActiveProjectId(projectRoute.projectId);
        setTaskViewType(projectRoute.viewType);
        setSectionState("tasks");
      } else if (currentPath === "/" || currentPath === "") {
        window.history.replaceState({ section: "dashboard" }, "", "/dashboard");
        setSectionState("dashboard");
      } else {
        const routeSection = getSectionFromPath(currentPath);
        setSectionState(routeSection);
      }
    }
  }, [user]);

  const showNotice = useCallback((newNotice) => {
    setNotice(newNotice);
    setTimeout(() => {
      setNotice((current) => (current === newNotice ? null : current));
    }, 4500);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const res = await api.getProjects();
      setProjects(res.projects || []);
    } catch {
      setProjects([]);
    }
  }, []);

  // Restore session on initial load
  useEffect(() => {
    let mounted = true;
    async function restore() {
      try {
        const session = await api.refresh();
        if (!mounted || !session?.user) return;
        setAccessToken(session.accessToken);
        setUser(session.user);

        const currentOrg = session.user.activeOrganization || session.user.organizations?.[0];
        if (currentOrg) {
          setActiveOrg(currentOrg);
          setActiveOrgId(currentOrg.id);
        }
      } catch {
        clearAccessToken();
      } finally {
        if (mounted) setRestoring(false);
      }
    }
    restore();
    return () => { mounted = false; };
  }, []);

  // Load projects whenever active organization changes
  useEffect(() => {
    if (user && activeOrg) {
      loadProjects();
    }
  }, [user, activeOrg, loadProjects]);

  async function handleLoginSuccess(authenticatedUser) {
    setUser(authenticatedUser);
    const org = authenticatedUser.activeOrganization || authenticatedUser.organizations?.[0];
    if (org) {
      setActiveOrg(org);
      setActiveOrgId(org.id);
    }
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "/";
    const targetSection = (currentPath && currentPath !== "/" && currentPath !== "")
      ? getSectionFromPath(currentPath)
      : "dashboard";
    setSection(targetSection, { replace: true });
    showNotice({ type: "success", message: `Welcome back, ${authenticatedUser.name}!` });
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Local clean up
    }
    clearSessionStorageAndCache();
    setUser(null);
    setActiveOrg(null);
    setProjects([]);
    setSection("dashboard", { replace: true });
  }

  async function handleSwitchPersona(personaId, orgSlug = "acme-corp") {
    try {
      setSwitchingWorkspace(true);
      // TASK-003: Purge client-side caches and reset project state
      purgeTenantWorkspaceCache();
      setProjects([]);
      setWizardOpen(false);

      const session = await api.switchPersona(personaId, orgSlug);
      setAccessToken(session.accessToken);
      setUser(session.user);
      if (session.activeOrganization) {
        setActiveOrg(session.activeOrganization);
        setActiveOrgId(session.activeOrganization.id);
      }

      const projRes = await api.getProjects().catch(() => ({ projects: [] }));
      setProjects(projRes.projects || []);

      // Always redirect to "/dashboard" route upon workspace switch
      setSection("dashboard");
      setActiveProjectId(null);

      showNotice({
        type: "success",
        message: `Switched test persona to "${session.user.roles?.[0]?.name || personaId}" in ${session.activeOrganization?.name}.`,
      });
    } catch (err) {
      showNotice({ type: "error", message: `Failed to switch persona: ${err.message}` });
    } finally {
      setSwitchingWorkspace(false);
    }
  }

  async function handleSwitchOrg(orgId) {
    if (!orgId) return;
    if (orgId === activeOrg?.id) {
      setSection("dashboard");
      setActiveProjectId(null);
      return;
    }
    try {
      setSwitchingWorkspace(true);
      // TASK-003: Purge client-side caches and in-memory tenant state
      purgeTenantWorkspaceCache(orgId);
      setActiveOrgId(orgId);
      setProjects([]);
      setWizardOpen(false);

      const res = await api.me();
      setUser(res.user);
      const nextOrg = res.user.activeOrganization || res.user.organizations?.find((o) => o.id === orgId);
      if (nextOrg) setActiveOrg(nextOrg);

      const projRes = await api.getProjects().catch(() => ({ projects: [] }));
      setProjects(projRes.projects || []);

      // Always redirect to "/dashboard" route upon workspace change
      setSection("dashboard");
      setActiveProjectId(null);

      showNotice({
        type: "success",
        message: `Active workspace switched to "${nextOrg?.name || "Workspace"}".`,
      });
    } catch (err) {
      showNotice({ type: "error", message: `Failed to switch workspace: ${err.message}` });
    } finally {
      setSwitchingWorkspace(false);
    }
  }

  if (restoring) {
    return (
      <main className="boot-screen">
        <span className="brand-mark animate-spin">
          <Activity size={22} className="text-emerald" />
        </span>
        <span>Initializing TeamGuard workspace…</span>
      </main>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={handleLoginSuccess} />;
  }

  const userPermissions = new Set(
    (user.permissions || []).map((p) => `${p.resource}:${p.action}`)
  );

  async function handleOrgCreated(newOrg) {
    try {
      const res = await api.me();
      setUser(res.user);
      await handleSwitchOrg(newOrg.id);
      showNotice({
        type: "success",
        message: `Workspace "${newOrg.name}" provisioned. You are assigned as Super Admin.`,
      });
    } catch (err) {
      showNotice({ type: "error", message: `Workspace created, but failed to switch: ${err.message}` });
    }
  }

  return (
    <AppShell
      user={user}
      activeOrg={activeOrg}
      organizations={user.organizations || []}
      projects={projects}
      section={section}
      setSection={setSection}
      switchingWorkspace={switchingWorkspace}
      onLogout={handleLogout}
      onSwitchOrg={handleSwitchOrg}
      onSwitchPersona={handleSwitchPersona}
      onOpenWizard={() => setWizardOpen(true)}
      onShowNotice={showNotice}
      onOrgCreated={handleOrgCreated}
      onSelectProject={(projId) => navigateToProjectView(projId, taskViewType || "b")}
      activeProjectId={activeProjectId}
    >
      {/* Toast Notice */}
      {notice && (
        <div className={`app-floating-notice notice-${notice.type}`}>
          <div className="notice-icon">
            {notice.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          </div>
          <span className="notice-message">{notice.message}</span>
          <button type="button" className="notice-dismiss-btn" onClick={() => setNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* View Routing with TASK-003 Tenant State Isolation Keys */}
      <ErrorBoundary
        key={`error-boundary-${section}-${activeOrg?.id}-${activeProjectId || "root"}`}
        title={`Unable to display ${section} view`}
        onNavigateHome={() => setSection("dashboard")}
      >
      {section === "dashboard" && (
        <DashboardView
          key={`dashboard-${activeOrg?.id}`}
          user={user}
          activeOrg={activeOrg}
          userPermissions={userPermissions}
          onNavigateToTasks={(filter) => {
            setSection("tasks");
            if (filter) {
              window.dispatchEvent(
                new CustomEvent("teamguard:filter-tasks", { detail: filter })
              );
            }
          }}
          onNavigateToProjects={(projId) => projId ? navigateToProjectView(projId, "b") : setSection("tasks")}
          onNavigateToCalendar={() => setSection("calendar")}
          onOpenWizard={() => setWizardOpen(true)}
          onShowNotice={showNotice}
        />
      )}

      {section === "tasks" && (
        <KanbanBoardView
          key={`tasks-${activeOrg?.id}-${activeProjectId || 'all'}`}
          user={user}
          activeOrg={activeOrg}
          userPermissions={userPermissions}
          onShowNotice={showNotice}
          initialProjectId={activeProjectId}
          initialViewType={taskViewType}
          onViewTypeChange={(newType) => {
            setTaskViewType(newType);
            if (activeProjectId) {
              navigateToProjectView(activeProjectId, newType, { replace: true });
            }
          }}
          onProjectChange={(newProjId) => {
            setActiveProjectId(Number(newProjId));
            navigateToProjectView(newProjId, taskViewType || "b", { replace: true });
          }}
        />
      )}

      {section === "files" && (
        <FilesBulkView
          key={`files-${activeOrg?.id}`}
          user={user}
          activeOrg={activeOrg}
          userPermissions={userPermissions}
          onShowNotice={showNotice}
        />
      )}

      {section === "permissions-matrix" && (
        <TeamPermissionsMatrixView
          key={`permissions-${activeOrg?.id}`}
          activeOrg={activeOrg}
          userPermissions={userPermissions}
          onShowNotice={showNotice}
          onOrgUpdated={(updatedOrg) => {
            setActiveOrg(updatedOrg);
            setUser((prev) => ({
              ...prev,
              organizations: (prev.organizations || []).map((o) =>
                o.id === updatedOrg.id ? { ...o, name: updatedOrg.name, slug: updatedOrg.slug } : o
              ),
            }));
          }}
        />
      )}

      {section === "members" && (
        <MembersView
          key={`members-${activeOrg?.id}`}
          activeOrg={activeOrg}
          currentUser={user}
          onShowNotice={showNotice}
        />
      )}

      {section === "account" && (
        <AccountPage
          user={user}
          activeOrg={activeOrg}
          onUpdateUser={setUser}
          onShowNotice={showNotice}
        />
      )}

      {section === "reports" && (
        <AuditReportsView
          key={`reports-${activeOrg?.id}`}
          currentUser={user}
          userPermissions={userPermissions}
          activeOrg={activeOrg}
        />
      )}

      {section === "calendar" && (
        <CalendarView
          key={`calendar-${activeOrg?.id}`}
          user={user}
          activeOrg={activeOrg}
          userPermissions={userPermissions}
          projects={projects}
          onShowNotice={showNotice}
          onNavigateTasks={() => setSection("tasks")}
        />
      )}

      {section === "support" && (
        <div className="section-placeholder-card">
          <h3>TeamGuard Documentation & Policies</h3>
          <p>Help desk, role guides, and multi-tenant security architecture documentation.</p>
          <button type="button" className="btn-primary-emerald" onClick={() => setSection("dashboard")}>
            Return to Dashboard
          </button>
        </div>
      )}

      {section === "platform-admin" && (
        <PlatformAdminView
          currentUser={user}
          onShowNotice={showNotice}
        />
      )}
      </ErrorBoundary>

      {/* Project Setup Wizard Modal */}
      <ProjectSetupWizardModal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onProjectCreated={() => {
          loadProjects();
          setSection("tasks");
        }}
        onShowNotice={showNotice}
      />

      {/* Member Invitation Acceptance Modal (TASK-505) */}
      {inviteToken && (
        <AcceptInvitationModal
          token={inviteToken}
          currentUser={user}
          onClose={() => {
            setInviteToken(null);
            if (typeof window !== "undefined" && window.history?.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }}
          onAccepted={async (newOrg) => {
            setInviteToken(null);
            if (typeof window !== "undefined" && window.history?.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            if (newOrg?.id) {
              await handleSwitchOrg(newOrg.id);
            }
            setSection("members");
          }}
          onShowNotice={showNotice}
        />
      )}
    </AppShell>
  );
}
