import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  Mail,
  Sliders,
  Check,
  RotateCcw,
  X,
  Loader2,
  ShieldAlert,
  Calendar,
  MessageSquare,
  FolderGit2,
  Clock,
  Sparkles,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import {
  DEFAULT_PREFERENCES,
  DIGEST_OPTIONS,
  ALERT_SUBSCRIPTION_ITEMS,
  sanitizePreferences,
  isPreferencesDirty,
  getSubscriptionSummary,
} from "./notificationPreferencesUtils.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

const ICON_MAP = {
  notifyTaskAssigned: ShieldAlert,
  notifyDueSoon: Clock,
  notifyTaskStatusChanged: Sparkles,
  notifyCommentAdded: MessageSquare,
  notifyProjectArchived: FolderGit2,
};

export function NotificationPreferencesModal({ isOpen, onClose, activeOrg, onShowNotice }) {
  const modalRef = useRef(null);

  useFocusTrap({
    containerRef: modalRef,
    isOpen,
    onEscape: () => {
      if (!saving) onClose();
    },
  });

  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [original, setOriginal] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setSavedSuccess(false);
        const res = await api.getNotificationPreferences();
        if (mounted && res?.preferences) {
          const sanitized = sanitizePreferences(res.preferences);
          setPreferences(sanitized);
          setOriginal(sanitized);
        }
      } catch (err) {
        console.error("Failed to load notification preferences", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isDirty = isPreferencesDirty(original, preferences);
  const summary = getSubscriptionSummary(preferences);

  const handleToggle = (key) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setSavedSuccess(false);
  };

  const handleDigestChange = (digestId) => {
    setPreferences((prev) => ({
      ...prev,
      emailDigest: digestId,
    }));
    setSavedSuccess(false);
  };

  const handleResetDefaults = () => {
    setPreferences({ ...DEFAULT_PREFERENCES });
    setSavedSuccess(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await api.updateNotificationPreferences(preferences);
      if (res?.preferences) {
        const sanitized = sanitizePreferences(res.preferences);
        setPreferences(sanitized);
        setOriginal(sanitized);
      }
      setSavedSuccess(true);
      if (onShowNotice) {
        onShowNotice({
          type: "success",
          message: "Notification & alert preferences saved successfully.",
        });
      }
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      console.error("Failed to save preferences", err);
      if (onShowNotice) {
        onShowNotice({
          type: "error",
          message: err.message || "Failed to save preferences",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="notif-pref-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="notif-pref-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-pref-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="notif-pref-header">
          <div className="notif-pref-brand">
            <div className="notif-pref-icon-box">
              <Sliders size={20} className="text-emerald" />
            </div>
            <div>
              <h2 id="notif-pref-title" className="notif-pref-title">
                Alert & Notification Preferences
              </h2>
              <span className="notif-pref-subtitle">
                Configure event dispatching and email digests for {activeOrg?.name || "your workspace"}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="notif-pref-close-btn"
            onClick={onClose}
            aria-label="Close preferences"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="notif-pref-body">
          {loading ? (
            <div className="notif-pref-loading">
              <Loader2 size={24} className="spin text-emerald" />
              <span>Loading alert preferences…</span>
            </div>
          ) : (
            <>
              {/* Summary Banner */}
              <div className="notif-pref-summary-card">
                <div className="notif-pref-summary-item">
                  <span className="summary-label">Active Channels</span>
                  <strong className="summary-value text-emerald">
                    {summary.activeCount} of {summary.totalChannels} Enabled
                  </strong>
                </div>
                <div className="notif-pref-summary-item">
                  <span className="summary-label">Email Digest</span>
                  <strong className="summary-value">
                    {DIGEST_OPTIONS.find((o) => o.id === preferences.emailDigest)?.label || "Daily Digest"}
                  </strong>
                </div>
              </div>

              {/* 1. Email Digest Schedule */}
              <div className="notif-pref-section">
                <div className="section-header-row">
                  <Mail size={16} className="text-blue" />
                  <div>
                    <h3 className="section-title">Email Digest Schedule</h3>
                    <p className="section-desc">
                      Choose how frequently TeamGuard summarizes workspace milestone and task events to your inbox.
                    </p>
                  </div>
                </div>

                <div className="digest-options-grid">
                  {DIGEST_OPTIONS.map((opt) => {
                    const isSelected = preferences.emailDigest === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`digest-option-card ${isSelected ? "selected" : ""}`}
                        onClick={() => handleDigestChange(opt.id)}
                      >
                        <div className="digest-card-radio">
                          <span className={`radio-indicator ${isSelected ? "active" : ""}`} />
                        </div>
                        <div className="digest-card-content">
                          <strong className="digest-label">{opt.label}</strong>
                          <span className="digest-desc">{opt.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. In-App Alert Subscriptions */}
              <div className="notif-pref-section">
                <div className="section-header-row">
                  <Bell size={16} className="text-emerald" />
                  <div>
                    <h3 className="section-title">In-App Event Subscriptions</h3>
                    <p className="section-desc">
                      Select which workspace lifecycle and activity events generate real-time alerts in your notification drawer.
                    </p>
                  </div>
                </div>

                <div className="subscriptions-list">
                  {ALERT_SUBSCRIPTION_ITEMS.map((item) => {
                    const isEnabled = Boolean(preferences[item.key]);
                    const IconComponent = ICON_MAP[item.key] || Bell;
                    return (
                      <div
                        key={item.key}
                        className={`subscription-item ${isEnabled ? "enabled" : "disabled"}`}
                        onClick={() => handleToggle(item.key)}
                      >
                        <div className="subscription-icon-box">
                          <IconComponent size={16} />
                        </div>
                        <div className="subscription-info">
                          <strong className="sub-title">{item.title}</strong>
                          <p className="sub-desc">{item.description}</p>
                        </div>
                        <div className="subscription-toggle">
                          <label className="switch" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => handleToggle(item.key)}
                            />
                            <span className="slider round" />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="notif-pref-footer">
          <button
            type="button"
            className="notif-btn-ghost"
            onClick={handleResetDefaults}
            disabled={saving || loading}
            title="Reset to default settings"
          >
            <RotateCcw size={14} />
            <span>Reset Defaults</span>
          </button>

          <div className="footer-actions-right">
            <button
              type="button"
              className="notif-btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`notif-btn-primary ${savedSuccess ? "saved" : ""}`}
              onClick={handleSave}
              disabled={saving || loading || !isDirty}
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>Saving…</span>
                </>
              ) : savedSuccess ? (
                <>
                  <Check size={15} />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Preferences</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
