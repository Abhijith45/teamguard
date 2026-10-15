import { useState } from "react";
import {
  AlertCircle,
  Building,
  CheckCircle2,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserRound,
} from "lucide-react";
import { api } from "../../services/api-client.js";

export function AccountPage({ user, activeOrg, onUpdateUser, onShowNotice }) {
  const permissions = user?.permissions || [];
  const roles = user?.roles || [];
  const organizations = user?.organizations || [];

  // Profile Form State
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState(null);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState(null);

  // Session Cleanup State
  const [cleaningSessions, setCleaningSessions] = useState(false);
  const [cleanupFeedback, setCleanupFeedback] = useState(null);

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileFeedback(null);
    setProfileSaving(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        avatarUrl: avatarUrl.trim() || null,
      };
      const res = await api.updateProfile(payload);
      if (res?.user) {
        if (onUpdateUser) onUpdateUser(res.user);
        setProfileFeedback({ type: "success", message: "Account profile updated successfully." });
        if (onShowNotice) onShowNotice({ type: "success", message: "Profile saved." });
      }
    } catch (err) {
      setProfileFeedback({ type: "error", message: err.message || "Failed to update profile." });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 8) {
      setPasswordFeedback({ type: "error", message: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", message: "New passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    try {
      await api.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: revokeOthers,
      });
      setPasswordFeedback({
        type: "success",
        message: revokeOthers
          ? "Password updated! Other device sessions have been revoked."
          : "Password updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (onShowNotice) onShowNotice({ type: "success", message: "Password updated successfully." });
    } catch (err) {
      setPasswordFeedback({ type: "error", message: err.message || "Failed to change password." });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleCleanupSessions() {
    setCleaningSessions(true);
    setCleanupFeedback(null);
    try {
      const res = await api.cleanupSessions({ olderThanDays: 30 });
      setCleanupFeedback({
        type: "success",
        message: `Purged ${res.deletedCount ?? 0} expired/revoked sessions from database.`,
      });
    } catch (err) {
      setCleanupFeedback({ type: "error", message: err.message || "Session cleanup failed." });
    } finally {
      setCleaningSessions(false);
    }
  }

  return (
    <div className="account-page-container">
      {/* Profile Header Summary */}
      <section className="account-summary-card">
        <div className="account-profile-mark">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="account-avatar-img" />
          ) : (
            <UserRound size={32} />
          )}
        </div>
        <div className="account-summary-info">
          <span className="eyebrow-accent">ACTIVE PROFILE · MULTI-DEVICE SECURITY</span>
          <h2>{user?.name}</h2>
          <p className="account-meta">
            @{user?.username} <span>·</span> {user?.email}
          </p>
          <div className="active-tenant-badge">
            <Building size={14} />
            <span>Active Tenant: <strong>{activeOrg?.name || "Acme Corp"}</strong></span>
          </div>
        </div>
      </section>

      {/* Profile & Password Mutation Grid */}
      <div className="account-panels-grid">
        {/* Profile Settings (US-ACC-001) */}
        <section className="account-panel">
          <div className="account-panel-heading">
            <UserCheck size={18} className="text-emerald" />
            <div>
              <h3>Profile Information</h3>
              <p>Update your display name, email, and avatar</p>
            </div>
          </div>

          {profileFeedback && (
            <div className={`account-feedback-banner feedback-${profileFeedback.type}`}>
              {profileFeedback.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>{profileFeedback.message}</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="account-form">
            <div className="form-group">
              <label htmlFor="account-display-name">Display Name</label>
              <input
                id="account-display-name"
                type="text"
                className="account-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
              />
            </div>

            <div className="form-group">
              <label htmlFor="account-email">Email Address</label>
              <input
                id="account-email"
                type="email"
                className="account-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <small className="field-hint">Used for login, tenant invites, and audit alerts</small>
            </div>

            <div className="form-group">
              <label htmlFor="account-avatar">Avatar URL (Optional)</label>
              <input
                id="account-avatar"
                type="url"
                className="account-input"
                placeholder="https://example.com/photo.png"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn-primary-emerald account-submit-btn"
              disabled={profileSaving}
            >
              {profileSaving ? (
                <>
                  <Loader2 size={14} className="spin-icon" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save Profile</span>
              )}
            </button>
          </form>
        </section>

        {/* Password & Session Security (US-ACC-001 / SEC-09) */}
        <section className="account-panel">
          <div className="account-panel-heading">
            <Lock size={18} className="text-amber" />
            <div>
              <h3>Security & Password</h3>
              <p>Update password and manage session invalidation</p>
            </div>
          </div>

          {passwordFeedback && (
            <div className={`account-feedback-banner feedback-${passwordFeedback.type}`}>
              {passwordFeedback.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>{passwordFeedback.message}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="account-form">
            <div className="form-group">
              <label htmlFor="account-current-password">Current Password</label>
              <input
                id="account-current-password"
                type="password"
                className="account-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="Enter current password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="account-new-password">New Password</label>
              <input
                id="account-new-password"
                type="password"
                className="account-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
              />
            </div>

            <div className="form-group">
              <label htmlFor="account-confirm-password">Confirm New Password</label>
              <input
                id="account-confirm-password"
                type="password"
                className="account-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Re-enter new password"
              />
            </div>

            <div className="form-checkbox-row">
              <input
                id="account-revoke-others"
                type="checkbox"
                checked={revokeOthers}
                onChange={(e) => setRevokeOthers(e.target.checked)}
              />
              <label htmlFor="account-revoke-others">
                Revoke all other device refresh sessions upon change
              </label>
            </div>

            <button
              type="submit"
              className="btn-primary-emerald account-submit-btn"
              disabled={passwordSaving}
            >
              {passwordSaving ? (
                <>
                  <Loader2 size={14} className="spin-icon" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </form>
        </section>
      </div>

      {/* Multi-Device Session Security & Maintenance Banner */}
      <section className="account-panel session-security-panel">
        <div className="account-panel-heading">
          <Laptop size={18} className="text-blue" />
          <div>
            <h3>Multi-Device Session & Token Rotation Defense</h3>
            <p>Cryptographic family tracking, replay attack detection, and session lifecycle controls</p>
          </div>
        </div>

        <div className="session-security-grid">
          <div className="security-feature-item">
            <ShieldCheck size={20} className="text-emerald" />
            <div>
              <strong>Silent Family Rotation</strong>
              <p>Refresh tokens rotate atomically on each refresh cycle. Old tokens are instantly invalidated.</p>
            </div>
          </div>
          <div className="security-feature-item">
            <Lock size={20} className="text-amber" />
            <div>
              <strong>Replay Attack Defense</strong>
              <p>Replaying an already-used token triggers immediate invalidation of the entire session family.</p>
            </div>
          </div>
          <div className="security-feature-item">
            <RefreshCw size={20} className="text-blue" />
            <div>
              <strong>Session Housekeeping</strong>
              <p>Automated database cleanup purges expired tokens and long-revoked credentials.</p>
            </div>
          </div>
        </div>

        {cleanupFeedback && (
          <div className={`account-feedback-banner feedback-${cleanupFeedback.type}`} style={{ marginTop: "14px" }}>
            {cleanupFeedback.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{cleanupFeedback.message}</span>
          </div>
        )}

        <div className="session-maintenance-actions">
          <button
            type="button"
            className="btn-secondary account-cleanup-btn"
            onClick={handleCleanupSessions}
            disabled={cleaningSessions}
          >
            {cleaningSessions ? (
              <>
                <Loader2 size={14} className="spin-icon" />
                <span>Purging Expired Sessions...</span>
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                <span>Run Session Maintenance Cleanup</span>
              </>
            )}
          </button>
          <span className="maintenance-note">
            Removes expired sessions older than 30 days from PostgreSQL.
          </span>
        </div>
      </section>

      {/* Roles & Organization Memberships Grid */}
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

      {/* Effective Permissions (US-AUTH-005) */}
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
