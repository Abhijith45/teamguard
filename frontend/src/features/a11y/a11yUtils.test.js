import test from "node:test";
import assert from "node:assert/strict";
import {
  hexToRgb,
  getRelativeLuminance,
  calculateContrastRatio,
  meetsWcagAa,
  isEditableTarget,
  shouldTriggerGlobalShortcut,
  getFocusableElements,
  handleTrapKeyDown,
  KEYBOARD_SHORTCUTS,
} from "./a11yUtils.js";

test("TASK-404 [US-A11Y-003 / Contrast]: Color contrast ratio and luminance math", () => {
  // Test black on white
  assert.equal(calculateContrastRatio("#000000", "#FFFFFF"), 21);
  assert.equal(calculateContrastRatio("#FFFFFF", "#FFFFFF"), 1);

  // Test 3-char shorthand
  assert.equal(calculateContrastRatio("#000", "#FFF"), 21);

  // Test TeamGuard brand tokens
  const bodyTextOnBg = calculateContrastRatio("#0F172A", "#F8FAFC");
  assert.ok(bodyTextOnBg > 15, `Body text contrast ratio ${bodyTextOnBg} must be > 15`);
  assert.equal(meetsWcagAa(bodyTextOnBg), true);

  const primaryOnWhite = calculateContrastRatio("#0A5C36", "#FFFFFF");
  assert.ok(primaryOnWhite > 7, `Primary green contrast ${primaryOnWhite} must be > 7`);
  assert.equal(meetsWcagAa(primaryOnWhite), true);

  const mutedTextOnWhite = calculateContrastRatio("#475569", "#FFFFFF");
  assert.ok(mutedTextOnWhite >= 4.5, `Muted text contrast ${mutedTextOnWhite} must be >= 4.5`);
  assert.equal(meetsWcagAa(mutedTextOnWhite), true);

  const urgentRedOnWhite = calculateContrastRatio("#B91C1C", "#FFFFFF");
  assert.ok(urgentRedOnWhite >= 4.5, `Urgent red contrast ${urgentRedOnWhite} must be >= 4.5`);
  assert.equal(meetsWcagAa(urgentRedOnWhite), true);
});

test("TASK-404 [US-A11Y-003 / Contrast]: meetsWcagAa threshold boundaries", () => {
  assert.equal(meetsWcagAa(4.5), true);
  assert.equal(meetsWcagAa(4.49), false);

  // Large text requires 3.0:1
  assert.equal(meetsWcagAa(3.0, true), true);
  assert.equal(meetsWcagAa(2.99, true), false);
});

test("TASK-404 [US-A11Y-002 / Shortcuts]: isEditableTarget detects text inputs accurately", () => {
  assert.equal(isEditableTarget(null), false);
  assert.equal(isEditableTarget({}), false);
  assert.equal(isEditableTarget({ tagName: "BODY" }), false);
  assert.equal(isEditableTarget({ tagName: "BUTTON" }), false);
  assert.equal(isEditableTarget({ tagName: "DIV" }), false);

  // Textual inputs where typing occurs
  assert.equal(isEditableTarget({ tagName: "INPUT", type: "text" }), true);
  assert.equal(isEditableTarget({ tagName: "INPUT", type: "search" }), true);
  assert.equal(isEditableTarget({ tagName: "INPUT", type: "email" }), true);
  assert.equal(isEditableTarget({ tagName: "INPUT", type: "password" }), true);
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: "DIV", getAttribute: (k) => (k === "contenteditable" ? "true" : null) }), true);

  // Non-textual inputs
  assert.equal(isEditableTarget({ tagName: "INPUT", type: "checkbox" }), false);
  assert.equal(isEditableTarget({ tagName: "INPUT", type: "radio" }), false);
  assert.equal(isEditableTarget({ tagName: "INPUT", type: "button" }), false);
});

test("TASK-404 [US-A11Y-002 / Shortcuts]: shouldTriggerGlobalShortcut guards single-key commands", () => {
  // Shortcut 'c' on body without modifiers triggers
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "c", target: { tagName: "BODY" } }, "c"),
    true
  );
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "C", target: { tagName: "BODY" } }, "c"),
    true
  );

  // Shortcut '?' triggers
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "?", target: { tagName: "BUTTON" } }, "?"),
    true
  );

  // Suppressed when focus is inside an input or textarea
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "c", target: { tagName: "INPUT", type: "text" } }, "c"),
    false
  );
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "c", target: { tagName: "TEXTAREA" } }, "c"),
    false
  );

  // Suppressed when Ctrl or Meta (Cmd) or Alt modifier keys are active
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "c", ctrlKey: true, target: { tagName: "BODY" } }, "c"),
    false
  );
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "c", metaKey: true, target: { tagName: "BODY" } }, "c"),
    false
  );
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "c", altKey: true, target: { tagName: "BODY" } }, "c"),
    false
  );

  // Unmatched key
  assert.equal(
    shouldTriggerGlobalShortcut({ key: "x", target: { tagName: "BODY" } }, "c"),
    false
  );
});

test("TASK-404 [US-A11Y-002 / Focus]: getFocusableElements extracts and filters candidates", () => {
  const elements = [
    { tagName: "BUTTON", getAttribute: () => null },
    { tagName: "INPUT", getAttribute: () => null },
    { tagName: "BUTTON", getAttribute: (k) => (k === "aria-hidden" ? "true" : null) }, // filtered
    { tagName: "A", getAttribute: () => null },
  ];

  const mockContainer = {
    querySelectorAll: (selector) => elements,
  };

  const results = getFocusableElements(mockContainer);
  assert.equal(results.length, 3, "Filters out aria-hidden=true element");
  assert.equal(results[0].tagName, "BUTTON");
  assert.equal(results[1].tagName, "INPUT");
  assert.equal(results[2].tagName, "A");
});

test("TASK-404 [US-A11Y-001 / US-A11Y-003]: handleTrapKeyDown handles Tab wrapping and Escape dismissal", () => {
  let escaped = false;
  const onEscape = () => {
    escaped = true;
  };

  // 1. Escape key
  const escapeEvent = {
    key: "Escape",
    preventDefault: () => {},
  };
  const resEscape = handleTrapKeyDown(escapeEvent, null, { onEscape });
  assert.equal(resEscape.handled, true);
  assert.equal(resEscape.action, "escape");
  assert.equal(escaped, true);

  // 2. Tab wrapping forward from last to first
  let focusedElement = null;
  const btn1 = {
    tagName: "BUTTON",
    getAttribute: () => null,
    focus: () => {
      focusedElement = "btn1";
    },
  };
  const btn2 = {
    tagName: "BUTTON",
    getAttribute: () => null,
    focus: () => {
      focusedElement = "btn2";
    },
  };

  const container = {
    querySelectorAll: () => [btn1, btn2],
    contains: (el) => el === btn1 || el === btn2,
  };

  let prevented = false;
  const tabForwardEvent = {
    key: "Tab",
    shiftKey: false,
    target: btn2, // on last element
    preventDefault: () => {
      prevented = true;
    },
  };

  const resTabForward = handleTrapKeyDown(tabForwardEvent, container);
  assert.equal(resTabForward.handled, true);
  assert.equal(resTabForward.action, "wrap-to-first");
  assert.equal(prevented, true);
  assert.equal(focusedElement, "btn1", "Focus wrapped back to first interactive element");

  // 3. Shift + Tab wrapping backward from first to last
  prevented = false;
  focusedElement = null;
  const tabBackwardEvent = {
    key: "Tab",
    shiftKey: true,
    target: btn1, // on first element
    preventDefault: () => {
      prevented = true;
    },
  };

  const resTabBackward = handleTrapKeyDown(tabBackwardEvent, container);
  assert.equal(resTabBackward.handled, true);
  assert.equal(resTabBackward.action, "wrap-to-last");
  assert.equal(prevented, true);
  assert.equal(focusedElement, "btn2", "Shift+Tab wrapped back to last interactive element");
});

test("TASK-404: KEYBOARD_SHORTCUTS static catalogue is well-formed", () => {
  assert.ok(Array.isArray(KEYBOARD_SHORTCUTS));
  assert.ok(KEYBOARD_SHORTCUTS.length >= 3);

  for (const cat of KEYBOARD_SHORTCUTS) {
    assert.ok(cat.category, "Category has title");
    assert.ok(Array.isArray(cat.shortcuts), "Category has shortcuts list");
    for (const sc of cat.shortcuts) {
      assert.ok(Array.isArray(sc.keys) && sc.keys.length > 0, "Shortcut has keys array");
      assert.ok(typeof sc.description === "string" && sc.description.length > 0, "Shortcut has description");
    }
  }
});
