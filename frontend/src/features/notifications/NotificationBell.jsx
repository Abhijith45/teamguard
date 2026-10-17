import React, { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { api } from "../../services/api-client.js";
import { NotificationDrawer } from "./NotificationDrawer.jsx";

export function NotificationBell({ onNavigateTask, activeOrg, onShowNotice }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const syncUnreadCount = useCallback(async () => {
    try {
      const res = await api.getUnreadNotificationCount();
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Quietly ignore network/auth errors for topbar badge
    }
  }, []);

  useEffect(() => {
    syncUnreadCount();

    // 30s polling for background activity notifications
    const interval = setInterval(syncUnreadCount, 30000);

    // Refresh count on window focus
    const handleFocus = () => syncUnreadCount();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [syncUnreadCount]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <>
      <button
        type="button"
        className={`notification-bell-btn ${unreadCount > 0 ? "has-unread" : ""} ${isOpen ? "active" : ""}`}
        onClick={handleToggle}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "Notifications"}
        aria-label="Open notifications"
        aria-expanded={isOpen}
      >
        <Bell size={18} className="notification-bell-icon" />
        {unreadCount > 0 && (
          <span className="notification-counter-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <NotificationDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onNavigateTask={onNavigateTask}
        onNotificationChange={(count) => setUnreadCount(count)}
        activeOrg={activeOrg}
        onShowNotice={onShowNotice}
      />
    </>
  );
}
