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
import { AppShell } from "./layout/AppShell.jsx";
import {
  api,
  clearAccessToken,
  clearSessionStorageAndCache,
  purgeTenantWorkspaceCache,
  setAccessToken,
  setActiveOrgId,
} from "./services/api-client.js";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [activeOrg, setActiveOrg] = useState(null);
  const [projects, setProjects] = useState([]);
  const [section, setSection] = useState("dashboard");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);

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
    setSection("dashboard");
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
    setSection("dashboard");
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
    if (!orgId || orgId === activeOrg?.id) return;
    try {
      setSwitchingWorkspace(true);
      // TASK-003: Purge client-side caches and in-memory tenant state
      purgeTenantWorkspaceCache(orgId);
      setProjects([]);
      setWizardOpen(false);

      const res = await api.me();
      setUser(res.user);
      const nextOrg = res.user.activeOrganization || res.user.organizations?.find((o) => o.id === orgId);
      if (nextOrg) setActiveOrg(nextOrg);

      const projRes = await api.getProjects().catch(() => ({ projects: [] }));
      setProjects(projRes.projects || []);

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
          onNavigateToProjects={() => setSection("tasks")}
          onNavigateToCalendar={() => setSection("calendar")}
          onOpenWizard={() => setWizardOpen(true)}
          onShowNotice={showNotice}
        />
      )}

      {section === "tasks" && (
        <KanbanBoardView
          key={`tasks-${activeOrg?.id}`}
          user={user}
          activeOrg={activeOrg}
          userPermissions={userPermissions}
          onShowNotice={showNotice}
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
    </AppShell>
  );
}
