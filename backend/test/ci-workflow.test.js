import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const backendDir = path.resolve(__dirname, "..");
const frontendDir = path.resolve(rootDir, "frontend");

describe("TASK-603: CI/CD Quality Gates, E2E Regression Suite & Final Release Verification", () => {
  it("REQ 1 [CI Workflow Manifest]: .github/workflows/ci.yml exists and declares all required jobs", () => {
    const ciPath = path.join(rootDir, ".github", "workflows", "ci.yml");
    assert.ok(fs.existsSync(ciPath), ".github/workflows/ci.yml must exist");

    const content = fs.readFileSync(ciPath, "utf-8");

    // Trigger specifications
    assert.match(content, /branches:\s*\[main\]/, "Must trigger on push/PR to main branch");

    // Mandatory Quality Gate Jobs
    assert.match(content, /backend-test:/, "Must declare backend-test job");
    assert.match(content, /frontend-test:/, "Must declare frontend-test job");
    assert.match(content, /docker-validation:/, "Must declare docker-validation job");
    assert.match(content, /e2e-regression:/, "Must declare e2e-regression job");
    assert.match(content, /release-gate:/, "Must declare release-gate job");

    // PostgreSQL Container Health Check in CI
    assert.match(content, /image:\s*postgres:16-alpine/, "Must declare PostgreSQL 16 Alpine service");
    assert.match(content, /--health-cmd\s*["']?pg_isready/, "Postgres service must declare pg_isready healthcheck");

    // Node.js version
    assert.match(content, /NODE_VERSION:\s*["']?22["']?|node-version:\s*(\${{\s*env\.NODE_VERSION\s*}}|["']?22["']?)/, "Must test on Node.js 22 LTS");

    // Dependency Pipeline Enforcement
    assert.match(content, /needs:\s*\[backend-test,\s*frontend-test\]/, "E2E job must require backend and frontend tests");
    assert.match(
      content,
      /needs:\s*\[backend-test,\s*frontend-test,\s*docker-validation,\s*e2e-regression\]/,
      "Release gate must depend on all four prerequisite jobs"
    );
  });

  it("REQ 2 [Playwright Configuration]: frontend/playwright.config.js declares clean environment settings", () => {
    const configPath = path.join(frontendDir, "playwright.config.js");
    assert.ok(fs.existsSync(configPath), "frontend/playwright.config.js must exist");

    const content = fs.readFileSync(configPath, "utf-8");

    assert.match(content, /testDir:\s*["']\.\/e2e["']/, "Must target ./e2e directory");
    assert.match(content, /baseURL:/, "Must declare baseURL");
    assert.match(content, /projects:\s*\[/, "Must declare browser projects");
    assert.match(content, /name:\s*["']chromium["']/, "Must support chromium desktop browser");
  });

  it("REQ 3 [Playwright E2E Suite]: frontend/e2e/release-journey.spec.js covers core user flows", () => {
    const specPath = path.join(frontendDir, "e2e", "release-journey.spec.js");
    assert.ok(fs.existsSync(specPath), "frontend/e2e/release-journey.spec.js must exist");

    const content = fs.readFileSync(specPath, "utf-8");

    // Journey verification coverage
    assert.match(content, /Journey 1.*Authentication/i, "Must verify persona authentication flow");
    assert.match(content, /Journey 2.*Reports.*CSV/i, "Must verify compliance reporting and velocity export");
    assert.match(content, /Journey 3.*Member.*Invitation/i, "Must verify member directory and invitation modal");
    assert.match(content, /Journey 4.*Kanban/i, "Must verify Kanban task boards and drawer interaction");
    assert.match(content, /Journey 5.*Storage/i, "Must verify file storage and quota overview");
  });

  it("REQ 4 [NPM Scripts & Build Targets]: Package manifests define required CI commands", () => {
    const backendPkg = JSON.parse(fs.readFileSync(path.join(backendDir, "package.json"), "utf-8"));
    const frontendPkg = JSON.parse(fs.readFileSync(path.join(frontendDir, "package.json"), "utf-8"));

    // Backend scripts
    assert.ok(backendPkg.scripts.test, "Backend must define test script");
    assert.ok(backendPkg.scripts["db:deploy"], "Backend must define db:deploy script");
    assert.ok(backendPkg.scripts["db:baseline"], "Backend must define db:baseline script");

    // Frontend scripts
    assert.ok(frontendPkg.scripts.test, "Frontend must define test script");
    assert.ok(frontendPkg.scripts.lint, "Frontend must define lint script");
    assert.ok(frontendPkg.scripts.build, "Frontend must define build script");
    assert.ok(frontendPkg.scripts["test:e2e"], "Frontend must define test:e2e script");
  });
});
