import React, { useRef } from "react";
import { Keyboard, X, Sparkles } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "./a11yUtils.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

export function KeyboardShortcutsModal({ isOpen, onClose }) {
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);

  useFocusTrap({
    containerRef: modalRef,
    isOpen,
    initialFocusRef: closeBtnRef,
    onEscape: onClose,
  });

  if (!isOpen) return null;

  return (
    <div
      className="shortcuts-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="shortcuts-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shortcuts-modal-header">
          <div className="shortcuts-modal-brand">
            <div className="shortcuts-icon-box">
              <Keyboard size={20} className="text-emerald" />
            </div>
            <div>
              <h2 id="shortcuts-modal-title" className="shortcuts-modal-title">
                Keyboard Shortcuts & Navigation
              </h2>
              <span className="shortcuts-modal-subtitle">
                Boost productivity with instant global accessibility commands
              </span>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="shortcuts-modal-close-btn"
            onClick={onClose}
            aria-label="Close keyboard shortcuts modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="shortcuts-modal-body">
          <div className="shortcuts-categories-grid">
            {KEYBOARD_SHORTCUTS.map((category) => (
              <div key={category.category} className="shortcuts-category-card">
                <h3 className="shortcuts-category-title">{category.category}</h3>
                <div className="shortcuts-list">
                  {category.shortcuts.map((sc, i) => (
                    <div key={i} className="shortcut-row">
                      <span className="shortcut-desc">{sc.description}</span>
                      <div className="shortcut-keys-cluster">
                        {sc.keys.map((k, ki) => (
                          <React.Fragment key={ki}>
                            <kbd className="shortcut-kbd">{k}</kbd>
                            {ki < sc.keys.length - 1 && <span className="shortcut-plus">+</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="shortcuts-footer-note">
            <Sparkles size={14} className="text-emerald" />
            <span>
              Tip: Press <kbd className="shortcut-kbd">?</kbd> at any time from anywhere in TeamGuard to open this reference.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
