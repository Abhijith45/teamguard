import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";

/**
 * ClickUp 3.0 Dynamic Theme Toggle
 *
 * Supports:
 * - Quick icon toggle button for topbar (Sun <-> Moon)
 * - Segmented 3-way control for settings / user popover (Dark / Light / System)
 */
export function ThemeToggle({ variant = "icon", showLabel = false, className = "" }) {
  const { theme, effectiveTheme, setTheme, toggleTheme } = useTheme();

  if (variant === "segmented") {
    return (
      <div
        className={`theme-segmented-group ${className}`}
        role="group"
        aria-label="Color theme selection"
      >
        <button
          type="button"
          className={`theme-segmented-btn ${theme === "dark" ? "active" : ""}`}
          onClick={() => setTheme("dark")}
          title="Force Dark Theme"
          aria-pressed={theme === "dark"}
        >
          <Moon size={13} />
          <span>Dark</span>
        </button>
        <button
          type="button"
          className={`theme-segmented-btn ${theme === "light" ? "active" : ""}`}
          onClick={() => setTheme("light")}
          title="Force Light Theme"
          aria-pressed={theme === "light"}
        >
          <Sun size={13} />
          <span>Light</span>
        </button>
        <button
          type="button"
          className={`theme-segmented-btn ${theme === "system" ? "active" : ""}`}
          onClick={() => setTheme("system")}
          title="Sync with Operating System"
          aria-pressed={theme === "system"}
        >
          <Monitor size={13} />
          <span>Auto</span>
        </button>
      </div>
    );
  }

  // Default: quick topbar icon button
  const isDark = effectiveTheme === "dark";
  const label = isDark ? "Switch to Light Theme" : "Switch to Dark Theme";

  return (
    <button
      type="button"
      className={`topbar-theme-toggle ${className}`}
      onClick={toggleTheme}
      title={`${label} (Current: ${theme})`}
      aria-label={label}
      aria-pressed={isDark}
      data-testid="theme-toggle-btn"
    >
      <div className={`theme-toggle-icon-wrap ${isDark ? "is-dark" : "is-light"}`}>
        {isDark ? (
          <Moon size={15} className="theme-icon-moon" />
        ) : (
          <Sun size={15} className="theme-icon-sun" />
        )}
      </div>
      {showLabel && (
        <span className="theme-toggle-label">
          {isDark ? "Dark Theme" : "Light Theme"}
        </span>
      )}
    </button>
  );
}
