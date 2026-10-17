import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCompletionRate,
  formatLeadTimeDays,
  generateExportFilename,
  buildExportQueryParams,
  canExportReport,
} from "./reportsUtils.js";

describe("TASK-507 [Frontend]: Compliance & Velocity Reporting Utilities", () => {
  test("FE REQ 1 [Completion Rate]: Accurately calculates rounded percentage", () => {
    assert.equal(calculateCompletionRate(0, 10), 0);
    assert.equal(calculateCompletionRate(5, 10), 50);
    assert.equal(calculateCompletionRate(1, 3), 33.3);
    assert.equal(calculateCompletionRate(10, 10), 100);
    assert.equal(calculateCompletionRate(0, 0), 0);
  });

  test("FE REQ 2 [Lead Time Formatting]: Formats duration into human-readable string", () => {
    assert.equal(formatLeadTimeDays(null), "—");
    assert.equal(formatLeadTimeDays(undefined), "—");
    assert.equal(formatLeadTimeDays(0), "0.0 days");
    assert.equal(formatLeadTimeDays(3.456), "3.5 days");
  });

  test("FE REQ 3 [Filename Generation]: Normalizes slug and prefixes report type", () => {
    const filename = generateExportFilename("velocity", "Acme Corp!");
    assert.ok(filename.startsWith("teamguard-velocity-acme-corp-"));
    assert.ok(filename.endsWith(".csv"));
  });

  test("FE REQ 4 [Query Param Normalization]: Packages valid filter properties", () => {
    const params = buildExportQueryParams({
      projectId: 12,
      action: "TASK:CREATE",
      from: "2026-01-01",
      emptyField: undefined,
    });
    assert.equal(params.projectId, "12");
    assert.equal(params.action, "TASK:CREATE");
    assert.equal(params.from, "2026-01-01");
    assert.equal(params.emptyField, undefined);
  });

  test("FE REQ 5 [Permission Checks]: Accurately evaluates report export permissions", () => {
    // 1. User with explicit report:export can export all
    assert.equal(canExportReport(new Set(["report:export"]), "velocity"), true);
    assert.equal(canExportReport(new Set(["report:export"]), "audit"), true);

    // 2. Project Manager with task:export or dashboard:export can export velocity
    assert.equal(canExportReport(new Set(["task:export"]), "velocity"), true);
    assert.equal(canExportReport(new Set(["dashboard:export"]), "velocity"), true);
    assert.equal(canExportReport(new Set(["task:export"]), "audit"), false);

    // 3. User with audit:read can export audit
    assert.equal(canExportReport(new Set(["audit:read"]), "audit"), true);
    assert.equal(canExportReport(new Set(["audit:read"]), "velocity"), false);

    // 4. Stakeholder (Viewer) cannot export either
    const viewerPerms = new Set(["dashboard:view", "project:view", "task:view", "files:view"]);
    assert.equal(canExportReport(viewerPerms, "velocity"), false);
    assert.equal(canExportReport(viewerPerms, "audit"), false);
  });
});
