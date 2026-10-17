import React, { useState, useEffect, useCallback, useId } from "react";
import {
  MessageSquare,
  Send,
  Edit2,
  Trash2,
  Check,
  X,
  Clock,
  ShieldAlert,
  Bold,
  Italic,
  Code,
  List,
} from "lucide-react";
import { apiClient } from "../../services/api-client.js";
import {
  validateCommentContent,
  canUserModerate,
  canEditComment,
  canDeleteComment,
  formatRelativeTime,
  getRemainingEditMinutes,
} from "./commentUtils.js";
import { RichTextViewer } from "../../components/RichTextViewer.jsx";

/**
 * TaskCommentsSection Component
 *
 * Implements Module J / TASK-302:
 * - Chronological discussion feed (US-COLLAB-001 / TG-COLLAB-001)
 * - 15-minute author edit & deletion window with remaining timer badge (US-COLLAB-002)
 * - Administrative / Moderator deletion at any time (US-COLLAB-003 / TG-COLLAB-003)
 * - Project archival mutation freeze defense
 */
export function TaskCommentsSection({
  taskId,
  task = null,
  currentUser = null,
  userPermissions = [],
  userRoles = [],
  onCommentsCountChange = null,
}) {
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // New comment input
  const [newContent, setNewContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState("");

  // Edit comment state
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete confirmation state
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Time ticker to update relative timestamps and countdown timers every 30s
  const [now, setNow] = useState(Date.now());
  const uniqueId = useId();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const currentUserId = currentUser?.id ?? null;
  const isModerator = canUserModerate({
    permissions: userPermissions,
    roles: userRoles,
  });
  const isProjectArchived = Boolean(task?.project?.isArchived);

  // Fetch comments
  const loadComments = useCallback(async () => {
    if (!taskId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.getComments(taskId);
      const items = res?.comments || [];
      setComments(items);
      onCommentsCountChange?.(items.length);
    } catch (err) {
      setError(err.message || "Failed to load comments");
    } finally {
      setIsLoading(false);
    }
  }, [taskId, onCommentsCountChange]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Handle Post Comment
  const handlePostComment = async (e) => {
    e?.preventDefault();
    setValidationError("");
    if (isProjectArchived) {
      setValidationError("Cannot post comments: Project is archived.");
      return;
    }

    const val = validateCommentContent(newContent);
    if (!val.valid) {
      setValidationError(val.error);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await apiClient.createComment(taskId, { content: val.content });
      if (res?.comment) {
        const updated = [...comments, res.comment];
        setComments(updated);
        setNewContent("");
        onCommentsCountChange?.(updated.length);
      }
    } catch (err) {
      setValidationError(err.message || "Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Start Edit
  const handleStartEdit = (comment) => {
    setEditingId(comment.id);
    setEditText(comment.content);
    setValidationError("");
  };

  // Handle Cancel Edit
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setValidationError("");
  };

  // Handle Save Edit
  const handleSaveEdit = async (commentId) => {
    setValidationError("");
    const val = validateCommentContent(editText);
    if (!val.valid) {
      setValidationError(val.error);
      return;
    }

    try {
      setIsUpdating(true);
      const res = await apiClient.updateComment(taskId, commentId, { content: val.content });
      if (res?.comment) {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, ...res.comment } : c))
        );
        setEditingId(null);
        setEditText("");
      }
    } catch (err) {
      setValidationError(err.message || "Failed to update comment");
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Confirm Delete
  const handleConfirmDelete = async (commentId) => {
    try {
      setIsDeleting(true);
      await apiClient.deleteComment(taskId, commentId);
      const updated = comments.filter((c) => c.id !== commentId);
      setComments(updated);
      setDeleteTargetId(null);
      onCommentsCountChange?.(updated.length);
    } catch (err) {
      setError(err.message || "Failed to delete comment");
    } finally {
      setIsDeleting(false);
    }
  };

  // Markdown shortcut helper
  const insertFormatting = (prefix, suffix = "") => {
    const textarea = document.getElementById(`comment-input-${uniqueId}`);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = newContent.substring(start, end);
    const replacement = `${prefix}${selected || "text"}${suffix}`;
    const nextContent =
      newContent.substring(0, start) + replacement + newContent.substring(end);
    setNewContent(nextContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selected.length || 4)
      );
    }, 0);
  };

  return (
    <div className="task-comments-section" data-testid="task-comments-section">
      {/* Section Header */}
      <div className="task-comments-header">
        <div className="task-comments-title-wrap">
          <MessageSquare className="comments-header-icon" size={18} />
          <h4 className="comments-heading">Discussion & Activity</h4>
          <span className="comments-count-pill">{comments.length}</span>
        </div>
      </div>

      {/* Project Archival Banner */}
      {isProjectArchived && (
        <div className="archived-project-notice comments-archived-banner">
          <Clock size={15} />
          <span>This task's project is archived. Comment discussions are read-only.</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="comments-error-banner" role="alert">
          <ShieldAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Comments Feed List */}
      <div className="comments-feed-list" role="feed" aria-busy={isLoading}>
        {isLoading ? (
          <div className="comments-loading-skeleton">
            <div className="skeleton-comment-item shimmer" />
            <div className="skeleton-comment-item shimmer" />
          </div>
        ) : comments.length === 0 ? (
          <div className="comments-empty-state">
            <MessageSquare size={32} className="empty-icon" />
            <p className="empty-title">No comments yet</p>
            <p className="empty-subtitle">
              Start the discussion by posting technical feedback or context.
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const author = comment.author || {};
            const authorName = author.name || author.username || "Team Member";
            const initials = authorName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            const isAuthor = currentUserId && (comment.authorId === currentUserId || author.id === currentUserId);
            const canEdit = canEditComment({ comment, currentUserId, now });
            const canDelete = canDeleteComment({
              comment,
              currentUserId,
              isModerator,
              now,
            });
            const remainingMins = getRemainingEditMinutes(comment.createdAt, now);
            const isEditing = editingId === comment.id;

            return (
              <article
                key={comment.id}
                className={`comment-item-card ${isEditing ? "editing" : ""}`}
                data-testid={`comment-card-${comment.id}`}
              >
                {/* Author Avatar */}
                <div className="comment-avatar-column">
                  {author.avatarUrl ? (
                    <img
                      src={author.avatarUrl}
                      alt={authorName}
                      className="comment-author-avatar"
                    />
                  ) : (
                    <div className="comment-avatar-fallback" aria-hidden="true">
                      {initials}
                    </div>
                  )}
                </div>

                {/* Comment Body Column */}
                <div className="comment-content-column">
                  <header className="comment-header-meta">
                    <div className="author-meta-left">
                      <span className="comment-author-name">{authorName}</span>
                      {isAuthor && <span className="author-self-badge">You</span>}
                      {comment.authorId === 1 && !isAuthor && (
                        <span className="author-role-badge">Admin</span>
                      )}
                      <span className="comment-relative-time" title={comment.createdAt}>
                        {formatRelativeTime(comment.createdAt, now)}
                      </span>
                      {comment.editedAt && (
                        <span
                          className="comment-edited-indicator"
                          title={`Edited: ${new Date(comment.editedAt).toLocaleString()}`}
                        >
                          (edited)
                        </span>
                      )}
                    </div>

                    {/* Window Badge & Controls */}
                    <div className="comment-meta-actions">
                      {isAuthor && remainingMins > 0 && !isEditing && (
                        <span
                          className="edit-window-timer-badge"
                          title="15-minute author edit window remaining"
                        >
                          <Clock size={11} /> {remainingMins}m left
                        </span>
                      )}

                      {!isProjectArchived && !isEditing && (
                        <div className="comment-action-buttons">
                          {canEdit && (
                            <button
                              type="button"
                              className="comment-action-btn edit-btn"
                              onClick={() => handleStartEdit(comment)}
                              title="Edit comment (15m window)"
                              aria-label="Edit comment"
                            >
                              <Edit2 size={13} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className={`comment-action-btn delete-btn ${
                                isModerator && !isAuthor ? "mod-delete" : ""
                              }`}
                              onClick={() => setDeleteTargetId(comment.id)}
                              title={
                                isModerator && !isAuthor
                                  ? "Moderator Delete (Admin Privilege)"
                                  : "Delete comment"
                              }
                              aria-label="Delete comment"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </header>

                  {/* Inline Edit Form */}
                  {isEditing ? (
                    <div className="comment-inline-edit-box">
                      <textarea
                        className="comment-edit-textarea"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        autoFocus
                        disabled={isUpdating}
                      />
                      <div className="inline-edit-footer">
                        <span className="char-count">{editText.length}/5000</span>
                        <div className="inline-edit-btn-group">
                          <button
                            type="button"
                            className="btn-cancel-edit"
                            onClick={handleCancelEdit}
                            disabled={isUpdating}
                          >
                            <X size={13} /> Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-save-edit"
                            onClick={() => handleSaveEdit(comment.id)}
                            disabled={isUpdating || !editText.trim()}
                          >
                            <Check size={13} /> Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="comment-text-content">
                      <RichTextViewer content={comment.content} placeholder="Empty comment" />
                    </div>
                  )}

                  {/* Delete Confirmation Dialog */}
                  {deleteTargetId === comment.id && (
                    <div className="comment-delete-confirm-popover" role="dialog">
                      <p className="confirm-text">
                        {isModerator && !isAuthor
                          ? "Moderator Action: Delete this comment permanently?"
                          : "Delete your comment?"}
                      </p>
                      <div className="confirm-btn-group">
                        <button
                          type="button"
                          className="btn-confirm-cancel"
                          onClick={() => setDeleteTargetId(null)}
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-confirm-delete"
                          onClick={() => handleConfirmDelete(comment.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* New Comment Input Area */}
      {!isProjectArchived && (
        <form className="comment-composer-form" onSubmit={handlePostComment}>
          {validationError && (
            <div className="composer-validation-error" role="alert">
              <span>{validationError}</span>
            </div>
          )}

          {/* Formatting Shortcut Toolbar */}
          <div className="composer-toolbar">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => insertFormatting("**", "**")}
              title="Bold (**text**)"
              aria-label="Bold"
            >
              <Bold size={13} />
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => insertFormatting("*", "*")}
              title="Italic (*text*)"
              aria-label="Italic"
            >
              <Italic size={13} />
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => insertFormatting("`", "`")}
              title="Code snippet (`code`)"
              aria-label="Code"
            >
              <Code size={13} />
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => insertFormatting("- ")}
              title="Bullet list (- item)"
              aria-label="List"
            >
              <List size={13} />
            </button>
            <span className="toolbar-spacer" />
            <span className="composer-char-counter">{newContent.length}/5000</span>
          </div>

          {/* Textarea */}
          <div className="composer-input-row">
            <textarea
              id={`comment-input-${uniqueId}`}
              className="comment-composer-textarea"
              placeholder="Write a comment... (Enter to submit, Shift+Enter for new line)"
              value={newContent}
              onChange={(e) => {
                setNewContent(e.target.value);
                if (validationError) setValidationError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handlePostComment();
                }
              }}
              rows={2}
              maxLength={5000}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              className="comment-submit-button"
              disabled={isSubmitting || !newContent.trim()}
              title="Post comment (Enter)"
              aria-label="Post comment"
            >
              {isSubmitting ? (
                <span className="submit-spinner" />
              ) : (
                <Send size={15} />
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default TaskCommentsSection;
