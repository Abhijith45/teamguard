import test from "node:test";
import assert from "node:assert/strict";
import {
  THEME_OPTIONS,
  DEFAULT_THEME,
  sanitizeTheme,
  resolveEffectiveTheme,
  getNextTheme,
} from "./themeUtils.js";

test("TASK-701 [Theme Utils]: Options and default configuration", () => {
  assert.deepEqual(THEME_OPTIONS, ["dark", "light", "system"]);
  assert.equal(DEFAULT_THEME, "dark");
});

test("TASK-701 [Theme Utils]: sanitizeTheme validates valid and invalid inputs", () => {
  assert.equal(sanitizeTheme("dark"), "dark");
  assert.equal(sanitizeTheme("light"), "light");
  assert.equal(sanitizeTheme("system"), "system");
  assert.equal(sanitizeTheme(null), "dark");
  assert.equal(sanitizeTheme(undefined), "dark");
  assert.equal(sanitizeTheme("unknown-custom"), "dark");
  assert.equal(sanitizeTheme(""), "dark");
});

test("TASK-701 [Theme Utils]: resolveEffectiveTheme resolves explicit and system preferences", () => {
  // Explicit overrides ignore system setting
  assert.equal(resolveEffectiveTheme("dark", false), "dark");
  assert.equal(resolveEffectiveTheme("dark", true), "dark");
  assert.equal(resolveEffectiveTheme("light", true), "light");
  assert.equal(resolveEffectiveTheme("light", false), "light");

  // System follows systemPrefersDark boolean
  assert.equal(resolveEffectiveTheme("system", true), "dark");
  assert.equal(resolveEffectiveTheme("system", false), "light");

  // Invalid fallbacks to default dark
  assert.equal(resolveEffectiveTheme("invalid", true), "dark");
});

test("TASK-701 [Theme Utils]: getNextTheme toggles cleanly between dark and light", () => {
  assert.equal(getNextTheme("dark"), "light");
  assert.equal(getNextTheme("light"), "dark");
  assert.equal(getNextTheme("system", "dark"), "light");
  assert.equal(getNextTheme("system", "light"), "dark");
});
