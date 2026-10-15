import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Folder,
  Layers,
  Lock,
  MessageSquare,
  Shield,
  Trash2,
  User,
  X,
} from "lucide-react";

export function TaskDetailDrawer({
  task,
  projects = [],
  members = [],
  canEdit = false,
  canAssign = false,
  canManageProjects = false,
  canDelete = false,
  onClose,
  onSave,
  onDelete,
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [status, setStatus] = useState(task?.status || "TODO");
  const [priority, setPriority] = useState(task?.priority || "MEDIUM");
  const [projectId, setProjectId] = useState(task?.projectId ? String(task.projectId) : "");
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ? String(task.assigneeId) : "");
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [drawerError, setDrawerError] = useState(null);

  // Esc key dismissal (US-TASK-004)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!task) return null;

  const isArchived = Boolean(task.project?.isArchived);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setDrawerError(null);

    const payload = {
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };

    if (canManageProjects && projectId && Number(projectId) !== task.projectId) {
      payload.projectId = Number(projectId);
    }

    if (canAssign) {
      payload.assigneeId = assigneeId ? Number(assigneeId) : null;
    }

    try {
      await onSave(task.id, payload);
      onClose();
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.data?.error ||
        err.message ||
        "Failed to save changes";
      setDrawerError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || isArchived) return;
    if (!window.confirm(`Are you sure you want to delete task "${task.title}"?`)) return;

    setDeleting(true);
    setDrawerError(null);

    try {
      await onDelete(task.id);
      onClose();
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.data?.error ||
        err.message ||
        "Failed to delete task";
      setDrawerError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const projectKeyBadge = `${task.project?.key || "PROJ"}-${task.id}`;

  return (
    <div
      className="drawer-backdrop"
      onClick={onClose}
      role="presentation"
      data-testid="task-drawer-backdrop"
    >
      <div
        className="task-detail-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-heading"
        data-testid="task-detail-drawer"
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <span className="task-jira-key-badge" style={{ fontSize: "12px", fontWeight: "800" }}>
              {projectKeyBadge}
            </span>
            <span className={`tag-priority tag-${priority.toLowerCase()}`}>
              {priority}
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "700",
                padding: "3px 8px",
                borderRadius: "12px",
                background: status === "DONE" ? "#DCFCE7" : "#F1F5F9",
                color: status === "DONE" ? "#16A34A" : "#475569",
              }}
            >
              {status}
            </span>
            {isArchived && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "800",
                  color: "#D97706",
                  background: "#FEF3C7",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                ARCHIVED
              </span>
            )}
            {!canEdit && (
              <span className="badge-locked" title="ABAC restriction: Read-only access">
                <Lock size={12} /> Read Only
              </span>
            )}
          </div>
          <button
            type="button"
            className="icon-btn-ghost"
            onClick={onClose}
            aria-label="Close drawer (Esc)"
            title="Close drawer (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Banner */}
        {drawerError && (
          <div className="dialog-error-banner" role="alert" style={{ margin: "12px 24px 0" }}>
            <AlertCircle size={16} />
            <span>{drawerError}</span>
          </div>
        )}

        {/* Drawer Scrollable Body */}
        <form id="task-drawer-form" onSubmit={handleSubmit} className="drawer-body">
          {/* Metadata Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: "#F8FAFC",
              borderRadius: "8px",
              border: "1px solid var(--color-border-subtle)",
              fontSize: "0.8rem",
              color: "var(--color-text-muted)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <User size={13} />
              <span>Created by {task.creator?.name || "System"}</span>
            </div>
            {task.completedAt ? (
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#16A34A", fontWeight: "600" }}>
                <CheckCircle2 size={13} />
                <span>Completed {new Date(task.completedAt).toLocaleDateString()}</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Clock size={13} />
                <span>Updated {new Date(task.updatedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Title Field */}
          <div className="form-field">
            <label htmlFor="drawer-task-title">Title</label>
            <input
              id="drawer-task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit || isArchived}
              placeholder="Task summary / deliverable..."
              required
            />
          </div>

          {/* Description Field */}
          <div className="form-field">
            <label htmlFor="drawer-task-desc">Description</label>
            <textarea
              id="drawer-task-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit || isArchived}
              placeholder="Detailed task description, acceptance criteria, or technical notes..."
            />
          </div>

          {/* Status & Priority Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="form-field">
              <label htmlFor="drawer-task-status">Status</label>
              <select
                id="drawer-task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!canEdit || isArchived}
              >
                <option value="TODO">To do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="REVISION">Revision</option>
                <option value="DONE">Done</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="drawer-task-priority">Priority</label>
              <select
                id="drawer-task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={!canEdit || isArchived}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          {/* Due Date Field */}
          <div className="form-field">
            <label htmlFor="drawer-task-duedate" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={13} /> Due Date
            </label>
            <input
              id="drawer-task-duedate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={!canEdit || isArchived}
            />
          </div>

          {/* Protected Governance Fields Section (TASK-002) */}
          <div className="governance-block">
            <div className="governance-header">
              <div className="governance-title">
                <Shield size={14} className="text-emerald" />
                <span>Protected Governance Attributes</span>
              </div>
              <span className="governance-badge">ABAC Restricted</span>
            </div>
            <div className="governance-fields">
              <div className="governance-field">
                <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Folder size={12} />
                  <span>Project</span>
                  {!canManageProjects && <Lock size={11} className="lock-subtle" />}
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={!canManageProjects || isArchived}
                  className="status-dropdown"
                  style={{ padding: "7px 10px", fontSize: "0.8rem", width: "100%" }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.isArchived}>
                      {p.key ? `[${p.key}] ` : ""}{p.name}{p.isArchived ? " (Archived - Read Only)" : ""}
                    </option>
                  ))}
                </select>
                {!canManageProjects && (
                  <span className="field-hint">Requires project:manage or task:manage permission</span>
                )}
              </div>

              <div className="governance-field">
                <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <User size={12} />
                  <span>Assignee</span>
                  {!canAssign && <Lock size={11} className="lock-subtle" />}
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={!canAssign || isArchived}
                  className="status-dropdown"
                  style={{ padding: "7px 10px", fontSize: "0.8rem", width: "100%" }}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user?.name || `Member #${m.userId}`} ({m.department || "General"})
                    </option>
                  ))}
                </select>
                {!canAssign && (
                  <span className="field-hint">Requires task:assign or task:update:any permission</span>
                )}
              </div>
            </div>
          </div>

          {/* Subtasks / Checklist Preview (Phase 3 Forward Prep) */}
          <div
            style={{
              padding: "16px",
              background: "#F8FAFC",
              borderRadius: "8px",
              border: "1px dashed var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.82rem" }}>
                <Layers size={14} />
                <span>Checklist & Subtasks</span>
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>0 / 0 Done</span>
            </div>
            <p style={{ fontSize: "0.76rem", color: "var(--color-text-muted)", margin: 0 }}>
              Break deliverables down into discrete checklist items (collaboration engine enabled in Phase 3).
            </p>
          </div>

          {/* Comments Discussion Section Preview */}
          <div
            style={{
              padding: "16px",
              background: "#F8FAFC",
              borderRadius: "8px",
              border: "1px dashed var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.82rem", marginBottom: 6 }}>
              <MessageSquare size={14} />
              <span>Discussion & Comments ({task.commentsCount || 0})</span>
            </div>
            <p style={{ fontSize: "0.76rem", color: "var(--color-text-muted)", margin: 0 }}>
              Chronological discussion thread and user mentions (enabled in Phase 3).
            </p>
          </div>
        </form>

        {/* Drawer Footer Actions */}
        <div className="drawer-footer">
          <div>
            {canDelete && !isArchived && (
              <button
                type="button"
                className="btn-danger-ghost"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 12px",
                  fontSize: "0.82rem",
                  color: "#DC2626",
                  border: "1px solid #FCA5A5",
                  borderRadius: "6px",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={14} />
                <span>{deleting ? "Deleting..." : "Delete Task"}</span>
              </button>
            )}
          </div>

          <div className="drawer-footer-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            {canEdit && !isArchived && (
              <button
                type="submit"
                form="task-drawer-form"
                className="btn-primary-emerald"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
