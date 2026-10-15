import { useMemo } from "react";
import { Activity, ChevronDown, MoreHorizontal, Search } from "lucide-react";
import { MetricStat, PageHeading } from "../../components/AdminPrimitives.jsx";

const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export function UsersPage({ users, roles, permissions, loading, query, setQuery, onReload, onEdit, onToggleActive }) {
  const filteredUsers = useMemo(() => users.filter((person) => !query || `${person.name} ${person.username} ${person.email}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  return <>
    <PageHeading eyebrow="DIRECTORY / 01" title="Users" description="Manage account access, assigned roles, and individual grants." action={<button className="button button-quiet" onClick={onReload}><Activity size={15} /> Refresh</button>} />
    <div className="stats-row">
      <MetricStat label="ACCOUNTS" value={users.length} hint="In this directory" />
      <MetricStat label="ACTIVE" value={users.filter((person) => person.isActive).length} hint="Can authenticate" />
      <MetricStat label="ROLES" value={roles.length} hint="Available to assign" />
      <MetricStat label="PERMISSIONS" value={permissions.length} hint="Defined actions" />
    </div>
    <section className="data-section">
      <div className="section-toolbar"><div><h2>Account directory</h2><span>{filteredUsers.length} records</span></div><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" aria-label="Search people" /></label></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>PERSON</th><th>ROLES</th><th>DIRECT GRANTS</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {loading ? <tr><td colSpan="5" className="table-message">Loading directory…</td></tr> : filteredUsers.length === 0 ? <tr><td colSpan="5" className="table-message">No matching accounts.</td></tr> : filteredUsers.map((person) => <tr key={person.id}>
          <td><div className="person-cell"><span className={`avatar avatar-${person.id % 4}`}>{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.email} <i>@{person.username}</i></small></span></div></td>
          <td><div className="tag-list">{person.roles.length ? person.roles.map((role) => <span className={`role-tag role-${role.name}`} key={role.id}>{role.name}</span>) : <span className="muted-inline">No roles</span>}</div></td>
          <td>{person.directPermissions.length ? <span className="grant-count">{person.directPermissions.length} direct grants</span> : <span className="muted-inline">None</span>}</td>
          <td><span className={`status-label ${person.isActive ? "is-active" : "is-inactive"}`}><span />{person.isActive ? "Active" : "Inactive"}</span></td>
          <td><div className="row-actions"><button className="button button-small" onClick={() => onEdit(person)}>Manage access <ChevronDown size={13} /></button><button className="icon-button" onClick={() => onToggleActive(person)} title={person.isActive ? "Deactivate account" : "Activate account"} aria-label={person.isActive ? `Deactivate ${person.username}` : `Activate ${person.username}`}><MoreHorizontal size={18} /></button></div></td>
        </tr>)}
      </tbody></table></div>
    </section>
  </>;
}
