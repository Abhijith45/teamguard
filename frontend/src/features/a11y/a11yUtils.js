/**
 * Accessibility (a11y) utilities for TeamGuard
 * Standards: WCAG 2.1 AA Compliance, ARIA 1.2, Focus Trapping & Global Shortcuts
 */

export const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'area[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'iframe:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
  '[contentEditable=true]:not([tabindex="-1"])',
].join(", ");

/**
 * Returns an array of visible, focusable HTML elements within a container
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
export function getFocusableElements(container) {
  if (!container || typeof container.querySelectorAll !== "function") {
    return [];
  }

  const rawElements = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));

  return rawElements.filter((el) => {
    // Check if element or any ancestor is aria-hidden
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest && el.closest('[aria-hidden="true"]')) return false;

    // In browser runtime, check offsetParent or getClientRects to avoid hidden elements
    if (typeof el.getClientRects === "function") {
      const rects = el.getClientRects();
      if (rects.length === 0 && el.offsetParent === null && el.tagName !== "BODY") {
        return false;
      }
    }

    return true;
  });
}

/**
 * Traps Tab key navigation within a modal/drawer container
 * @param {KeyboardEvent} event
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {Function} [options.onEscape]
 * @returns {{ handled: boolean, action: string }}
 */
export function handleTrapKeyDown(event, container, options = {}) {
  if (!event) return { handled: false, action: "none" };

  if (event.key === "Escape") {
    if (typeof options.onEscape === "function") {
      event.preventDefault();
      options.onEscape();
      return { handled: true, action: "escape" };
    }
    return { handled: false, action: "escape" };
  }

  if (event.key !== "Tab") {
    return { handled: false, action: "none" };
  }

  const focusables = getFocusableElements(container);
  if (focusables.length === 0) {
    event.preventDefault();
    return { handled: true, action: "trapped-empty" };
  }

  const firstElement = focusables[0];
  const lastElement = focusables[focusables.length - 1];
  const activeElement = event.target || (typeof document !== "undefined" ? document.activeElement : null);

  if (event.shiftKey) {
    // Shift + Tab: if on first element or outside container, wrap to last
    if (activeElement === firstElement || !container.contains?.(activeElement)) {
      event.preventDefault();
      if (typeof lastElement.focus === "function") {
        lastElement.focus();
      }
      return { handled: true, action: "wrap-to-last" };
    }
  } else {
    // Tab forward: if on last element or outside container, wrap to first
    if (activeElement === lastElement || !container.contains?.(activeElement)) {
      event.preventDefault();
      if (typeof firstElement.focus === "function") {
        firstElement.focus();
      }
      return { handled: true, action: "wrap-to-first" };
    }
  }

  return { handled: false, action: "natural-tab" };
}

/**
 * Checks if target element is an interactive text input where shortcuts must be suspended
 * @param {EventTarget} target
 * @returns {boolean}
 */
export function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;

  const tagName = String(target.tagName || "").toUpperCase();
  if (tagName === "INPUT") {
    const type = String(target.type || "text").toLowerCase();
    // Non-text inputs where typing doesn't occur can allow shortcuts if appropriate
    const nonTextTypes = ["checkbox", "radio", "range", "color", "button", "submit", "reset"];
    return !nonTextTypes.includes(type);
  }
  if (tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (target.isContentEditable || target.getAttribute?.("contenteditable") === "true") {
    return true;
  }
  return false;
}

/**
 * Determines if a single-key shortcut (like 'c' or '?') should fire
 * @param {KeyboardEvent} event
 * @param {string} shortcutKey - Expected key (e.g. 'c' or '?')
 * @returns {boolean}
 */
export function shouldTriggerGlobalShortcut(event, shortcutKey) {
  if (!event || typeof event.key !== "string") return false;

  // Never fire if user is typing inside an editable field
  if (isEditableTarget(event.target)) {
    return false;
  }

  // Never trigger if Ctrl or Meta (Cmd) or Alt modifier keys are pressed
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  const inputKey = event.key.toLowerCase();
  const targetKey = String(shortcutKey).toLowerCase();

  return inputKey === targetKey;
}

/**
 * Converts 3 or 6 hex characters to [R, G, B] in [0, 255]
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  let clean = String(hex || "").replace(/^#/, "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) {
    return [0, 0, 0];
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) {
    return [0, 0, 0];
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB color component
 * @param {[number, number, number]} rgb
 * @returns {number}
 */
export function getRelativeLuminance([r, g, b]) {
  const sRGB = [r, g, b].map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Calculates contrast ratio between two hex colors (1:1 to 21:1)
 * Formula: (L1 + 0.05) / (L2 + 0.05) where L1 is lighter
 * @param {string} hex1
 * @param {string} hex2
 * @returns {number} Rounded to 2 decimal places
 */
export function calculateContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);

  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Evaluates if a contrast ratio satisfies WCAG 2.1 AA
 * Standard text requires 4.5:1, large text (>= 18pt or >= 14pt bold) requires 3.0:1
 * @param {number} ratio
 * @param {boolean} [isLargeText=false]
 * @returns {boolean}
 */
export function meetsWcagAa(ratio, isLargeText = false) {
  const minRatio = isLargeText ? 3.0 : 4.5;
  return ratio >= minRatio;
}

/**
 * Canonical catalogue of keyboard shortcuts for TeamGuard
 */
export const KEYBOARD_SHORTCUTS = [
  {
    category: "Global Navigation",
    shortcuts: [
      { keys: ["⌘ / Ctrl", "K"], description: "Open Command Palette / Universal Search" },
      { keys: ["?"], description: "Open this Keyboard Shortcuts cheat sheet" },
      { keys: ["T"], description: "Toggle Light / Dark theme mode" },
      { keys: ["Esc"], description: "Dismiss active modal, drawer, or open menu" },
      { keys: ["Tab"], description: "Move focus to next interactive element" },
      { keys: ["Shift", "Tab"], description: "Move focus to previous interactive element" },
    ],
  },
  {
    category: "Workflow & Creation",
    shortcuts: [
      { keys: ["C"], description: "Quick create new task (when focus is outside inputs)" },
      { keys: ["Enter"], description: "Execute selected command or submit focused form" },
      { keys: ["Space"], description: "Toggle checkboxes or trigger buttons" },
    ],
  },
  {
    category: "Lists & Kanban Navigation",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Navigate items in command search results" },
      { keys: ["Home", "End"], description: "Jump to first or last element in list" },
    ],
  },
];
