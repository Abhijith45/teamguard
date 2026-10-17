import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  MessageSquare,
  RefreshCw,
  Trash2,
  UserCheck,
  CheckSquare,
  X,
  ExternalLink,
  Sliders,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import {
  formatNotificationTime,
  getNotificationMeta,
  filterNotifications,
} from "./notificationUtils.js";
import { NotificationPreferencesModal } from "./NotificationPreferencesModal.jsx";

export function NotificationDrawer({
  isOpen,
  onClose,
  onNavigateTask,
  onNotificationChange,
  activeOrg,
  onShowNotice,
}) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "unread"
  const [actionInProgress, setActionInProgress] = useState(null);
  const [showPreferences, setShowPreferences] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getNotifications({ limit: 50 });
      setNotifications(res.notifications || []);
      setTotal(res.total || 0);
      setUnreadCount(res.unreadCount || 0);
      if (onNotificationChange) {
        onNotificationChange(res.unreadCount || 0);
      }
    } catch (err) {
      setError(err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [onNotificationChange]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleMarkAsRead = async (e, id) => {
    e.stopPropagation();
    try {
      setActionInProgress(id);
      await api.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      if (onNotificationChange) {
        onNotificationChange(Math.max(0, unreadCount - 1));
      }
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setActionInProgress("all");
      await api.markAllNotificationsAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      if (onNotificationChange) {
        onNotificationChange(0);
      }
    } catch (err) {
      console.error("Failed to mark all notifications as read", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      setActionInProgress(id);
      const target = notifications.find((n) => n.id === id);
      await api.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (target && !target.isRead) {
        const nextUnread = Math.max(0, unreadCount - 1);
        setUnreadCount(nextUnread);
        if (onNotificationChange) {
          onNotificationChange(nextUnread);
        }
      }
    } catch (err) {
      console.error("Failed to delete notification", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleClearRead = async () => {
    try {
      setActionInProgress("clear-read");
      await api.clearReadNotifications();
      setNotifications((prev) => prev.filter((n) => !n.isRead));
      setTotal(unreadCount);
    } catch (err) {
      console.error("Failed to clear read notifications", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleItemClick = (item) => {
    if (!item.isRead) {
      api.markNotificationAsRead(item.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      const nextUnread = Math.max(0, unreadCount - 1);
      setUnreadCount(nextUnread);
      if (onNotificationChange) {
        onNotificationChange(nextUnread);
      }
    }

    if (item.resourceType === "task" && item.resourceId) {
      if (onNavigateTask) {
        onNavigateTask(item.resourceId);
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  const filtered = filterNotifications(notifications, activeTab);
  const hasReadNotifications = notifications.some((n) => n.isRead);

  return (
    <>
      <div className="notification-drawer-backdrop" onClick={onClose} />
      <aside className="notification-drawer" role="dialog" aria-label="Notifications Panel">
        {/* Header */}
        <div className="notification-drawer-header">
          <div className="notification-header-title-row">
            <div className="notification-header-brand">
              <div className="notification-header-icon-bubble">
                <Bell size={18} className="notification-header-icon" />
              </div>
              <div className="notification-header-text">
                <h2 className="notification-header-title">Notifications</h2>
                <span className="notification-header-subtitle">
                  Workspace activity & dispatch pipeline
                </span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="notification-drawer-settings-btn"
                onClick={() => setShowPreferences(true)}
                title="Alert & Notification Preferences"
                aria-label="Notification Preferences"
              >
                <Sliders size={16} />
              </button>
              <button
                type="button"
                className="notification-drawer-close-btn"
                onClick={onClose}
                aria-label="Close notifications panel"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="notification-header-actions-bar">
            <div className="notification-filter-pills">
              <button
                type="button"
                className={`notif-pill-btn ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                All
                <span className="notif-pill-count">{notifications.length}</span>
              </button>
              <button
                type="button"
                className={`notif-pill-btn ${activeTab === "unread" ? "active" : ""}`}
                onClick={() => setActiveTab("unread")}
              >
                Unread
                {unreadCount > 0 && (
                  <span className="notif-pill-count unread-glow">{unreadCount}</span>
                )}
              </button>
            </div>

            <div className="notification-bulk-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-action-text-btn"
                  onClick={handleMarkAllAsRead}
                  disabled={actionInProgress === "all"}
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span>Mark all read</span>
                </button>
              )}
              {hasReadNotifications && (
                <button
                  type="button"
                  className="notif-action-text-btn text-muted"
                  onClick={handleClearRead}
                  disabled={actionInProgress === "clear-read"}
                  title="Clear all read notifications"
                >
                  <Trash2 size={13} />
                  <span>Clear read</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="notification-drawer-body">
          {loading && notifications.length === 0 ? (
            <div className="notification-loading-state">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p>Fetching notifications...</p>
            </div>
          ) : error ? (
            <div className="notification-error-state">
              <p>{error}</p>
              <button type="button" className="notif-retry-btn" onClick={fetchNotifications}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="notification-empty-state">
              <div className="notification-empty-icon-wrap">
                <BellOff size={36} className="text-muted" />
              </div>
              <h3>{activeTab === "unread" ? "All caught up!" : "No notifications yet"}</h3>
              <p>
                {activeTab === "unread"
                  ? "You have zero unread notifications in this workspace."
                  : "When teammates assign tasks, comment, or update statuses, alerts appear here."}
              </p>
            </div>
          ) : (
            <div className="notification-list">
              {filtered.map((item) => {
                const meta = getNotificationMeta(item.type);
                return (
                  <div
                    key={item.id}
                    className={`notification-card ${item.isRead ? "read" : "unread"}`}
                    onClick={() => handleItemClick(item)}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Actor Avatar / Icon Bubble */}
                    <div className="notification-avatar-col">
                      {item.actor?.avatarUrl ? (
                        <img
                          src={item.actor.avatarUrl}
                          alt={item.actor.name || "Actor"}
                          className="notification-actor-avatar"
                        />
                      ) : (
                        <div className="notification-actor-initials">
                          {item.actor?.name ? item.actor.name[0].toUpperCase() : "T"}
                        </div>
                      )}
                      <span
                        className="notification-type-badge-mini"
                        style={{ backgroundColor: meta.color }}
                        title={meta.label}
                      >
                        {item.type === "TASK_ASSIGNED" && <UserCheck size={9} />}
                        {item.type === "TASK_STATUS_CHANGED" && <RefreshCw size={9} />}
                        {item.type === "COMMENT_ADDED" && <MessageSquare size={9} />}
                        {item.type === "SUBTASK_COMPLETED" && <CheckSquare size={9} />}
                        {!["TASK_ASSIGNED", "TASK_STATUS_CHANGED", "COMMENT_ADDED", "SUBTASK_COMPLETED"].includes(item.type) && (
                          <Bell size={9} />
                        )}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="notification-content-col">
                      <div className="notification-meta-row">
                        <span
                          className="notification-category-pill"
                          style={{ color: meta.color, backgroundColor: meta.bg }}
                        >
                          {meta.label}
                        </span>
                        <span className="notification-timestamp">
                          <Clock size={11} className="inline-clock" />
                          {formatNotificationTime(item.createdAt)}
                        </span>
                      </div>

                      <div className="notification-title-line">
                        <strong className="notification-title">{item.title}</strong>
                        {!item.isRead && <span className="notification-unread-dot" />}
                      </div>

                      <p className="notification-message-snippet">{item.message}</p>

                      {item.resourceType === "task" && (
                        <div className="notification-action-link">
                          <span>View task details</span>
                          <ChevronRight size={13} />
                        </div>
                      )}
                    </div>

                    {/* Quick Item Actions */}
                    <div className="notification-item-actions">
                      {!item.isRead && (
                        <button
                          type="button"
                          className="notif-item-btn check-btn"
                          title="Mark as read"
                          onClick={(e) => handleMarkAsRead(e, item.id)}
                          disabled={actionInProgress === item.id}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="notif-item-btn delete-btn"
                        title="Dismiss notification"
                        onClick={(e) => handleDelete(e, item.id)}
                        disabled={actionInProgress === item.id}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="notification-drawer-footer">
          <div className="notif-footer-summary">
            <span>
              {unreadCount} unread of {total} total
            </span>
          </div>
          <button
            type="button"
            className="notif-refresh-btn"
            onClick={fetchNotifications}
            disabled={loading}
            title="Refresh notifications"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Sync</span>
          </button>
        </div>
      </aside>

      {/* Preferences Modal (TASK-403 / US-NOTIF-003) */}
      <NotificationPreferencesModal
        isOpen={showPreferences}
        onClose={() => setShowPreferences(false)}
        activeOrg={activeOrg}
        onShowNotice={onShowNotice}
      />
    </>
  );
}
