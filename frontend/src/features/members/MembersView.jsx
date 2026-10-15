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
      const [membersRes, rolesRes] = await Promise.all([
        api.getMembers("status=ALL"),
        api.getMemberRoles().catch(() => ({ roles: [] })),
      ]);
      setMembers(membersRes.members || []);
      setAvailableRoles(rolesRes.roles || []);
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
          <div className="members-header-badge-row">
            <span className="badge-governance-active">
              <ShieldCheck size={14} className="text-emerald-500" />
              Role Reassignment & Governance Enabled
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="view-error-container" role="alert">
          <AlertCircle size={20} className="text-destructive flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Executive KPI Summary Cards */}
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
    </div>
  );
}
