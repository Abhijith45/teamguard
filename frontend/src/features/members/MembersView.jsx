import { useEffect, useState } from "react";
import { AlertCircle, Building, ShieldCheck, UserCheck, Users } from "lucide-react";
import { api } from "../../services/api-client.js";

export function MembersView({ activeOrg, onShowNotice }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getMembers();
        if (mounted) setMembers(res.members || []);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [activeOrg?.id]);

  if (loading) {
    return (
      <div className="view-loading-container">
        <div className="loading-spinner" />
        <span>Loading organization members…</span>
      </div>
    );
  }

  return (
    <div className="members-view-container">
      <div className="members-view-header">
        <div>
          <h2>Organization Directory</h2>
          <p>Active teammates, roles, and department assignments in <strong>{activeOrg?.name}</strong>.</p>
        </div>
      </div>

      {error && (
        <div className="view-error-container">
          <AlertCircle size={20} className="text-destructive" />
          <span>{error}</span>
        </div>
      )}

      <div className="members-grid">
        {members.map((m) => {
          const roleBadge = m.roles?.[0]?.name || "Member";
          return (
            <div key={m.membershipId} className="member-card">
              <div className="member-card-avatar">
                {m.user?.avatarUrl ? (
                  <img src={m.user.avatarUrl} alt={m.user.name} />
                ) : (
                  <span>{m.user?.name ? m.user.name[0] : "U"}</span>
                )}
              </div>
              <div className="member-card-info">
                <h4>{m.user?.name}</h4>
                <p className="member-email">{m.user?.email}</p>
                <div className="member-pills-row">
                  <span className="role-tag role-emerald">{roleBadge}</span>
                  <span className="department-tag">{m.department || "General"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
