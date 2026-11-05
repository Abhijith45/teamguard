import React from "react";
import { AlertCircle, RefreshCw, LayoutDashboard } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("TeamGuard ErrorBoundary caught render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container" style={{
          padding: "2.5rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "360px",
          textAlign: "center",
          background: "var(--bg-surface, #1e222b)",
          borderRadius: "12px",
          margin: "1.5rem auto",
          maxWidth: "600px",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          color: "var(--text-primary, #f1f5f9)",
        }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ef4444",
            marginBottom: "1rem",
          }}>
            <AlertCircle size={26} />
          </div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            {this.props.title || "Unable to display this view"}
          </h3>
          <p style={{
            fontSize: "0.85rem",
            color: "var(--text-muted, #94a3b8)",
            marginBottom: "1.25rem",
            maxWidth: "440px",
            lineHeight: "1.5"
          }}>
            {this.state.error?.message || "An unexpected error occurred while rendering this component."}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "none",
                background: "var(--primary, #059669)",
                color: "#ffffff",
                fontSize: "0.825rem",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
            {this.props.onNavigateHome && (
              <button
                type="button"
                onClick={this.props.onNavigateHome}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  background: "transparent",
                  color: "var(--text-primary, #f1f5f9)",
                  fontSize: "0.825rem",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                <LayoutDashboard size={14} />
                <span>Go to Dashboard</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
