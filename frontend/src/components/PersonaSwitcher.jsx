import { useState } from "react";
import { ChevronDown, Shield, UserCheck } from "lucide-react";

const PERSONAS = [
  {
    id: "super-admin",
    name: "Annisa (Super Admin)",
    role: "Super Admin",
    desc: "Full access across all modules",
    badgeColor: "badge-green",
  },
  {
    id: "project-manager",
    name: "Alex (Manager)",
    role: "Project Manager",
    desc: "Manage projects, tasks, & files",
    badgeColor: "badge-blue",
  },
  {
    id: "team-member",
    name: "Sarah (Member)",
    role: "Team Member",
    desc: "Update own assigned tasks only (ABAC)",
    badgeColor: "badge-amber",
  },
  {
    id: "stakeholder",
    name: "Rizky (Stakeholder)",
    role: "Stakeholder",
    desc: "Read-only access (no edits)",
    badgeColor: "badge-purple",
  },
];

export function PersonaSwitcher({ currentRole, onSwitch, activeOrgSlug = "acme-corp" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSelect(personaId) {
    try {
      setLoading(true);
      await onSwitch(personaId, activeOrgSlug);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const current = PERSONAS.find((p) => p.role.toLowerCase() === (currentRole || "").toLowerCase()) || PERSONAS[0];

  return (
    <div className="persona-switcher-wrapper">
      <button
        type="button"
        className="persona-switcher-trigger"
        onClick={() => setOpen(!open)}
        title="Quickly test different RBAC & ABAC roles"
      >
        <span className="persona-live-indicator" />
        <Shield size={14} className="persona-icon" />
        <span className="persona-label">Persona:</span>
        <strong className="persona-active-name">{current.role}</strong>
        <ChevronDown size={14} className={`persona-chevron ${open ? "open" : ""}`} />
      </button>

      {open && (
        <>
          <div className="persona-backdrop" onClick={() => setOpen(false)} />
          <div className="persona-dropdown">
            <div className="persona-dropdown-header">
              <UserCheck size={14} />
              <span>Switch Live Test Persona</span>
            </div>
            <div className="persona-list">
              {PERSONAS.map((p) => {
                const isSelected = p.role.toLowerCase() === (currentRole || "").toLowerCase();
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`persona-item ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelect(p.id)}
                    disabled={loading}
                  >
                    <div className="persona-item-info">
                      <div className="persona-item-title">
                        <strong>{p.name}</strong>
                        {isSelected && <span className="persona-active-pill">Active</span>}
                      </div>
                      <small className="persona-item-desc">{p.desc}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
