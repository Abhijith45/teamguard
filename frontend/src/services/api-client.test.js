import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage and window before importing api-client
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (i) => Array.from(storage.keys())[i] || null,
};

const dispatchedEvents = [];
globalThis.window = {
  dispatchEvent: (event) => {
    dispatchedEvents.push(event);
    return true;
  },
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

const {
  setActiveOrgId,
  getActiveOrgId,
  purgeTenantWorkspaceCache,
  clearSessionStorageAndCache,
  getQueryCacheSize,
  isQueryCacheEmpty,
} = await import("./api-client.js");

test("TASK-003 [FE REQ 1]: purgeTenantWorkspaceCache clears query cache and tenant localStorage keys", () => {
  // Setup mock state
  setActiveOrgId(1);
  localStorage.setItem("teamguard_filter_priority", "HIGH");
  localStorage.setItem("teamguard_selected_project", "42");
  localStorage.setItem("other_app_key", "keep-me");

  assert.equal(getActiveOrgId(), 1);
  assert.equal(localStorage.getItem("teamguard_filter_priority"), "HIGH");
  assert.equal(localStorage.getItem("teamguard_selected_project"), "42");

  // Trigger workspace purge for Org 2
  dispatchedEvents.length = 0;
  purgeTenantWorkspaceCache(2);

  // Verifications
  assert.equal(getActiveOrgId(), 2, "Active org ID should update to new org");
  assert.equal(localStorage.getItem("teamguard_filter_priority"), null, "Tenant filter key must be purged");
  assert.equal(localStorage.getItem("teamguard_selected_project"), null, "Tenant project key must be purged");
  assert.equal(localStorage.getItem("other_app_key"), "keep-me", "Unrelated keys must not be disturbed");
  assert.equal(isQueryCacheEmpty(), true, "Query cache must be completely empty");

  // Broadcast event check
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, "teamguard:workspace-purged");
  assert.equal(dispatchedEvents[0].detail.activeOrgId, 2);
});

test("TASK-003 [FE REQ 2]: clearSessionStorageAndCache wipes all session, auth, and query cache data", () => {
  setActiveOrgId(2);
  localStorage.setItem("teamguard_filter_priority", "MEDIUM");
  localStorage.setItem("teamguard_active_org", "2");

  dispatchedEvents.length = 0;
  clearSessionStorageAndCache();

  assert.equal(getActiveOrgId(), null, "Active org ID must be cleared");
  assert.equal(localStorage.getItem("teamguard_active_org"), null, "teamguard_active_org must be removed");
  assert.equal(localStorage.getItem("teamguard_filter_priority"), null, "teamguard_filter_priority must be removed");
  assert.equal(isQueryCacheEmpty(), true, "Query cache must be cleared");

  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, "teamguard:workspace-purged");
  assert.equal(dispatchedEvents[0].detail.activeOrgId, null);
});
