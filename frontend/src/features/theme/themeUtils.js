/**
 * Pure utility functions for Dynamic Theme Management
 * Aligned with TeamGuard ClickUp 3.0 Enterprise Design System
 * Supports 'dark', 'light', and 'system' with persistent state & FOUC prevention.
 */

export const THEME_OPTIONS = ["dark", "light", "system"];
export const DEFAULT_THEME = "dark";
export const STORAGE_KEY = "teamguard_theme";

/**
 * Validates and normalizes raw theme input.
 *
 * @param {string} val
 * @returns {"dark" | "light" | "system"}
 */
export function sanitizeTheme(val) {
  if (val === "light" || val === "dark" || val === "system") {
    return val;
  }
  return DEFAULT_THEME;
}

/**
 * Resolves the effective rendered theme ('dark' or 'light')
 * based on user setting and system preference.
 *
 * @param {string} themeSetting - 'dark' | 'light' | 'system'
 * @param {boolean} systemPrefersDark - whether system OS prefers dark mode
 * @returns {"dark" | "light"}
 */
export function resolveEffectiveTheme(themeSetting, systemPrefersDark = true) {
  const sanitized = sanitizeTheme(themeSetting);
  if (sanitized === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return sanitized;
}

/**
 * Computes next theme for quick toggle button (Dark <-> Light).
 * If currently in dark (or system resolved to dark), toggles to light.
 * If currently in light (or system resolved to light), toggles to dark.
 *
 * @param {string} currentTheme - 'dark' | 'light' | 'system'
 * @param {"dark" | "light"} [effectiveTheme]
 * @returns {"dark" | "light"}
 */
export function getNextTheme(currentTheme, effectiveTheme = null) {
  const active = effectiveTheme || (currentTheme === "light" ? "light" : "dark");
  return active === "dark" ? "light" : "dark";
}

/**
 * Applies the effective theme and setting to the document DOM.
 *
 * @param {"dark" | "light"} effectiveTheme
 * @param {"dark" | "light" | "system"} themeSetting
 */
export function applyThemeToDOM(effectiveTheme, themeSetting = "dark") {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute("data-theme", effectiveTheme);
  root.setAttribute("data-theme-setting", themeSetting);

  // Update color-scheme meta hint
  const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaColorScheme) {
    metaColorScheme.content = effectiveTheme;
  }

  // Update theme-color meta tag for browser mobile frame
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.content = effectiveTheme === "dark" ? "#111215" : "#F8FAFC";
  }
}
