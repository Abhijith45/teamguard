import { useEffect, useState, useMemo } from "react";
import {
  Users,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  UserCheck,
  UserX,
  Trash2,
  Edit3,
  Building,
  CheckCircle2,
  AlertCircle,
  X,
  UserCog,
  Briefcase,
  AlertTriangle,
  Lock,
  UserPlus,
  Mail,
  Copy,
  RotateCw,
  Send,
  Check,
  ExternalLink,
} from "lucide-react";
import { api } from "../../services/api-client.js";

const ROLE_COLOR_MAP = {
  "super-admin": {
    badge: "role-emerald",
    label: "Super Admin",
    bg: "rgba(16, 185, 129, 0.12)",
    text: "#059669",
    border: "rgba(16, 185, 129, 0.3)",
    icon: Shield,
  },
  "project-manager": {
    badge: "role-blue",
    label: "Project Manager",
    bg: "rgba(59, 130, 246, 0.12)",
    text: "#2563EB",
    border: "rgba(59, 130, 246, 0.3)",
    icon: Briefcase,
  },
  "team-member": {
    badge: "role-purple",
    label: "Team Member",
    bg: "rgba(139, 92, 246, 0.12)",
    text: "#7C3AED",
    border: "rgba(139, 92, 246, 0.3)",
    icon: Users,
  },
  "stakeholder": {
    badge: "role-gray",
    label: "Stakeholder",
    bg: "rgba(100, 116, 139, 0.12)",
    text: "#475569",
    border: "rgba(100, 116, 139, 0.3)",
    icon: UserCheck,
  },
};

export function MembersView({ activeOrg, currentUser, onShowNotice }) {
  const [members, setMembers] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [selectedRole, setSelectedRole] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Modals state
  const [roleModalMember, setRoleModalMember] = useState(null);
  const [targetRoleId, setTargetRoleId] = useState(null);
  const [roleUpdating, setRoleUpdating] = useState(false);

  const [statusModalMember, setStatusModalMember] = useState(null);
  const [targetStatus, setTargetStatus] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const [removeModalMember, setRemoveModalMember] = useState(null);
  const [removing, setRemoving] = useState(false);

  const [deptModalMember, setDeptModalMember] = useState(null);
  const [targetDept, setTargetDept] = useState("");
  const [deptUpdating, setDeptUpdating] = useState(false);

  // Invitations State (TASK-505 / UD-005)
  const [activeTab, setActiveTab] = useState("members"); // "members" | "invitations"
  const [invitations, setInvitations] = useState([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteDept, setInviteDept] = useState("");
  const [inviting, setInviting] = useState(false);
  const [createdInviteResult, setCreatedInviteResult] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  // Permission check: Does current user hold member management permissions?
  const canManageMembers = useMemo(() => {
    if (!currentUser) return false;
    const perms = currentUser.permissions || [];
    const roles = currentUser.roles || [];
    const isSuperAdmin = roles.some((r) => r.slug === "super-admin" || r.name === "Super Admin");
    return isSuperAdmin || perms.includes("members:manage") || perms.includes("roles:manage");
  }, [currentUser]);

  // Load members and roles
  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [membersRes, rolesRes, invitesRes] = await Promise.all([
        api.getMembers("status=ALL"),
        api.getMemberRoles().catch(() => ({ roles: [] })),
        canManageMembers ? api.getInvitations().catch(() => ({ invitations: [] })) : Promise.resolve({ invitations: [] }),
      ]);
      setMembers(membersRes.members || []);
      setAvailableRoles(rolesRes.roles || []);
      setInvitations(invitesRes?.invitations || []);
    } catch (err) {
      setError(err.message || "Failed to load organization members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [activeOrg?.id]);

  // Global workspace cache purge listener (TASK-003)
  useEffect(() => {
    function handlePurge() {
      setMembers([]);
      loadData();
    }
    window.addEventListener("teamguard:workspace-purged", handlePurge);
    return () => window.removeEventListener("teamguard:workspace-purged", handlePurge);
  }, [activeOrg?.id]);

  // Extract unique departments for filter chips
  const departmentList = useMemo(() => {
    const set = new Set();
    members.forEach((m) => {
      if (m.department && m.department.trim()) {
        set.add(m.department.trim());
      }
    });
    return Array.from(set).sort();
  }, [members]);

  // KPI Calculations
  const metrics = useMemo(() => {
    const total = members.length;
    const active = members.filter((m) => m.status === "ACTIVE").length;
    const owners = members.filter(
      (m) => m.status === "ACTIVE" && m.roles?.some((r) => r.slug === "super-admin")
    ).length;
    const inactive = members.filter((m) => m.status !== "ACTIVE").length;
    return { total, active, owners, inactive, depts: departmentList.length };
  }, [members, departmentList]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = m.user?.name?.toLowerCase().includes(q);
        const emailMatch = m.user?.email?.toLowerCase().includes(q);
        const userMatch = m.user?.username?.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !userMatch) return false;
      }
      // Department filter
      if (selectedDept !== "ALL") {
        if ((m.department || "General") !== selectedDept) return false;
      }
      // Role filter
      if (selectedRole !== "ALL") {
        const hasRole = m.roles?.some(
          (r) => r.slug === selectedRole || r.name.toLowerCase() === selectedRole.toLowerCase()
        );
        if (!hasRole) return false;
      }
      // Status filter
      if (selectedStatus !== "ALL") {
        if (m.status !== selectedStatus) return false;
      }
      return true;
    });
  }, [members, searchQuery, selectedDept, selectedRole, selectedStatus]);

  // Handlers for Role Reassignment
  async function handleRoleReassign(e) {
    e?.preventDefault();
    if (!roleModalMember || !targetRoleId) return;
    try {
      setRoleUpdating(true);
      const res = await api.reassignMemberRole(roleModalMember.membershipId, targetRoleId);
      onShowNotice?.({
        type: "success",
        title: "Role Reassigned",
        message: `${roleModalMember.user.name}'s role was updated successfully.`,
      });
      setRoleModalMember(null);
      await loadData();
    } catch (err) {
      onShowNotice?.({
        type: "error",
        title: "Role Reassignment Blocked",
        message: err.message || "Failed to reassign role.",
      });
    } finally {
      setRoleUpdating(false);
    }
  }

  // Handlers for Member Status Change
  async function handleStatusChange(e) {
    e?.preventDefault();
    if (!statusModalMember || !targetStatus) return;
    try {
      setStatusUpdating(true);
      await api.updateMemberStatus(statusModalMember.membershipId, targetStatus);
      onShowNotice?.({
        type: "success",
        title: "Status Updated",
        message: `${statusModalMember.user.name} is now ${targetStatus.toLowerCase()}.`,
      });
      setStatusModalMember(null);
      await loadData();
    } catch (err) {
      onShowNotice?.({
        type: "error",
        title: "Status Update Blocked",
        message: err.message || "Failed to update member status.",
      });
    } finally {
      setStatusUpdating(false);
    }
  }

  // Handlers for Member Department Update
  async function handleDeptUpdate(e) {
    e?.preventDefault();
    if (!deptModalMember) return;
    try {
      setDeptUpdating(true);
      await api.updateMemberDepartment(deptModalMember.membershipId, targetDept);
      onShowNotice?.({
        type: "success",
        title: "Department Updated",
        message: `${deptModalMember.user.name}'s department has been updated.`,
      });
      setDeptModalMember(null);
      await loadData();
    } catch (err) {
      onShowNotice?.({
        type: "error",
        title: "Update Failed",
        message: err.message || "Failed to update department.",
      });
    } finally {
      setDeptUpdating(false);
    }
  }

  // Handlers for Member Removal
  async function handleRemoveMember(e) {
    e?.preventDefault();
    if (!removeModalMember) return;
    try {
      setRemoving(true);
      await api.removeMember(removeModalMember.membershipId);
      onShowNotice?.({
        type: "success",
        title: "Member Removed",
        message: `${removeModalMember.user.name} was removed from ${activeOrg?.name}.`,
      });
      setRemoveModalMember(null);
      await loadData();
    } catch (err) {
      onShowNotice?.({
        type: "error",
        title: "Removal Blocked",
        message: err.message || "Cannot remove member.",
      });
    } finally {
      setRemoving(false);
    }
  }

  // Handlers for Member Invitations (TASK-505 / UD-005)
  async function handleCreateInvite(e) {
    e?.preventDefault();
    if (!inviteEmail || !inviteRoleId) return;
    try {
      setInviting(true);
      setError(null);
      const res = await api.createInvitation({
        email: inviteEmail.trim(),
        roleId: Number(inviteRoleId),
        department: inviteDept.trim() || undefined,
      });
      setCreatedInviteResult(res);
      const updated = await api.getInvitations();
      setInvitations(updated.invitations || []);
      onShowNotice?.({
        type: "success",
        title: "Invitation Dispatched",
        message: `Transactional invitation email sent to ${inviteEmail} via Resend.`,
      });
    } catch (err) {
      setError(err.message || "Failed to dispatch invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevokeInvite(id) {
    try {
      setRevokingId(id);
      await api.revokeInvitation(id);
      const updated = await api.getInvitations();
      setInvitations(updated.invitations || []);
      onShowNotice?.({
        type: "success",
        title: "Invitation Revoked",
        message: "The invitation token has been permanently invalidated.",
      });
    } catch (err) {
      onShowNotice?.({
        type: "error",
        title: "Revocation Failed",
        message: err.message || "Cannot revoke invitation.",
      });
    } finally {
      setRevokingId(null);
    }
  }

  async function handleResendInvite(id) {
    try {
      setResendingId(id);
      const res = await api.resendInvitation(id);
      const updated = await api.getInvitations();
      setInvitations(updated.invitations || []);
      if (res.inviteUrl) {
        await navigator.clipboard.writeText(res.inviteUrl).catch(() => {});
      }
      onShowNotice?.({
        type: "success",
        title: "Invitation Resent",
        message: "Invitation re-dispatched and fresh link copied to clipboard!",
      });
    } catch (err) {
      onShowNotice?.({
        type: "error",
        title: "Resend Failed",
        message: err.message || "Cannot resend invitation.",
      });
    } finally {
      setResendingId(null);
    }
  }

  if (loading && members.length === 0) {
    return (
      <div className="view-loading-container" role="status" aria-live="polite">
        <div className="loading-spinner" />
        <span>Loading organization members…</span>
      </div>
    );
  }

  return (
    <div className="members-view-container">
      {/* 1. Header & Title Section */}
      <div className="members-view-header">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Users size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Organization Directory</h2>
              <p className="text-sm text-text-muted">
                Governed members, assigned roles, and departmental assignments in{" "}
                <strong className="text-text-primary">{activeOrg?.name}</strong>.
              </p>
            </div>
          </div>
        </div>

        {canManageMembers && (
          <div className="members-header-badge-row flex items-center gap-3">
            <span className="badge-governance-active">
              <ShieldCheck size={14} className="text-emerald-500" />
              Role Reassignment & Governance Enabled
            </span>
            <button
              type="button"
              className="btn-primary-emerald flex items-center gap-2"
              onClick={() => {
                setCreatedInviteResult(null);
                setInviteEmail("");
                setInviteRoleId(availableRoles.find((r) => r.slug === "team-member")?.id || availableRoles[0]?.id || "");
                setInviteDept("");
                setInviteModalOpen(true);
              }}
            >
              <UserPlus size={15} />
              <span>Invite Member</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs: Active Directory vs Invitations */}
      <div className="members-tab-nav flex items-center gap-2 border-b border-border-subtle pb-2 mb-4">
        <button
          type="button"
          className={`tab-btn flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "members"
              ? "bg-surface-active text-text-primary border border-border-subtle shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
          onClick={() => setActiveTab("members")}
        >
          <Users size={16} />
          <span>Members Directory ({members.length})</span>
        </button>
        {canManageMembers && (
          <button
            type="button"
            className={`tab-btn flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "invitations"
                ? "bg-surface-active text-text-primary border border-border-subtle shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
            onClick={() => setActiveTab("invitations")}
          >
            <Mail size={16} />
            <span>
              Invitations (
              {invitations.filter((i) => i.status === "PENDING").length} pending)
            </span>
          </button>
        )}
      </div>

      {error && (
        <div className="view-error-container" role="alert">
          <AlertCircle size={20} className="text-destructive flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Main Tab View Content */}
      {activeTab === "members" && (
        <>
          {/* Executive KPI Summary Cards */}
          <div className="members-kpi-grid">
        <div className="members-kpi-card">
          <div className="members-kpi-icon bg-blue-500/10 text-blue-600">
            <Users size={20} />
          </div>
          <div className="members-kpi-content">
            <span className="members-kpi-label">Total Members</span>
            <span className="members-kpi-value">{metrics.total}</span>
          </div>
        </div>

        <div className="members-kpi-card">
          <div className="members-kpi-icon bg-emerald-500/10 text-emerald-600">
            <Shield size={20} />
          </div>
          <div className="members-kpi-content">
            <span className="members-kpi-label">Active Super Admins</span>
            <div className="flex items-center gap-2">
              <span className="members-kpi-value">{metrics.owners}</span>
              {metrics.owners === 1 && (
                <span className="members-kpi-pill-warn" title="Single Owner Risk: Last-Owner Safeguard Active">
                  Sole Owner Protected
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="members-kpi-card">
          <div className="members-kpi-icon bg-purple-500/10 text-purple-600">
            <Building size={20} />
          </div>
          <div className="members-kpi-content">
            <span className="members-kpi-label">Departments</span>
            <span className="members-kpi-value">{metrics.depts || 1}</span>
          </div>
        </div>

        <div className="members-kpi-card">
          <div className="members-kpi-icon bg-amber-500/10 text-amber-600">
            <UserX size={20} />
          </div>
          <div className="members-kpi-content">
            <span className="members-kpi-label">Suspended / Inactive</span>
            <span className="members-kpi-value">{metrics.inactive}</span>
          </div>
        </div>
      </div>

      {/* 3. Search & Interactive Filter Controls */}
      <div className="members-filter-bar">
        <div className="members-search-wrapper">
          <Search size={16} className="members-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="members-search-input"
            placeholder="Search by name, username, or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search members"
          />
          {searchQuery && (
            <button
              type="button"
              className="members-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="members-filter-selects">
          <div className="filter-select-group">
            <Filter size={14} className="text-text-muted" aria-hidden="true" />
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="members-select"
              aria-label="Filter by role"
            >
              <option value="ALL">All Roles</option>
              <option value="super-admin">Super Admin</option>
              <option value="project-manager">Project Manager</option>
              <option value="team-member">Team Member</option>
              <option value="stakeholder">Stakeholder</option>
            </select>
          </div>

          <div className="filter-select-group">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="members-select"
              aria-label="Filter by status"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive / Suspended</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Department Filter Chips */}
      {departmentList.length > 0 && (
        <div className="members-dept-chips" role="group" aria-label="Department filters">
          <button
            type="button"
            className={`dept-chip ${selectedDept === "ALL" ? "active" : ""}`}
            onClick={() => setSelectedDept("ALL")}
            aria-pressed={selectedDept === "ALL"}
          >
            All Departments ({members.length})
          </button>
          {departmentList.map((dept) => {
            const count = members.filter((m) => (m.department || "General") === dept).length;
            return (
              <button
                key={dept}
                type="button"
                className={`dept-chip ${selectedDept === dept ? "active" : ""}`}
                onClick={() => setSelectedDept(dept)}
                aria-pressed={selectedDept === dept}
              >
                {dept} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* 5. Directory Grid */}
      {filteredMembers.length === 0 ? (
        <div className="members-empty-state">
          <Users size={36} className="text-text-muted opacity-40 mb-3" />
          <h4 className="font-semibold text-text-primary">No members match your criteria</h4>
          <p className="text-sm text-text-muted mt-1">Try resetting the search terms or selected filters.</p>
          <button
            type="button"
            className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-surface border border-border hover:bg-surface-hover"
            onClick={() => {
              setSearchQuery("");
              setSelectedDept("ALL");
              setSelectedRole("ALL");
              setSelectedStatus("ALL");
            }}
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="members-grid-enhanced">
          {filteredMembers.map((m) => {
            const primaryRole = m.roles?.[0] || { name: "Member", slug: "team-member" };
            const roleConfig = ROLE_COLOR_MAP[primaryRole.slug] || {
              badge: "role-purple",
              label: primaryRole.name,
              bg: "rgba(139, 92, 246, 0.12)",
              text: "#7C3AED",
              icon: Users,
            };
            const RoleIcon = roleConfig.icon;
            const isInactive = m.status !== "ACTIVE";

            return (
              <div
                key={m.membershipId}
                className={`member-card-enhanced ${isInactive ? "member-card-inactive" : ""} ${
                  m.isLastOwner ? "member-card-last-owner" : ""
                }`}
              >
                {/* Card Top: Avatar, Name, Email, Status Indicator */}
                <div className="member-card-top">
                  <div className="member-avatar-wrapper">
                    {m.user?.avatarUrl ? (
                      <img src={m.user.avatarUrl} alt={m.user.name} className="member-avatar-img" />
                    ) : (
                      <div className="member-avatar-placeholder">
                        {m.user?.name ? m.user.name[0].toUpperCase() : "U"}
                      </div>
                    )}
                    <span
                      className={`member-status-dot ${isInactive ? "status-dot-inactive" : "status-dot-active"}`}
                      title={`Status: ${m.status}`}
                    />
                  </div>

                  <div className="member-meta-info">
                    <div className="flex items-center gap-1.5">
                      <h4 className="member-name">{m.user?.name}</h4>
                      {m.isLastOwner && (
                        <span
                          className="sole-owner-pill"
                          title="Sole Organization Owner: Protected by BR-010 against demotion, deactivation, or removal"
                        >
                          <Lock size={11} className="text-amber-500" />
                          Sole Owner
                        </span>
                      )}
                    </div>
                    <p className="member-email-enhanced">{m.user?.email}</p>
                    <span className="member-username-tag">@{m.user?.username}</span>
                  </div>
                </div>

                {/* Card Middle: Role Badge, Department, Joined Date */}
                <div className="member-attributes-box">
                  <div className="member-attribute-row">
                    <span className="attribute-label">Role:</span>
                    <span
                      className="role-badge-pill"
                      style={{
                        backgroundColor: roleConfig.bg,
                        color: roleConfig.text,
                        borderColor: roleConfig.border || "transparent",
                      }}
                    >
                      <RoleIcon size={12} aria-hidden="true" />
                      {primaryRole.name}
                    </span>
                  </div>

                  <div className="member-attribute-row">
                    <span className="attribute-label">Department:</span>
                    <span className="dept-badge-pill">
                      <Building size={11} aria-hidden="true" />
                      {m.department || "General"}
                    </span>
                  </div>

                  <div className="member-attribute-row">
                    <span className="attribute-label">Status:</span>
                    <span
                      className={`status-pill ${
                        m.status === "ACTIVE"
                          ? "status-pill-active"
                          : m.status === "SUSPENDED"
                          ? "status-pill-suspended"
                          : "status-pill-inactive"
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                </div>

                {/* Card Bottom: Management Actions (Guarded by members:manage) */}
                {canManageMembers && (
                  <div className="member-card-actions-dock">
                    <button
                      type="button"
                      className="member-action-btn action-edit-role"
                      disabled={m.isLastOwner}
                      title={
                        m.isLastOwner
                          ? "Sole Organization Owner cannot be demoted (BR-010 Safeguard)"
                          : "Reassign Member Role"
                      }
                      onClick={() => {
                        setRoleModalMember(m);
                        setTargetRoleId(primaryRole.id);
                      }}
                      aria-label={`Reassign role for ${m.user.name}`}
                    >
                      <UserCog size={13} />
                      Role
                    </button>

                    <button
                      type="button"
                      className="member-action-btn action-edit-dept"
                      title="Update Department"
                      onClick={() => {
                        setDeptModalMember(m);
                        setTargetDept(m.department || "");
                      }}
                      aria-label={`Update department for ${m.user.name}`}
                    >
                      <Edit3 size={13} />
                      Dept
                    </button>

                    <button
                      type="button"
                      className={`member-action-btn ${
                        isInactive ? "action-activate" : "action-deactivate"
                      }`}
                      disabled={m.isLastOwner}
                      title={
                        m.isLastOwner
                          ? "Sole Organization Owner cannot be deactivated (BR-010 Safeguard)"
                          : isInactive
                          ? "Activate Member"
                          : "Deactivate Member"
                      }
                      onClick={() => {
                        setStatusModalMember(m);
                        setTargetStatus(isInactive ? "ACTIVE" : "INACTIVE");
                      }}
                      aria-label={`${isInactive ? "Activate" : "Deactivate"} ${m.user.name}`}
                    >
                      {isInactive ? <UserCheck size={13} /> : <UserX size={13} />}
                      {isInactive ? "Activate" : "Suspend"}
                    </button>

                    <button
                      type="button"
                      className="member-action-btn action-remove"
                      disabled={m.isLastOwner}
                      title={
                        m.isLastOwner
                          ? "Sole Organization Owner cannot be removed (BR-010 Safeguard)"
                          : "Remove from Organization"
                      }
                      onClick={() => setRemoveModalMember(m)}
                      aria-label={`Remove ${m.user.name} from organization`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Invitations Management Tab View */}
      {activeTab === "invitations" && (
        <div className="invitations-management-container space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border">
            <div>
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Mail size={18} className="text-indigo-400" />
                <span>Pending Workspace Invitations</span>
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Cryptographically secured single-use invitation tokens, valid for 7 days via Resend transactional email.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary-emerald flex items-center gap-2"
              onClick={() => {
                setCreatedInviteResult(null);
                setInviteEmail("");
                setInviteRoleId(availableRoles.find((r) => r.slug === "team-member")?.id || availableRoles[0]?.id || "");
                setInviteDept("");
                setInviteModalOpen(true);
              }}
            >
              <UserPlus size={15} />
              <span>Invite Member</span>
            </button>
          </div>

          {invitations.length === 0 ? (
            <div className="members-empty-state p-12 text-center border border-dashed border-border rounded-xl">
              <Mail size={32} className="mx-auto text-text-muted mb-3 opacity-40" />
              <h3 className="text-base font-semibold text-text-primary">No Pending Invitations</h3>
              <p className="text-sm text-text-muted max-w-sm mx-auto mt-1">
                There are currently no active or pending member invitations for {activeOrg?.name}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/40 text-xs font-semibold text-text-muted uppercase tracking-wider">
                    <th className="py-3 px-4">Invited Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Invited By</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {invitations.map((inv) => {
                    const isPending = inv.status === "PENDING";
                    const isExpired = inv.status === "EXPIRED" || new Date(inv.expiresAt) < new Date();
                    const isRevoked = inv.status === "REVOKED";
                    const isAccepted = inv.status === "ACCEPTED";

                    return (
                      <tr key={inv.id} className="hover:bg-surface-hover transition-colors">
                        <td className="py-3.5 px-4 font-medium text-text-primary flex items-center gap-2">
                          <Mail size={15} className="text-indigo-400 flex-shrink-0" />
                          <span>{inv.email}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="badge-role-pill">
                            {inv.role?.name || "Member"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-text-muted">
                          {inv.department || "—"}
                        </td>
                        <td className="py-3.5 px-4 text-text-muted text-xs">
                          {inv.inviter?.name || "Admin"}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-text-muted">
                          {new Date(inv.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4">
                          {isPending && !isExpired && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Pending
                            </span>
                          )}
                          {isAccepted && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                              <Check size={12} />
                              Accepted
                            </span>
                          )}
                          {isRevoked && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
                              <X size={12} />
                              Revoked
                            </span>
                          )}
                          {(isExpired || inv.status === "EXPIRED") && !isRevoked && !isAccepted && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/30">
                              <Clock size={12} />
                              Expired
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(isPending || isExpired) && (
                              <button
                                type="button"
                                className="p-1.5 rounded-md hover:bg-surface-active text-text-muted hover:text-text-primary text-xs flex items-center gap-1 border border-border"
                                title="Resend invitation email & renew 7-day token"
                                disabled={resendingId === inv.id}
                                onClick={() => handleResendInvite(inv.id)}
                              >
                                <RotateCw size={13} className={resendingId === inv.id ? "animate-spin" : ""} />
                                <span>{resendingId === inv.id ? "Resending…" : "Resend"}</span>
                              </button>
                            )}
                            {isPending && !isExpired && (
                              <button
                                type="button"
                                className="p-1.5 rounded-md hover:bg-red-500/10 text-red-400 text-xs flex items-center gap-1 border border-red-500/30"
                                title="Revoke pending invitation"
                                disabled={revokingId === inv.id}
                                onClick={() => handleRevokeInvite(inv.id)}
                              >
                                <Trash2 size={13} />
                                <span>{revokingId === inv.id ? "Revoking…" : "Revoke"}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL 1: Role Reassignment Modal (US-INV-004)
         ========================================================================= */}
      {roleModalMember && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="role-modal-title">
          <div className="member-dialog-content">
            <div className="member-dialog-header">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                  <UserCog size={20} />
                </div>
                <div>
                  <h3 id="role-modal-title" className="text-base font-bold text-text-primary">
                    Reassign Member Role
                  </h3>
                  <p className="text-xs text-text-muted">
                    Update permissions and workspace governance for{" "}
                    <strong>{roleModalMember.user.name}</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRoleModalMember(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRoleReassign} className="mt-4">
              <div className="role-options-list">
                {availableRoles.map((role) => {
                  const isSelected = targetRoleId === role.id;
                  const config = ROLE_COLOR_MAP[role.slug] || {
                    icon: Users,
                    text: "#2563EB",
                  };
                  const Icon = config.icon;

                  return (
                    <label
                      key={role.id}
                      className={`role-option-card ${isSelected ? "selected" : ""}`}
                    >
                      <div className="role-option-row">
                        <input
                          type="radio"
                          name="targetRole"
                          value={role.id}
                          checked={isSelected}
                          onChange={() => setTargetRoleId(role.id)}
                          style={{ marginTop: "3px" }}
                        />
                        <div className="role-option-info">
                          <div className="role-option-title-row">
                            <Icon size={14} style={{ color: config.text, flexShrink: 0 }} />
                            <span className="role-option-name">
                              {role.name}
                            </span>
                            {role.isSystem && (
                              <span className="role-system-tag">
                                System
                              </span>
                            )}
                          </div>
                          {role.description && (
                            <p className="role-option-desc">{role.description}</p>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {roleModalMember.isLastOwner && (
                <div className="modal-warning-banner mt-3">
                  <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                  <span>
                    <strong>BR-010 Safeguard:</strong> This user is currently the sole active Super Admin.
                    You must promote another member to Super Admin before demoting this user.
                  </span>
                </div>
              )}

              <div className="member-dialog-actions mt-5">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setRoleModalMember(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={roleUpdating || (roleModalMember.isLastOwner && targetRoleId !== availableRoles.find((r) => r.slug === "super-admin")?.id)}
                  className="btn-modal-confirm bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {roleUpdating ? "Updating Role…" : "Apply Role Reassignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: Department Update Modal
         ========================================================================= */}
      {deptModalMember && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dept-modal-title">
          <div className="member-dialog-content max-w-sm">
            <div className="member-dialog-header">
              <div className="flex items-center gap-2">
                <Building size={20} className="text-blue-600" />
                <h3 id="dept-modal-title" className="text-base font-bold text-text-primary">
                  Update Department
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeptModalMember(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleDeptUpdate} className="mt-4">
              <label className="text-xs font-semibold text-text-muted block mb-1">
                Department Name
              </label>
              <input
                type="text"
                className="members-search-input w-full"
                placeholder="e.g. Engineering, Marketing, Operations"
                value={targetDept}
                onChange={(e) => setTargetDept(e.target.value)}
                maxLength={60}
                required
              />

              <div className="member-dialog-actions mt-5">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setDeptModalMember(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deptUpdating}
                  className="btn-modal-confirm bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {deptUpdating ? "Saving…" : "Save Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: Status Toggle (Suspend / Activate) Modal (US-INV-005)
         ========================================================================= */}
      {statusModalMember && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="status-modal-title">
          <div className="member-dialog-content max-w-sm">
            <div className="member-dialog-header">
              <div className="flex items-center gap-2">
                {targetStatus === "ACTIVE" ? (
                  <UserCheck size={20} className="text-emerald-600" />
                ) : (
                  <UserX size={20} className="text-amber-600" />
                )}
                <h3 id="status-modal-title" className="text-base font-bold text-text-primary">
                  {targetStatus === "ACTIVE" ? "Activate Member" : "Suspend Member Access"}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setStatusModalMember(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 text-sm text-text-muted leading-relaxed">
              {targetStatus === "ACTIVE" ? (
                <p>
                  Reactivating <strong>{statusModalMember.user.name}</strong> will restore their access
                  to projects, tasks, and files in <strong>{activeOrg?.name}</strong>.
                </p>
              ) : (
                <p>
                  Suspending <strong>{statusModalMember.user.name}</strong> will immediately revoke their
                  active sessions and prevent any read or write access to this organization.
                </p>
              )}
            </div>

            <div className="member-dialog-actions mt-5">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setStatusModalMember(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusUpdating}
                onClick={handleStatusChange}
                className={`btn-modal-confirm ${
                  targetStatus === "ACTIVE"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white"
                }`}
              >
                {statusUpdating
                  ? "Processing…"
                  : targetStatus === "ACTIVE"
                  ? "Confirm Activation"
                  : "Confirm Suspension"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: Destructive Member Removal Modal (US-INV-005)
         ========================================================================= */}
      {removeModalMember && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="remove-modal-title">
          <div className="member-dialog-content max-w-md">
            <div className="member-dialog-header">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-600">
                  <Trash2 size={20} />
                </div>
                <h3 id="remove-modal-title" className="text-base font-bold text-text-primary">
                  Remove Member from Organization
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRemoveModalMember(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 text-sm text-text-muted leading-relaxed">
              <p>
                Are you sure you want to permanently remove{" "}
                <strong className="text-text-primary">{removeModalMember.user.name}</strong> (
                {removeModalMember.user.email}) from <strong>{activeOrg?.name}</strong>?
              </p>
              <div className="modal-danger-box mt-3">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
                <span className="text-xs text-red-700">
                  This action disassociates the user from this workspace. Any active tasks assigned to this
                  member will be unassigned. This operation cannot be undone.
                </span>
              </div>
            </div>

            <div className="member-dialog-actions mt-5">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setRemoveModalMember(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={handleRemoveMember}
                className="btn-modal-confirm bg-red-600 hover:bg-red-700 text-white"
              >
                {removing ? "Removing…" : "Permanently Remove Member"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: Invite Member Modal (US-INV-001 / UD-005)
         ========================================================================= */}
      {inviteModalOpen && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
          <div className="member-dialog-content max-w-lg">
            <div className="member-dialog-header">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 id="invite-modal-title" className="text-base font-bold text-text-primary">
                    Invite Organization Member
                  </h3>
                  <p className="text-xs text-text-muted">
                    Dispatch transactional email invitation via Resend for <strong>{activeOrg?.name}</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setInviteModalOpen(false);
                  setCreatedInviteResult(null);
                }}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            {createdInviteResult ? (
              <div className="mt-4 space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm space-y-1">
                  <div className="font-semibold flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>Invitation Successfully Dispatched!</span>
                  </div>
                  <p className="text-xs text-emerald-400/90">
                    A transactional email was sent to <strong>{createdInviteResult.invitation?.email}</strong>.
                    You can also share the direct single-use link below:
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-muted">Shareable Invitation Link</label>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-muted border border-border">
                    <input
                      type="text"
                      readOnly
                      value={createdInviteResult.inviteUrl || ""}
                      className="bg-transparent text-xs text-text-primary flex-1 outline-none font-mono selection:bg-indigo-500/30"
                    />
                    <button
                      type="button"
                      className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 flex-shrink-0"
                      onClick={() => {
                        if (createdInviteResult.inviteUrl) {
                          navigator.clipboard.writeText(createdInviteResult.inviteUrl);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2500);
                        }
                      }}
                    >
                      {copiedLink ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    This link contains a single-use cryptographically random token valid for 7 days.
                  </p>
                </div>

                <div className="member-dialog-actions mt-5">
                  <button
                    type="button"
                    className="btn-primary-emerald"
                    onClick={() => {
                      setInviteModalOpen(false);
                      setCreatedInviteResult(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary" htmlFor="invite-email-input">
                    Email Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="invite-email-input"
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="members-search-input w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary" htmlFor="invite-role-select">
                    Assigned Role <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="invite-role-select"
                    required
                    value={inviteRoleId}
                    onChange={(e) => setInviteRoleId(e.target.value)}
                    className="members-select w-full"
                  >
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} {role.isSystem ? "(System Default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary" htmlFor="invite-dept-input">
                    Department (Optional)
                  </label>
                  <input
                    id="invite-dept-input"
                    type="text"
                    placeholder="e.g. Engineering, Product, Security"
                    value={inviteDept}
                    onChange={(e) => setInviteDept(e.target.value)}
                    className="members-search-input w-full"
                  />
                </div>

                <div className="member-dialog-actions mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    onClick={() => setInviteModalOpen(false)}
                    disabled={inviting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary-emerald flex items-center gap-2"
                    disabled={inviting || !inviteEmail || !inviteRoleId}
                  >
                    {inviting ? (
                      <span>Dispatching…</span>
                    ) : (
                      <>
                        <Send size={15} />
                        <span>Dispatch Invitation</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
