# TeamGuard Production Release Readiness Checklist

---

## Section 1 — Document Control & Release Governance

| Metadata Field | Value |
| :--- | :--- |
| **Document Title** | TeamGuard Production Release Readiness Checklist |
| **Document Identifier** | `TG-REL-v1.2.0` |
| **Target Path** | [docs/planning/teamguard-release-checklist.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-release-checklist.md) |
| **Document Version** | `1.2.0-draft` |
| **Document Status** | Engineering Planning Draft — Pending Requirements and Decision Ratification |
| **Last Updated** | 2026-10-14 |
| **Requirements Source** | [.agents/rules/teamguard-product-specs.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-product-specs.md) (`v1.1.0-draft`) |
| **Security Standards** | [.agents/rules/teamguard-rbac.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-rbac.md) |
| **User Stories Baseline** | [docs/product/teamguard-user-stories.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md) (`TG-USC-v1.0.1-revised`) |
| **Decision Register** | [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md) |
| **Master Development Plan** | [docs/planning/teamguard-development-plan.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-development-plan.md) |
| **Story Traceability Matrix** | [docs/planning/teamguard-story-traceability.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-story-traceability.md) |
| **Author / Custodians** | Principal Software Architect, Security Engineer, QA Lead |

---

## Section 2 — Executive Release Gates & Two-Track Scope

### 2.1 Release-Critical Invariants (RCG)
A candidate build cannot be promoted to production without 100% verification across all applicable **Release-Critical Gates (RCG)**:

```
┌────────────────────────────────────────────────────────┐
│               RELEASE-CRITICAL GATES (RCG)             │
├──────────────────────────┬─────────────────────────────┤
│ RCG-1: Tenant Isolation  │ 100% fail-closed isolation  │
│ RCG-2: Server RBAC/ABAC  │ Zero client-side authority  │
│ RCG-3: Real-Time Deriv.  │ Immediate effect on revoke  │
│ RCG-4: Lockout Guards    │ Super Admin / Owner locked  │
│ RCG-5: Auth Hygiene      │ Rotation, reuse det., purge │
│ RCG-6: Test Automation   │ 100% suite pass, zero skips │
│ RCG-7: Auditable Evidence│ Rigorous 4-tier verification │
└──────────────────────────┴─────────────────────────────┘
```

### 2.2 Two-Track Release Scope & Gate Applicability
To eliminate logical contradictions between unresolved architectural decisions and production readiness:
- **Track A (Core v1.0 Production Release)**:
  - Scope: Exactly **68 Core Stories** (34 Verified in Repository + 2 Partially Implemented + 32 Planned Implementation) across Phases 0–4 and Phase 6.
  - Applicable Security Gates: **SEC-01 through SEC-10** are **MANDATORY**. All must pass with `TIER-2` (Test Verified) or higher.
  - **Excluded / Deferred Gates**: `SEC-11` (Invitation Identity Matching) and `SEC-12` (Break-Glass Safeguards) belong strictly to Track B. Because invitation and platform administration endpoints are physically unmounted and disabled in Track A, they are **classified as planned deferrals pending a formal stakeholder release waiver** (`[STATUS: PENDING]`). The waiver must record: approver name, approval date, excluded story/feature scope, and evidence reference. Zero unverified code paths exist in Track A.
- **Track B (Enterprise Expansion Release Post-v1.0)**:
  - Scope: Exactly **11 Blocked Stories** quarantined in Phase 5.
  - Activated only after decisions UD-001 through UD-005 are formally ratified. Gates `SEC-11` and `SEC-12` become mandatory invariants for Track B promotion.

### 2.3 Four-Tier Evidence Verification Standard
To prevent ungrounded claims of production readiness, every checklist status must cite a specific evidence tier:
- **TIER-1: `CODE_INSPECTED`**: Mechanism exists in static source code or configuration files, but has not yet been executed in automated tests or deployed environments.
- **TIER-2: `TEST_VERIFIED`**: Passing automated unit, integration, or negative test execution evidence exists in the repository (`backend/test/rbac.test.js`).
- **TIER-3: `RUNTIME_VERIFIED`**: Verified operational in active development runtime environment (localhost:5000 API / localhost:5173 frontend).
- **TIER-4: `PROD_VERIFIED`**: Verified against deployed production infrastructure, secret vaults, TLS certificates, and real cloud providers.

---

## Section 3 — Comprehensive Release Verification Checklist

---

### Category 1: Security & Multi-Tenant Isolation (Release-Critical)

| Check ID | Verification Requirement | Objective Acceptance Criterion | Verification Method / Evidence | Track A Status & Evidence Tier | Sign-off Role |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **SEC-01** | Strict Tenant Header Requirement | All protected routes require `x-organization-id`. Missing header returns `HTTP 400 Bad Request`. Legacy silent fallback is completely eliminated. | Automated API test with missing header asserting 400. | **PENDING REMEDIATION (Phase 0: TASK-001)** | Security Lead |
| **SEC-02** | Membership Verification Across All Endpoints | Any request presenting an `x-organization-id` where caller lacks an `ACTIVE` membership returns `HTTP 403 Forbidden` across all endpoints (tasks, projects, members, roles, files, audit). | Tested in `backend/test/rbac.test.js` (Test #5); comprehensive surface test planned in Phase 0. | **PARTIAL (`TIER-2`: Test #5 passes one membership check; full endpoint surface test pending Phase 0 `TASK-006`)** | Security Lead |
| **SEC-03** | Server-Authoritative RBAC & ABAC Matrix | 100% of mutation and query authorization checks are enforced server-side against an explicit endpoint/permission test matrix (`POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, `POST /projects`, `PATCH /roles`). | Direct curl/API invocation bypassing UI controls. | **PARTIAL (`TIER-2`: Core matrix verified for 5 endpoints; comprehensive negative-test expansion across all mutation endpoints pending Phase 0–2 `TASK-006`)** | Architect |
| **SEC-04** | Dynamic Permission Derivation | Permissions are derived dynamically per-request in `resolveTenant` from database relations. Toggling permissions takes immediate effect on the very next incoming request without re-login. | Tested in `backend/test/rbac.test.js` (Test #3). | **VERIFIED (`TIER-2`)** | Architect |
| **SEC-05** | Super Admin Lockout Prevention | The system role `Super Admin` cannot have its permissions revoked (`HTTP 403`). Last Owner of an org cannot be removed or deactivated. | Tested in `backend/test/rbac.test.js` (Test #6). | **VERIFIED (`TIER-2`)** | Security Lead |
| **SEC-06** | Universal Privilege Delegation Guard | An administrator cannot create a custom role or assign permissions that the administrator does not personally possess. | Negative integration test asserting 403 on delegation breach. | **PLANNED (Phase 1: TASK-104)** | Security Lead |
| **SEC-07** | Task Protected Fields Invariant | Updating a task under `task:update:own` strictly prohibits altering `projectId`, `creatorId`, or `assigneeId` across all payload shapes, casing, and query params. | Negative integration tests covering body, casing, prototype keys, and query params. | **PENDING REMEDIATION (Phase 0: TASK-002)** | QA Lead |
| **SEC-08** | Uniform Credential Rejection | `POST /api/auth/login` returns identical `HTTP 401 Unauthorized` for non-existent email, wrong password, or inactive account. Zero enumeration. | Tested in `backend/test/rbac.test.js` (Test #1). | **VERIFIED (`TIER-2`)** | Security Lead |
| **SEC-09** | Refresh Token Rotation & Reuse Detection | Every refresh rotates token. Replay of an already-used token invalidates the entire session family (`revokedAt = now()`) and returns `HTTP 401`. | `token.service.js` implementation inspected; automated reuse replay test planned in Phase 0. | **PARTIAL (`TIER-1` Code Inspected; Automated Replay Test Pending Phase 0)** | Security Lead |
| **SEC-10** | Session Data & Cache Purge on Logout | `POST /api/auth/logout` sets `revokedAt = now()`, clears HttpOnly cookie, and client wipes in-memory token, React Query cache, and localStorage keys. | Browser DevTools session inspection post-logout. | **VERIFIED (`TIER-3`)** | QA Lead |
| **SEC-11** | Invitation Identity Matching | Invitation token acceptance validates that authenticated user's email matches the exact recipient email of the invitation token. | Automated test asserting 403 on mismatched recipient acceptance. | **DEFERRED TO TRACK B (Decision UD-005; Feature Unmounted in Track A)** | Security Lead |
| **SEC-12** | Break-Glass Emergency Safeguards | Break-glass recovery requires MFA step-up re-prompt within 5m, formal ticket ID justification, limits session to 60m, and writes immutable audit entry. | Server-side validation of TOTP token, ticket format, and audit row creation. | **DEFERRED TO TRACK B (Decision UD-001; Feature Unmounted in Track A)** | Security Lead |

---

### Category 2: Functional Correctness & Module Verification

| Check ID | Functional Area | Verification Requirement | Evidence / Implementation Source | Track A Status & Evidence Tier | Sign-off Role |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **FUNC-01** | Public Registration | Creates User, initial Organization, active Membership, and grants Super Admin system role. | `auth.service.js:registerUser` verified in code and runtime. | **VERIFIED (`TIER-3`)** | QA Lead |
| **FUNC-02** | Secondary Organization Provisioning | Authenticated user can create secondary organization and receives automatic Super Admin role. | `organizations.controller.js:createOrganization` verified. | **VERIFIED (`TIER-3`)** | QA Lead |
| **FUNC-03** | Multi-Organization Context Switching | User can list active organizations and switch active tenant context. Workspace queries adapt cleanly. | `AppShell.jsx` and `organizations.controller.js`. | **VERIFIED (`TIER-3`)** | QA Lead |
| **FUNC-04** | Live Permission Matrix Grid | Matrix displays permissions grouped by module with active checkbox states across roles. | `TeamPermissionsMatrixView.jsx` active in frontend runtime. | **VERIFIED (`TIER-3`)** | QA Lead |
| **FUNC-05** | Real-Time Permission Toggling | Discrete checkbox toggle updates relational database and enforces immediately. | Test #3 in `backend/test/rbac.test.js`. | **VERIFIED (`TIER-2`)** | QA Lead |
| **FUNC-06** | ABAC Task Lock Hinting | Kanban task cards show visual lock icon and disable drag handles when user lacks edit permissions. | Test #4 in `backend/test/rbac.test.js` & `KanbanBoardView.jsx`. | **VERIFIED (`TIER-2`, `TIER-3`)** | QA Lead |
| **FUNC-07** | Project CRUD & Wizard | Projects can be listed, created via 5-step wizard, updated, and deleted within tenant scope. | `projects.controller.js` & `ProjectSetupWizardModal.jsx`. | **VERIFIED (`TIER-3`)** | QA Lead |
| **FUNC-08** | Custom Project Keys | Custom alphanumeric project key (2–10 chars) auto-generated and constrained to tenant uniqueness. | Code specification planned in Phase 2 (`TASK-202`). | **PLANNED (Phase 2)** | Architect |
| **FUNC-09** | 4-Column Kanban Board | Columns: TODO, IN_PROGRESS, REVIEW, DONE; filter chips for priority; status transitions. | `KanbanBoardView.jsx` operational in frontend runtime. | **VERIFIED (`TIER-3`)** | QA Lead |
| **FUNC-10** | Slide-Over Task Detail Drawer | Slide-over drawer opens on card click; displays title, description, subtasks, comments, activity log. | Currently modal dialog; slide-over drawer planned in Phase 2 (`TASK-204`). | **PLANNED (Phase 2)** | QA Lead |
| **FUNC-11** | Multi-View Representation | Tasks accessible via List and Table views with shared filter and search state. | Views planned in Phase 2 (`TASK-205`). | **PLANNED (Phase 2)** | QA Lead |
| **FUNC-12** | Subtask Checklist Progress | Subtask items support CRUD and checkbox toggles; task calculates fractional completion progress. | Relational model and endpoints planned in Phase 3 (`TASK-301`). | **PLANNED (Phase 3)** | QA Lead |
| **FUNC-13** | Task Comments & 15m Edit Window | Chronological comment feed; authors can edit/delete comments within 15 minutes; admin moderation. | Schema model and endpoints planned in Phase 3 (`TASK-302`). | **PLANNED (Phase 3)** | QA Lead |
| **FUNC-14** | File Asset Metadata & Bulk Actions | File asset listing, project tagging, multi-row selection, floating bulk action dock (duplicate/delete). | `FilesBulkView.jsx` & `files.controller.js` planned in `TASK-405`; existing `files.controller.js` provides basic listing only. | **PARTIAL (`TIER-3`: Basic file listing verified; bulk-action dock and full metadata view planned in `TASK-405`)** | QA Lead |
| **FUNC-15** | Dashboard KPI Metrics & Heatmap | Stat cards (Projects, Tasks, Members, Storage), project progress bars, priority chart, activity heatmap. | `DashboardView.jsx` & `dashboard.controller.js`. | **VERIFIED (`TIER-3`)** | QA Lead |
| **FUNC-16** | Workspace Release Calendar | Monthly/weekly calendar grid mapping tasks by due date; drag adjustment of due dates. | Calendar grid planned in Phase 4 (`TASK-402`). | **PLANNED (Phase 4)** | QA Lead |
| **FUNC-17** | In-App Notification Center | Bell icon with unread badge counter; popover notification feed; mark-as-read and deep linking. | Notification center planned in Phase 4 (`TASK-403`). | **PLANNED (Phase 4)** | QA Lead |
| **FUNC-18** | Global Command Palette | `Cmd/Ctrl+K` launches multi-entity search across projects, tasks, and members with keyboard selection. | Command palette planned in Phase 4 (`TASK-401`). | **PLANNED (Phase 4)** | QA Lead |
| **FUNC-19** | Accessibility & Focus Trapping | Visible `:focus-visible` rings, semantic landmarks, WCAG AA 4.5:1 contrast, modal `Esc` dismissal. | `index.css` focus rings & Esc verified; focus trap planned in `TASK-404`. | **PARTIAL (`TIER-3`: Focus styles verified; Focus trap planned)** | QA Lead |
| **FUNC-20** | Demo Persona Switcher Guard | 1-click persona switching enabled only in development; completely disabled when `NODE_ENV=production`. | Test #1 in `backend/test/rbac.test.js` & `demo.controller.js`. | **VERIFIED (`TIER-2`)** | Security Lead |

---

### Category 3: Automated Testing & Verification Suite

| Check ID | Test Scope | Verification Requirement | Execution Command / Evidence | Track A Status & Evidence Tier | Sign-off Role |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **TEST-01** | RBAC/ABAC Automated Suite | 100% pass on core RBAC/ABAC tests (Persona switch, dashboard access, negative PM test, ABAC lock, tenant isolation, Super Admin guard). | `npm test` in `backend/` executes 6/6 passing tests. | **VERIFIED (`TIER-2`: 6/6 Pass)** | QA Lead |
| **TEST-02** | Multi-Tenant Header Scoping Suite | Integration tests verifying explicit `x-organization-id` requirement, missing header rejection (400), and unverified membership rejection (403). | Test suite planned in Phase 0 (`TASK-006`). | **PLANNED (Phase 0)** | QA Lead |
| **TEST-03** | Auth & Session Hardening Suite | Unit & integration tests for password hashing, login enumeration defense, token refresh rotation, reuse revocation, and logout purge. | Test suite planned in Phase 0 (`TASK-005`, `TASK-006`). | **PLANNED (Phase 0)** | QA Lead |
| **TEST-04** | Project & Task Lifecycle Suite | API tests covering project keys, automated progress calculation, task status transitions, subtasks, and comments. | Test suites planned in Phase 2 & 3. | **PLANNED (Phase 2/3)** | QA Lead |
| **TEST-05** | Negative Security Permission Tests | Negative authorization tests asserting 403 on every mutation endpoint for roles lacking requisite permissions across various payload shapes. | Planned across Phases 0–4. | **PLANNED (Phase 0–4)** | Security Lead |
| **TEST-06** | End-to-End User Journey Tests | End-to-end browser tests for critical path: register -> create project -> create task -> move card -> assign -> logout. | End-to-end suite planned in Phase 6 (`TASK-603`). | **PLANNED (Phase 6)** | QA Lead |

---

### Category 4: Database, Migrations & Data Integrity

| Check ID | Database Area | Verification Requirement | Evidence / Migration File | Track A Status & Evidence Tier | Sign-off Role |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **DB-01** | Migration Consistency | Prisma migrations are synchronized with `schema.prisma` (12 models). No uncommitted schema drift or pending migrations. | Verified against `prisma/migrations/20261013000000_rbac_init`. Target staging migration verification planned in `TASK-601`. | **TEST_VERIFIED (`TIER-2`: Local diff clean; Target Staging DB Migration Execution PENDING Phase 6)** | Architect |
| **DB-02** | Foreign Key Cascade Integrity | Organization deletion cascades to memberships, roles, projects, tasks, files, audit logs. Task assignee deletion sets `assigneeId = null`. | Verified in Prisma schema directives (`onDelete: Cascade`, `SetNull`). | **VERIFIED (`TIER-1`)** | Architect |
| **DB-03** | Multi-Tenant Scoping Indexes | Crucial queries have composite or single-column indexes on `organizationId` (`Membership`, `Project`, `Task`, `FileAsset`, `AuditLog`). | Verified in `schema.prisma` index definitions (`@@index([organizationId])`). | **VERIFIED (`TIER-1`)** | Architect |
| **DB-04** | Unique Constraints Enforcement | Unique indexes verified for `User.email`, `User.username`, `Organization.slug`, `Membership(userId, organizationId)`, `Role(organizationId, name)`. | Verified in `schema.prisma` unique definitions. | **VERIFIED (`TIER-1`)** | Architect |
| **DB-05** | Seed Data Alignment | Database seed script (`prisma/seed.js`) provisions all standard system roles, permissions, and test organizations cleanly without conflict. | Verified execution via `npx prisma db seed`. | **VERIFIED (`TIER-2`)** | Architect |
| **DB-06** | Append-Only Audit Trail | `AuditLog` records cannot be updated or deleted via application endpoints. | Verified in `audit.service.js` (insert only; no update/delete methods). | **VERIFIED (`TIER-1`)** | Security Lead |

---

### Category 5: Deployment, Infrastructure & Operational Readiness

| Check ID | Operational Area | Verification Requirement | Evidence / Target Configuration | Track A Status & Evidence Tier | Sign-off Role |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **OPS-01** | Secret Management | Production secrets loaded via cloud secret vault (AWS Secrets Manager / Doppler / Infisical); zero secrets in repo. | `.gitignore` excludes `.env`. Production secret vault injection PENDING deployment. | **CODE_INSPECTED (`TIER-1`: Vault PENDING Phase 6)** | Security Lead |
| **OPS-02** | CORS & Trusted Origins | Production CORS configured strictly to `FRONTEND_ORIGIN` with credentials enabled; wildcards (`*`) strictly prohibited. | `app.js` binds CORS to environment origin; production domain binding PENDING. | **CODE_INSPECTED (`TIER-1`: Prod Binding PENDING)** | Security Lead |
| **OPS-03** | Cookie Security Configuration | Refresh token cookie set with `HttpOnly: true`, `SameSite: "lax"`, `Secure: true` in production, `Path: "/api/auth"`. | `auth.controller.js` sets `secure: process.env.NODE_ENV === 'production'`. | **CODE_INSPECTED (`TIER-1`: TLS Binding PENDING)** | Security Lead |
| **OPS-04** | Security Headers (Helmet) | Production backend protected by `helmet` with CSP, HSTS, frameguard, and referrer policy. | Baseline implementation planned in Phase 0 (`TASK-004`). | **PLANNED (Phase 0: TASK-004)** | Security Lead |
| **OPS-05** | Rate Limiting | Auth endpoints protected by IP and account rate limiting (`express-rate-limit`). | Middleware planned in Phase 0 (`TASK-004`). | **PLANNED (Phase 0: TASK-004)** | Security Lead |
| **OPS-06** | Health & Liveness Checks | Liveness and readiness endpoints (`GET /api/health`) reporting database connection health without exposing internal metadata. | Planned in Phase 0 (`TASK-004`). | **PLANNED (Phase 0: TASK-004)** | Architect |
| **OPS-07** | Structured Logging | Application events logged in structured JSON (timestamp, level, requestId, organizationId) with sensitive parameters redacted. | Planned in Phase 6 (`TASK-603`). | **PLANNED (Phase 6)** | Architect |
| **OPS-08** | Production Dockerization | Multi-stage Dockerfile optimizing Node.js runtime and Vite static bundle; non-root user execution (`USER node`). | Planned in Phase 6 (`TASK-602`). | **PLANNED (Phase 6)** | Architect |

---

## Section 4 — Release Sign-off Protocol & Scope Reconciliation

### 4.1 Track A (Core v1.0 Release) Sign-off Criteria
Prior to promoting a Track A release candidate to production:
1. **Core Story Completion**: All **68 Core Stories** (34 Verified in Repository + 2 Partially Implemented + 32 Planned Implementation) must be verified completed with evidence at `TIER-2` (Automated Test Pass) or higher.
2. **Mandatory Security Gates**: Checks `SEC-01` through `SEC-10` must be marked **PASS** with verified execution evidence.
3. **Formal Decision Exclusion Waiver** `[STATUS: PENDING]`: The **11 Blocked Stories** (Phase 5) and associated checks (`SEC-11`, `SEC-12`) are classified as **Post-v1.0 Deferred / Feature-Flagged Exclusions**. A formal stakeholder release waiver must be signed and recorded with: approver name, approval date, excluded story ID list, and evidence path. Until signed, these are treated as planned deferrals only.
4. The sign-off table below must be formally executed:

| Role | Designee Name | Sign-Off Date | Track A Release Status | Track B Release Status |
| :--- | :--- | :---: | :---: | :---: |
| **Principal Software Architect** | Architecture Lead | YYYY-MM-DD | `[ PENDING / APPROVED ]` | `[ DEFERRED PENDING RATIFICATION ]` |
| **Security Engineer** | Security Lead | YYYY-MM-DD | `[ PENDING / APPROVED ]` | `[ DEFERRED PENDING RATIFICATION ]` |
| **QA Lead** | Quality Assurance Lead | YYYY-MM-DD | `[ PENDING / APPROVED ]` | `[ DEFERRED PENDING RATIFICATION ]` |
| **Senior Technical Project Manager** | Technical PM | YYYY-MM-DD | `[ PENDING / APPROVED ]` | `[ DEFERRED PENDING RATIFICATION ]` |
| **Phase 5 Exclusion Waiver** | Designated Approver | YYYY-MM-DD | `[ PENDING WAIVER EXECUTION ]` — Scope: US-INV-001…US-PLAT-002; Evidence: _path/ticket_ | N/A |
