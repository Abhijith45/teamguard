import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFERENCES,
  DIGEST_OPTIONS,
  ALERT_SUBSCRIPTION_ITEMS,
  sanitizePreferences,
  isPreferencesDirty,
  getSubscriptionSummary,
} from "./notificationPreferencesUtils.js";

test("TASK-403 [US-NOTIF-003 / Preferences]: DEFAULT_PREFERENCES and options structure", () => {
  assert.equal(DEFAULT_PREFERENCES.emailDigest, "DAILY");
  assert.equal(DEFAULT_PREFERENCES.notifyTaskAssigned, true);
  assert.equal(DEFAULT_PREFERENCES.notifyDueSoon, true);

  assert.equal(DIGEST_OPTIONS.length, 4);
  assert.equal(ALERT_SUBSCRIPTION_ITEMS.length, 5);
});

test("TASK-403 [US-NOTIF-003 / Preferences]: sanitizePreferences normalizes invalid or partial inputs", () => {
  const result = sanitizePreferences({
    emailDigest: "INVALID_SCHEDULE",
    notifyTaskAssigned: false,
  });

  assert.equal(result.emailDigest, "DAILY", "Falls back to DAILY if invalid");
  assert.equal(result.notifyTaskAssigned, false);
  assert.equal(result.notifyDueSoon, true, "Preserves defaults for unspecified fields");
});

test("TASK-403 [US-NOTIF-003 / Preferences]: isPreferencesDirty detects state modifications", () => {
  const base = { ...DEFAULT_PREFERENCES };
  const same = { ...DEFAULT_PREFERENCES };
  const modified = { ...DEFAULT_PREFERENCES, emailDigest: "WEEKLY" };

  assert.equal(isPreferencesDirty(base, same), false);
  assert.equal(isPreferencesDirty(base, modified), true);
});

test("TASK-403 [US-NOTIF-003 / Preferences]: getSubscriptionSummary aggregates enabled count", () => {
  const summaryAll = getSubscriptionSummary(DEFAULT_PREFERENCES);
  assert.equal(summaryAll.activeCount, 5);
  assert.equal(summaryAll.isEmailMuted, false);

  const muted = getSubscriptionSummary({
    ...DEFAULT_PREFERENCES,
    emailDigest: "OFF",
    notifyDueSoon: false,
    notifyCommentAdded: false,
  });

  assert.equal(muted.activeCount, 3);
  assert.equal(muted.isEmailMuted, true);
});
