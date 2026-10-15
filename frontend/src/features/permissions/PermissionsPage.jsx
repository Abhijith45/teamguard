import { Activity, CirclePlus, KeyRound, X } from "lucide-react";
import { PageHeading } from "../../components/AdminPrimitives.jsx";

export function PermissionsPage({ permissions, loading, onReload, onCreate, onDelete }) {
  return <>
    <PageHeading eyebrow="POLICY / 03" title="Permissions" description="Define actions on resources. Roles and users receive these grants." action={<button className="button button-primary" onClick={onCreate}><CirclePlus size={16} /> New permission</button>} />
    <section className="data-section">
      <div className="section-toolbar"><div><h2>Permission registry</h2><span>Identifiers use resource:action</span></div><button className="button button-quiet" onClick={onReload}><Activity size={15} /> Refresh</button></div>
      <div className="table-scroll"><table className="data-table permission-table"><thead><tr><th>PERMISSION</th><th>RESOURCE</th><th>ACTION</th><th>ROLES</th><th>DIRECT USERS</th><th /></tr></thead><tbody>
        {loading ? <tr><td colSpan="6" className="table-message">Loading permissions…</td></tr> : permissions.length === 0 ? <tr><td colSpan="6" className="table-message">No permissions defined.</td></tr> : permissions.map((permission) => <tr key={permission.id}>
          <td><div className="permission-id"><span className="permission-mark"><KeyRound size={14} /></span><span><strong>{permission.resource}:{permission.action}</strong><small>{permission.description || "No description"}</small></span></div></td>
          <td><span className="token-chip">{permission.resource}</span></td><td><span className="action-chip">{permission.action}</span></td><td>{permission._count.roles}</td><td>{permission._count.users}</td>
          <td><button className="icon-button danger-on-hover" onClick={() => onDelete(permission)} aria-label={`Delete ${permission.resource}:${permission.action}`} title="Delete permission"><X size={16} /></button></td>
        </tr>)}
      </tbody></table></div>
    </section>
    <div className="model-footnote"><Activity size={15} /><span><strong>Effective access</strong> is the union of permissions inherited through a user's roles and direct user grants.</span></div>
  </>;
}
