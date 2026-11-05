import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  DEFAULT_THEME,
  STORAGE_KEY,
  sanitizeTheme,
  resolveEffectiveTheme,
  getNextTheme,
  applyThemeToDOM,
} from "../features/theme/themeUtils.js";

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  effectiveTheme: DEFAULT_THEME,
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return sanitizeTheme(stored);
      } catch {
        // Ignore localStorage block
      }
    }
    return DEFAULT_THEME;
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });

  const effectiveTheme = resolveEffectiveTheme(theme, systemPrefersDark);

  // Apply to DOM whenever effectiveTheme or theme changes
  useEffect(() => {
    applyThemeToDOM(effectiveTheme, theme);
  }, [effectiveTheme, theme]);

  // Listen to OS prefers-color-scheme changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      setSystemPrefersDark(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // Listen to cross-tab storage changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setThemeState(sanitizeTheme(e.newValue));
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTheme = useCallback((newTheme) => {
    const sanitized = sanitizeTheme(newTheme);
    setThemeState(sanitized);
    try {
      localStorage.setItem(STORAGE_KEY, sanitized);
    } catch {
      // Ignore storage error
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = getNextTheme(theme, effectiveTheme);
    setTheme(next);
  }, [theme, effectiveTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
