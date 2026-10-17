import { useEffect, useRef } from "react";
import { getFocusableElements, handleTrapKeyDown } from "../features/a11y/a11yUtils.js";

/**
 * useFocusTrap: Traps keyboard focus within an active dialog/modal/drawer
 * - Focuses initial focus element or first tabbable element on open
 * - Prevents tabbing outside the dialog boundary (wraps forward and backward)
 * - Restores focus to triggering element on unmount/close
 * - Handles Escape key dismissal
 *
 * @param {Object} params
 * @param {React.RefObject} params.containerRef - Ref pointing to the dialog container element
 * @param {boolean} [params.isOpen=true] - Whether the dialog is currently open
 * @param {React.RefObject} [params.initialFocusRef] - Optional element to receive focus on open
 * @param {Function} [params.onEscape] - Callback when user presses Escape key
 * @param {boolean} [params.returnFocus=true] - Whether to return focus to previous element on close
 */
export function useFocusTrap({
  containerRef,
  isOpen = true,
  initialFocusRef,
  onEscape,
  returnFocus = true,
}) {
  const previousActiveElementRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore upon close
    if (typeof document !== "undefined") {
      previousActiveElementRef.current = document.activeElement;
    }

    const timer = setTimeout(() => {
      const container = containerRef?.current;
      if (!container) return;

      if (initialFocusRef?.current && typeof initialFocusRef.current.focus === "function") {
        initialFocusRef.current.focus();
      } else {
        const focusables = getFocusableElements(container);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else if (typeof container.focus === "function") {
          // If container has no focusables, make it focusable to avoid lost focus
          if (!container.hasAttribute("tabindex")) {
            container.setAttribute("tabindex", "-1");
          }
          container.focus();
        }
      }
    }, 16);

    function handleKeyDown(e) {
      const container = containerRef?.current;
      if (!container) return;
      handleTrapKeyDown(e, container, { onEscape });
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);

      // Return focus to previous active element
      if (
        returnFocus &&
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === "function" &&
        typeof document !== "undefined" &&
        document.body.contains(previousActiveElementRef.current)
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, containerRef, initialFocusRef, onEscape, returnFocus]);
}
