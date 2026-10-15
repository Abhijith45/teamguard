import { Building, KeyRound, ShieldCheck, UserRound } from "lucide-react";

export function AccountPage({ user, activeOrg }) {
  const permissions = user.permissions || [];
  const roles = user.roles || [];
  const organizations = user.organizations || [];

  return (
    <div className="account-page-container">
      <section className="account-summary-card">
        <div className="account-profile-mark">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="account-avatar-img" />
          ) : (
            <UserRound size={28} />
          )}
        </div>
        <div className="account-summary-info">
          <span className="eyebrow-accent">ACTIVE PROFILE</span>
          <h2>{user.name}</h2>
          <p className="account-meta">
            @{user.username} <span>·</span> {user.email}
          </p>
          <div className="active-tenant-badge">
            <Building size={14} />
            <span>Active Tenant: <strong>{activeOrg?.name || "Acme Corp"}</strong></span>
          </div>
        </div>
      </section>

      <div className="account-panels-grid">
        {/* Assigned Roles in Tenant */}
        <section className="account-panel">
          <div className="account-panel-heading">
            <ShieldCheck size={18} className="text-emerald" />
            <div>
              <h3>Assigned Roles in {activeOrg?.name}</h3>
              <p>Role definitions granting permissions for this organization membership</p>
            </div>
          </div>
          <div className="account-role-list">
            {roles.length > 0 ? (
              roles.map((role) => (
                <div className="account-role-row" key={role.id}>
                  <span className="role-tag role-emerald">{role.name}</span>
                  <span className="role-desc-text">
                    {role.slug === "super-admin"
                      ? "Full administrative control over tenant"
                      : role.slug === "project-manager"
                      ? "Manage projects, tasks, & files"
                      : role.slug === "team-member"
                      ? "Update own tasks (ABAC enforced)"
                      : "Read-only access"}
                  </span>
                </div>
              ))
            ) : (
              <p className="account-empty">No roles assigned in this tenant.</p>
            )}
          </div>
        </section>

        {/* User's Organizations */}
        <section className="account-panel">
          <div className="account-panel-heading">
            <Building size={18} className="text-blue" />
            <div>
              <h3>Organization Memberships</h3>
              <p>Workspaces you belong to</p>
            </div>
          </div>
          <div className="account-org-list">
            {organizations.map((org) => {
              const isCurrent = org.id === activeOrg?.id;
              const roleNames = org.roles?.map((r) => r.name).join(", ") || "Member";
              return (
                <div key={org.id} className={`account-org-row ${isCurrent ? "current" : ""}`}>
                  <div className="org-row-info">
                    <strong>{org.name}</strong>
                    <small>Role in tenant: {roleNames}</small>
                  </div>
                  {isCurrent && <span className="current-pill">Current</span>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Effective Permissions */}
      <section className="account-panel permissions-full-panel">
        <div className="account-panel-heading">
          <KeyRound size={18} className="text-amber" />
          <div>
            <h3>Effective Permissions ({permissions.length})</h3>
            <p>Granular actions authorized within the active organization</p>
          </div>
        </div>
        <div className="account-permission-grid">
          {permissions.map((p) => (
            <div key={`${p.resource}:${p.action}`} className="account-permission-chip">
              <code>{p.resource}:{p.action}</code>
            </div>
          ))}
          {permissions.length === 0 && (
            <p className="account-empty">No permissions active for this membership.</p>
          )}
        </div>
      </section>
    </div>
  );
}
