import React from "react";
import { AlertTriangle, Calendar, CheckCircle2, Clock } from "lucide-react";
import { getDueDateStatus } from "./dueDateUtils.js";

export function DueDateBadge({ dueDate, status, compact = false }) {
  const info = getDueDateStatus(dueDate, status);

  if (info.type === "none") {
    return (
      <span className="due-badge due-badge-none" title="No due date specified">
        <Calendar size={11} className="due-icon" />
        <span>—</span>
      </span>
    );
  }

  return (
    <span
      className={`due-badge due-badge-${info.type}`}
      title={info.label}
      data-testid={`due-badge-${info.type}`}
    >
      {info.type === "overdue" && <AlertTriangle size={12} className="due-icon" />}
      {info.type === "soon" && <Clock size={12} className="due-icon" />}
      {info.type === "future" && <Calendar size={12} className="due-icon" />}
      {info.type === "completed" && <CheckCircle2 size={12} className="due-icon" />}
      <span>{compact ? info.shortLabel : info.shortLabel}</span>
    </span>
  );
}
