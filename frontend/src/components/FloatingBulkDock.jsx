import React from "react";
import { Copy, Trash2, X } from "lucide-react";

/**
 * TeamGuard FloatingBulkDock Component (TASK-405 / US-FILE-002)
 * Renders an accessible floating dock at the bottom of the viewport
 * when one or more file assets are selected.
 */
export function FloatingBulkDock({
  selectedCount,
  onDuplicate,
  onDelete,
  onClear,
  canDuplicate = true,
  canDelete = true,
  submitting = false,
}) {
  if (!selectedCount || selectedCount <= 0) return null;

  return (
    <div
      className="floating-bulk-bar"
      role="toolbar"
      aria-label="Bulk file actions toolbar"
    >
      <div className="bulk-bar-count">
        <strong>{selectedCount}</strong> {selectedCount === 1 ? "file" : "files"} selected
      </div>

      <div className="bulk-bar-divider" />

      <button
        type="button"
        className="bulk-action-btn"
        onClick={onDuplicate}
        disabled={submitting || !canDuplicate}
        title={!canDuplicate ? "RBAC Denial: Requires files:update" : "Duplicate selected files ((Copy) suffix)"}
        aria-label={`Duplicate ${selectedCount} selected files`}
      >
        <Copy size={15} />
        <span>Duplicate</span>
      </button>

      <button
        type="button"
        className="bulk-action-btn bulk-btn-delete"
        onClick={onDelete}
        disabled={submitting || !canDelete}
        title={!canDelete ? "RBAC Denial: Requires files:delete" : "Delete selected files permanently"}
        aria-label={`Delete ${selectedCount} selected files`}
      >
        <Trash2 size={15} />
        <span>Delete</span>
      </button>

      <button
        type="button"
        className="bulk-bar-close"
        onClick={onClear}
        title="Clear selection (Esc)"
        aria-label="Clear file selection"
      >
        <X size={16} />
      </button>
    </div>
  );
}
