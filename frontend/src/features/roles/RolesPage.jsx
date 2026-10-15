import { Activity, ArrowRight, CirclePlus, KeyRound, MoreHorizontal, ShieldUser, Users } from "lucide-react";
import { PageHeading } from "../../components/AdminPrimitives.jsx";

export function RolesPage({ roles, permissions, loading, onReload, onCreate, onEdit, onDelete }) {
  return <>
    <PageHeading eyebrow="POLICY / 02" title="Roles" description="Bundle permissions into roles and assign them to users." action={<button className="button button-primary" onClick={onCreate}><CirclePlus size={16} /> New role</button>} />
    <section className="data-section">
      <div className="section-toolbar"><div><h2>Role catalog</h2><span>{roles.length} roles · {permissions.length} permissions</span></div><button className="button button-quiet" onClick={onReload}><Activity size={15} /> Refresh</button></div>
      {loading ? <div className="table-message">Loading roles…</div> : <div className="role-grid">
        {roles.map((role) => <article className="role-card" key={role.id}>
          <div className="role-card-top"><span className={`role-icon role-icon-${role.name}`}><ShieldUser size={18} /></span><span className={`role-tag role-${role.name}`}>{role.name}</span><button className="icon-button role-menu" onClick={() => onDelete(role)} aria-label={`Delete ${role.name} role`} title="Delete role"><MoreHorizontal size={18} /></button></div>
          <h3>{role.name === "admin" ? "Administrator" : role.name === "user" ? "Standard user" : role.name}</h3><p>{role.description || "No description provided."}</p>
          <div className="role-card-meta"><span><Users size={14} /> {role._count.users} users</span><span><KeyRound size={14} /> {role.permissions.length} permissions</span></div>
          <div className="permission-chips">{role.permissions.slice(0, 4).map((permission) => <code key={permission.id}>{permission.resource}:{permission.action}</code>)}{role.permissions.length > 4 && <span>+{role.permissions.length - 4}</span>}</div>
          <button className="role-edit-button" onClick={() => onEdit(role)}>Edit role permissions <ArrowRight size={15} /></button>
        </article>)}
        {roles.length === 0 && <div className="empty-state">No roles yet.</div>}
      </div>}
    </section>
  </>;
}
