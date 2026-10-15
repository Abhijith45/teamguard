import { Check } from "lucide-react";
import { AssignmentList, Dialog } from "../../components/AdminPrimitives.jsx";

const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export function AccessDialogs({ dialog, setDialog, roles, permissions, onSaveUser, onSaveRole, onSavePermission }) {
  if (!dialog) return null;
  const close = () => setDialog(null);

  if (dialog.type === "user") return <Dialog title={`Manage ${dialog.targetUser.name}`} eyebrow="USER ACCESS" onClose={close} footer={<>
    <button className="button button-quiet" onClick={close}>Cancel</button>
    <button className="button button-primary" onClick={onSaveUser}>Save access <Check size={15} /></button>
  </>}>
    <div className="target-user-summary"><span className="avatar">{initials(dialog.targetUser.name)}</span><span><strong>{dialog.targetUser.email}</strong><small>@{dialog.targetUser.username}</small></span></div>
    <AssignmentList title="Assigned roles" hint="Inherited permissions" items={roles} selected={dialog.roleIds} toggle={(id) => setDialog((current) => ({ ...current, roleIds: toggleId(current.roleIds, id) }))} label={(role) => role.name} />
    <AssignmentList title="Direct grants" hint="Additive permissions" items={permissions} selected={dialog.permissionIds} toggle={(id) => setDialog((current) => ({ ...current, permissionIds: toggleId(current.permissionIds, id) }))} label={(permission) => `${permission.resource}:${permission.action}`} />
  </Dialog>;

  if (dialog.type === "role") return <Dialog title={dialog.targetRole ? "Edit role" : "Create role"} eyebrow="ROLE POLICY" onClose={close} footer={<>
    <button className="button button-quiet" onClick={close}>Cancel</button>
    <button className="button button-primary" onClick={onSaveRole}>{dialog.targetRole ? "Save changes" : "Create role"}<Check size={15} /></button>
  </>}>
    <div className="field-grid">
      <label>Role name<input value={dialog.name} onChange={(event) => setDialog((current) => ({ ...current, name: event.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="content-editor" disabled={dialog.targetRole && ["admin", "user"].includes(dialog.targetRole.name)} /></label>
      <label>Description<input value={dialog.description} onChange={(event) => setDialog((current) => ({ ...current, description: event.target.value }))} placeholder="What this role is for" maxLength="240" /></label>
    </div>
    {dialog.targetRole
      ? <AssignmentList title="Permissions" hint={`${dialog.permissionIds.length} selected`} items={permissions} selected={dialog.permissionIds} toggle={(id) => setDialog((current) => ({ ...current, permissionIds: toggleId(current.permissionIds, id) }))} label={(permission) => `${permission.resource}:${permission.action}`} />
      : <p className="dialog-hint">Create the role first, then assign permissions from its role card.</p>}
  </Dialog>;

  if (dialog.type === "permission") return <Dialog title="New permission" eyebrow="RESOURCE : ACTION" onClose={close} footer={<>
    <button className="button button-quiet" onClick={close}>Cancel</button>
    <button className="button button-primary" onClick={onSavePermission}>Create permission <Check size={15} /></button>
  </>}>
    <div className="field-grid field-grid-two">
      <label>Resource<input value={dialog.permission.resource} onChange={(event) => updatePermission(setDialog, "resource", event.target.value)} placeholder="invoices" /></label>
      <span className="permission-colon">:</span>
      <label>Action<input value={dialog.permission.action} onChange={(event) => updatePermission(setDialog, "action", event.target.value)} placeholder="approve" /></label>
    </div>
    <label className="dialog-field">Description<input value={dialog.permission.description} onChange={(event) => updatePermission(setDialog, "description", event.target.value)} placeholder="Approve submitted invoices" maxLength="240" /></label>
    <div className="permission-preview"><span>New identifier</span><code>{dialog.permission.resource || "resource"}:{dialog.permission.action || "action"}</code></div>
  </Dialog>;

  return null;
}

function toggleId(ids, id) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function updatePermission(setDialog, field, value) {
  const normalizedValue = field === "description" ? value : value.toLowerCase().replace(/\s+/g, "-");
  setDialog((current) => ({ ...current, permission: { ...current.permission, [field]: normalizedValue } }));
}
