import React from "react";
import { Loader2 } from "lucide-react";

/**
 * Reusable animated loading view with icon and pulse animation.
 * Replaces plain "Loading content" text with modern, polished loading presentation.
 */
export function LoadingView({
  message = "Loading...",
  minHeight = "260px",
  className = "",
  compact = false,
}) {
  return (
    <div
      className={`view-loading-container ${compact ? "compact" : ""} ${className}`.trim()}
      style={{ minHeight: compact ? "120px" : minHeight }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="loading-view-spinner-wrap">
        <div className="loading-view-ring" />
        <div className="loading-view-pulse" />
        <Loader2 size={compact ? 18 : 26} className="loading-view-icon animate-spin" />
      </div>
      {message && <span className="loading-view-text">{message}</span>}
    </div>
  );
}

export default LoadingView;
