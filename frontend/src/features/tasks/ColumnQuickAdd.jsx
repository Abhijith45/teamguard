import { useState, useRef, useEffect } from "react";
import { Plus, X, CornerDownLeft, Loader2 } from "lucide-react";
import { api } from "../../services/api-client.js";

export function ColumnQuickAdd({
  columnId,
  columnLabel,
  projectId,
  projects = [],
  disabled = false,
  onTaskCreated,
  onShowNotice,
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  if (disabled) return null;

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setIsAdding(false);
      return;
    }

    // Determine target project ID
    let targetProjId = projectId;
    if (!targetProjId || targetProjId === "ALL") {
      const activeProjects = projects.filter((p) => !p.isArchived);
      targetProjId = activeProjects[0]?.id || projects[0]?.id;
    }

    if (!targetProjId) {
      if (onShowNotice) {
        onShowNotice({
          type: "error",
          message: "Please create or select an active project first.",
        });
      }
      setIsAdding(false);
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.createTask({
        title: trimmed,
        projectId: Number(targetProjId),
        status: columnId,
        priority,
      });

      const created = res.task || res;
      if (onTaskCreated) {
        onTaskCreated(created);
      }
      setTitle("");
      setIsAdding(false);
      if (onShowNotice) {
        onShowNotice({
          type: "success",
          message: `Created task "${trimmed}" in ${columnLabel}.`,
        });
      }
    } catch (err) {
      if (onShowNotice) {
        onShowNotice({
          type: "error",
          message: `Failed to create task: ${err.message}`,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTitle("");
      setIsAdding(false);
    }
  }

  if (!isAdding) {
    return (
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        className="column-quick-add-btn"
        data-testid={`column-quick-add-btn-${columnId.toLowerCase()}`}
      >
        <Plus size={14} />
        <span>+ Add Task</span>
      </button>
    );
  }

  return (
    <div className="column-quick-add-card" data-testid={`column-quick-add-form-${columnId.toLowerCase()}`}>
      <input
        ref={inputRef}
        type="text"
        disabled={submitting}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What needs to be done?"
        className="column-quick-add-input"
        data-testid="column-quick-add-input"
      />

      <div className="column-quick-add-footer">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={submitting}
            className="column-quick-add-priority-select"
            data-testid="column-quick-add-priority"
          >
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <span style={{ fontSize: "11px", color: "var(--color-text-subtle)" }}>↵ Enter</span>
        </div>

        <div className="column-quick-add-actions">
          <button
            type="button"
            onClick={() => {
              setTitle("");
              setIsAdding(false);
            }}
            disabled={submitting}
            className="column-quick-add-cancel-btn"
            title="Cancel (Esc)"
          >
            <X size={14} />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting || !title.trim()}
            className="column-quick-add-submit-btn"
            data-testid="column-quick-add-submit"
          >
            {submitting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <>
                <span>Add</span>
                <CornerDownLeft size={11} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
