import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Filter,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  MessageSquare,
  AlertCircle,
  FileEdit,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import {
  filterActivities,
  formatRelativeTime,
  getActivityBadgeColor,
  groupActivitiesByDate,
} from "./activityUtils.js";

/**
 * TaskActivityStream
 * Interactive chronological audit history timeline for a specific task.
 * Renders in the slide-over drawer with filtering, search, and details inspection.
 */
export default function TaskActivityStream({ taskId, onActivityCountChange }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDetails, setExpandedDetails] = useState({});

  const fetchActivity = useCallback(async (isRefresh = false) => {
    if (!taskId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.getTaskActivity(taskId);
      const items = res.data?.data || res.data || [];
      setActivities(items);
      if (onActivityCountChange) {
        onActivityCountChange(items.length);
      }
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.data?.error ||
        err.message ||
        "Failed to load task activity timeline";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId, onActivityCountChange]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const toggleDetails = (id) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getActionIcon = (category) => {
    switch (category) {
      case "creation":
        return <PlusCircle size={14} className="text-emerald" />;
      case "update":
        return <FileEdit size={14} className="text-blue" />;
      case "checklist":
        return <CheckCircle2 size={14} className="text-purple" />;
      case "comment":
        return <MessageSquare size={14} className="text-amber" />;
      case "deletion":
        return <Trash2 size={14} className="text-rose" />;
      case "governance":
        return <ShieldCheck size={14} className="text-indigo" />;
      default:
        return <Clock size={14} className="text-slate" />;
    }
  };

  const filteredItems = filterActivities(activities, activeTab, searchQuery);
  const groupedItems = groupActivitiesByDate(filteredItems);

  return (
    <div className="task-activity-stream" data-testid="task-activity-stream">
      {/* Top Toolbar: Filters, Search & Refresh */}
      <div className="activity-toolbar">
        <div className="activity-tabs">
          <button
            type="button"
            className={`activity-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All <span className="tab-count">{activities.length}</span>
          </button>
          <button
            type="button"
            className={`activity-tab ${activeTab === "updates" ? "active" : ""}`}
            onClick={() => setActiveTab("updates")}
          >
            Updates
          </button>
          <button
            type="button"
            className={`activity-tab ${activeTab === "checklist" ? "active" : ""}`}
            onClick={() => setActiveTab("checklist")}
          >
            Checklist
          </button>
          <button
            type="button"
            className={`activity-tab ${activeTab === "comments" ? "active" : ""}`}
            onClick={() => setActiveTab("comments")}
          >
            Comments
          </button>
        </div>

        <div className="activity-toolbar-actions">
          <button
            type="button"
            className="btn-refresh-icon"
            onClick={() => fetchActivity(true)}
            disabled={refreshing || loading}
            title="Refresh activity timeline"
          >
            <RefreshCw size={13} className={refreshing ? "spin-icon" : ""} />
          </button>
        </div>
      </div>

      {/* Search Filter Input */}
      <div className="activity-search-wrap">
        <Search size={13} className="search-icon-inside" />
        <input
          type="text"
          className="activity-search-input"
          placeholder="Filter events by actor, summary, or attribute..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="btn-clear-search"
            onClick={() => setSearchQuery("")}
          >
            ×
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="activity-error-banner">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button type="button" onClick={() => fetchActivity(false)}>Retry</button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="activity-loading-state">
          <RefreshCw size={20} className="spin-icon text-muted" />
          <p>Loading activity history...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredItems.length === 0 && (
        <div className="activity-empty-state">
          <Clock size={28} className="text-muted" />
          <p className="empty-title">
            {searchQuery || activeTab !== "all"
              ? "No matching events found"
              : "No activity recorded yet"}
          </p>
          <p className="empty-subtitle">
            {searchQuery || activeTab !== "all"
              ? "Try adjusting your tab filter or search query."
              : "Task modifications, checklist changes, and discussion will appear here."}
          </p>
        </div>
      )}

      {/* Grouped Chronological Timeline */}
      {!loading && filteredItems.length > 0 && (
        <div className="timeline-container">
          {Object.entries(groupedItems).map(([dateGroup, items]) => (
            <div key={dateGroup} className="timeline-date-group">
              <div className="timeline-date-header">
                <span>{dateGroup}</span>
                <span className="date-group-line" />
              </div>

              <div className="timeline-items-list">
                {items.map((act) => {
                  const badge = getActivityBadgeColor(act.category);
                  const isExpanded = !!expandedDetails[act.id];
                  const hasDetails =
                    act.details &&
                    typeof act.details === "object" &&
                    Object.keys(act.details).length > 0;

                  return (
                    <div key={act.id} className="timeline-item" data-testid={`activity-item-${act.id}`}>
                      {/* Timeline Node & Connector */}
                      <div className="timeline-node">
                        <div
                          className="node-icon-circle"
                          style={{
                            background: badge.bg,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {getActionIcon(act.category)}
                        </div>
                        <div className="node-line" />
                      </div>

                      {/* Timeline Event Content */}
                      <div className="timeline-content">
                        <div className="timeline-item-header">
                          <div className="timeline-actor-info">
                            {act.actor?.avatarUrl ? (
                              <img
                                src={act.actor.avatarUrl}
                                alt={act.actor.name || "Actor"}
                                className="timeline-actor-avatar"
                              />
                            ) : (
                              <div className="timeline-actor-initials">
                                {(act.actor?.name || "U").slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="timeline-actor-name">
                              {act.actor?.name || act.actor?.username || "System"}
                            </span>
                          </div>

                          <div className="timeline-meta-right">
                            <span
                              className="timeline-badge"
                              style={{
                                background: badge.bg,
                                color: badge.text,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              {badge.label}
                            </span>
                            <span className="timeline-time" title={new Date(act.createdAt).toLocaleString()}>
                              {formatRelativeTime(act.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Event Summary */}
                        <div className="timeline-summary">
                          <span>{act.summary}</span>
                        </div>

                        {/* Expandable Technical Details (Diffs, JSON Payload) */}
                        {hasDetails && (
                          <div className="timeline-details-wrapper">
                            <button
                              type="button"
                              className="btn-toggle-details"
                              onClick={() => toggleDetails(act.id)}
                            >
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              <span>{isExpanded ? "Hide Details" : "View Details"}</span>
                            </button>

                            {isExpanded && (
                              <pre className="timeline-details-pre">
                                {JSON.stringify(act.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
