import React, { useState } from "react";
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import { calculateSubtaskStats } from "./subtaskUtils.js";

export { calculateSubtaskStats };

export function SubtaskChecklist({
  taskId,
  initialSubtasks = [],
  canEdit = false,
  isArchived = false,
  onSubtasksChange,
}) {
  const [subtasks, setSubtasks] = useState(initialSubtasks || []);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [error, setError] = useState(null);

  // Sync state if initialSubtasks changes from parent
  React.useEffect(() => {
    if (initialSubtasks) {
      setSubtasks(initialSubtasks);
    }
  }, [initialSubtasks]);

  const stats = calculateSubtaskStats(subtasks);

  const notifyChange = (updated) => {
    setSubtasks(updated);
    if (onSubtasksChange) {
      const newStats = calculateSubtaskStats(updated);
      onSubtasksChange(updated, newStats);
    }
  };

  const handleAddSubtask = async (e) => {
    if (e) e.preventDefault();
    if (!canEdit || isArchived || adding) return;

    const trimmed = newTitle.trim();
    if (!trimmed) return;
    if (trimmed.length > 200) {
      setError("Title cannot exceed 200 characters");
      return;
    }

    setAdding(true);
    setError(null);

    try {
      const res = await api.createSubtask(taskId, { title: trimmed });
      const created = res.subtask;
      const updated = [...subtasks, created].sort((a, b) => a.order - b.order);
      notifyChange(updated);
      setNewTitle("");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.data?.error ||
        err.message ||
        "Failed to add subtask";
      setError(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (subtask) => {
    if (!canEdit || isArchived || loadingId === subtask.id) return;

    setLoadingId(subtask.id);
    setError(null);

    // Optimistic toggle
    const nextCompleted = !subtask.isCompleted;
    const optimisticallyUpdated = subtasks.map((s) =>
      s.id === subtask.id ? { ...s, isCompleted: nextCompleted } : s
    );
    notifyChange(optimisticallyUpdated);

    try {
      const res = await api.updateSubtask(taskId, subtask.id, {
        isCompleted: nextCompleted,
      });
      // Confirm with server response
      const serverUpdated = subtasks.map((s) =>
        s.id === subtask.id ? res.subtask : s
      );
      notifyChange(serverUpdated);
    } catch (err) {
      // Revert on error
      const reverted = subtasks.map((s) =>
        s.id === subtask.id ? { ...s, isCompleted: subtask.isCompleted } : s
      );
      notifyChange(reverted);
      const msg =
        err.response?.data?.error ||
        err.data?.error ||
        err.message ||
        "Failed to update subtask";
      setError(msg);
    } finally {
      setLoadingId(null);
    }
  };

  const handleStartEdit = (subtask) => {
    if (!canEdit || isArchived) return;
    setEditingId(subtask.id);
    setEditingTitle(subtask.title);
    setError(null);
  };

  const handleSaveEdit = async (subtaskId) => {
    if (!canEdit || isArchived) return;
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setError("Title cannot be empty");
      return;
    }
    if (trimmed.length > 200) {
      setError("Title cannot exceed 200 characters");
      return;
    }

    setLoadingId(subtaskId);
    setError(null);

    try {
      const res = await api.updateSubtask(taskId, subtaskId, { title: trimmed });
      const updated = subtasks.map((s) => (s.id === subtaskId ? res.subtask : s));
      notifyChange(updated);
      setEditingId(null);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.data?.error ||
        err.message ||
        "Failed to save subtask";
      setError(msg);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (subtaskId) => {
    if (!canEdit || isArchived || loadingId === subtaskId) return;

    setLoadingId(subtaskId);
    setError(null);

    try {
      await api.deleteSubtask(taskId, subtaskId);
      const updated = subtasks.filter((s) => s.id !== subtaskId);
      notifyChange(updated);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.data?.error ||
        err.message ||
        "Failed to delete subtask";
      setError(msg);
    } finally {
      setLoadingId(null);
    }
  };

  const handleMoveOrder = async (index, direction) => {
    if (!canEdit || isArchived || subtasks.length <= 1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= subtasks.length) return;

    const copy = [...subtasks];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    const subtaskIds = copy.map((s) => s.id);
    notifyChange(copy);

    try {
      const res = await api.reorderSubtasks(taskId, subtaskIds);
      if (res.subtasks) {
        notifyChange(res.subtasks);
      }
    } catch (err) {
      // Revert
      notifyChange(subtasks);
      setError("Failed to reorder subtasks");
    }
  };

  return (
    <div className="subtasks-container">
      {/* Header with Title and Progress Metrics */}
      <div className="subtasks-header">
        <div className="subtasks-title-group">
          <CheckSquare size={16} className="text-emerald" />
          <span className="subtasks-title">Checklist & Subtasks</span>
          {stats.total > 0 && stats.progress === 100 && (
            <span className="subtasks-complete-tag">✓ All Done</span>
          )}
        </div>
        <div className="subtasks-counter-badge">
          <span>
            {stats.completed} / {stats.total} ({stats.progress}%)
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="subtasks-progress-track">
        <div
          className={`subtasks-progress-fill ${
            stats.progress === 100 ? "progress-fill-complete" : ""
          }`}
          style={{ width: `${stats.progress}%` }}
        />
      </div>

      {/* Error notice */}
      {error && (
        <div className="subtasks-error-banner">
          <span>{error}</span>
          <button
            type="button"
            className="subtasks-error-dismiss"
            onClick={() => setError(null)}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Subtask Items List */}
      <div className="subtasks-list">
        {subtasks.length === 0 ? (
          <div className="subtasks-empty">
            <p>No checklist items yet. Break this task down into deliverables.</p>
          </div>
        ) : (
          subtasks.map((item, index) => {
            const isEditing = editingId === item.id;
            const isLoading = loadingId === item.id;

            return (
              <div
                key={item.id}
                className={`subtask-item ${item.isCompleted ? "subtask-completed" : ""}`}
              >
                {/* Checkbox Button */}
                <button
                  type="button"
                  className={`subtask-checkbox ${
                    item.isCompleted ? "subtask-checkbox-checked" : ""
                  }`}
                  onClick={() => handleToggle(item)}
                  disabled={!canEdit || isArchived || isLoading}
                  title={
                    !canEdit
                      ? "Requires task update permission"
                      : isArchived
                      ? "Project is archived (read-only)"
                      : item.isCompleted
                      ? "Mark incomplete"
                      : "Mark complete"
                  }
                >
                  {isLoading ? (
                    <Loader2 size={11} className="spin-fast" />
                  ) : item.isCompleted ? (
                    <Check size={12} strokeWidth={3} />
                  ) : null}
                </button>

                {/* Title or Edit Input */}
                <div className="subtask-content">
                  {isEditing ? (
                    <div className="subtask-edit-row">
                      <input
                        type="text"
                        className="subtask-edit-input"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(item.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        maxLength={200}
                      />
                      <button
                        type="button"
                        className="btn-subtask-save"
                        onClick={() => handleSaveEdit(item.id)}
                        disabled={isLoading}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-subtask-cancel"
                        onClick={() => setEditingId(null)}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      className="subtask-title-text"
                      onDoubleClick={() => handleStartEdit(item)}
                      title={canEdit && !isArchived ? "Double-click to edit" : ""}
                    >
                      {item.title}
                    </span>
                  )}
                </div>

                {/* Item Actions (Reorder & Delete) */}
                {canEdit && !isArchived && !isEditing && (
                  <div className="subtask-actions">
                    <button
                      type="button"
                      className="btn-subtask-reorder"
                      onClick={() => handleMoveOrder(index, "up")}
                      disabled={index === 0}
                      title="Move up"
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn-subtask-reorder"
                      onClick={() => handleMoveOrder(index, "down")}
                      disabled={index === subtasks.length - 1}
                      title="Move down"
                    >
                      <ChevronDown size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn-subtask-delete"
                      onClick={() => handleDelete(item.id)}
                      disabled={isLoading}
                      title="Delete subtask"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add New Item Form */}
      {canEdit && !isArchived ? (
        <div
          className="subtask-add-form"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddSubtask(e);
            }
          }}
        >
          <div className="subtask-add-input-wrapper">
            <input
              type="text"
              className="subtask-add-input"
              placeholder="Add checklist item... (press Enter)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={adding}
              maxLength={200}
            />
            {newTitle.length > 150 && (
              <span className="subtask-char-count">{newTitle.length}/200</span>
            )}
          </div>
          <button
            type="button"
            className="btn-subtask-add"
            onClick={handleAddSubtask}
            disabled={adding || !newTitle.trim()}
          >
            {adding ? (
              <Loader2 size={13} className="spin-fast" />
            ) : (
              <>
                <Plus size={13} />
                <span>Add</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="subtask-locked-notice">
          <Lock size={12} />
          <span>
            {isArchived
              ? "Project is archived — subtasks are read-only."
              : "Read-only — requires task update permissions to add or check items."}
          </span>
        </div>
      )}
    </div>
  );
}
