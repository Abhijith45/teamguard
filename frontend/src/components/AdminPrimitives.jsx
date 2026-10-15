import { useEffect } from "react";
import { Check, X } from "lucide-react";

export function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading">
    <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
    {action}
  </div>;
}

export function Notice({ notice, dismiss }) {
  if (!notice) return null;
  return <div className={`notice notice-${notice.type}`} role="status">
    <span>{notice.message}</span>
    <button className="icon-button" onClick={dismiss} aria-label="Dismiss"><X size={15} /></button>
  </div>;
}

export function Dialog({ title, eyebrow, onClose, children, footer }) {
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <header className="dialog-header">
        <div><span className="eyebrow">{eyebrow}</span><h2 id="dialog-title">{title}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
      </header>
      <div className="dialog-body">{children}</div>
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </section>
  </div>;
}

export function AssignmentList({ title, hint, items, selected, toggle, label }) {
  return <div className="assignment-section">
    <div className="assignment-heading"><h3>{title}</h3><span>{hint}</span></div>
    <div className="checkbox-list">{items.map((item) => {
      const checked = selected.includes(item.id);
      return <label className={`checkbox-row ${checked ? "checked" : ""}`} key={item.id}>
        <input type="checkbox" checked={checked} onChange={() => toggle(item.id)} />
        <span className="fake-checkbox">{checked && <Check size={13} />}</span>
        <span className="checkbox-copy"><strong>{label(item)}</strong>{item.description && <small>{item.description}</small>}</span>
      </label>;
    })}</div>
  </div>;
}

export function MetricStat({ label, value, hint }) {
  return <div className="stat-block"><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong><small>{hint}</small></div>;
}
