# TeamGuard Master Engineering Development Plan & Architecture Roadmap

---

## Section 1 — Document Control

| Metadata Field | Value |
| :--- | :--- |
| **Document Title** | TeamGuard Master Engineering Development Plan & Architecture Roadmap |
| **Document Identifier** | `TG-ENG-PLAN-v1.2.0` |
| **Target Path** | [docs/planning/teamguard-development-plan.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-development-plan.md) |
| **Document Version** | `1.2.0-draft` |
| **Document Status** | Engineering Planning Draft — Pending Requirements and Decision Ratification |
| **Last Updated** | 2026-10-14 |
| **Requirements Source** | [.agents/rules/teamguard-product-specs.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-product-specs.md) (`v1.1.0-draft`) |
| **Security Standards** | [.agents/rules/teamguard-rbac.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-rbac.md) |
| **User Stories Baseline** | [docs/product/teamguard-user-stories.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md) (`TG-USC-v1.0.1-revised`) |
| **Decision Register** | [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md) |
| **Story Traceability Matrix** | [docs/planning/teamguard-story-traceability.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-story-traceability.md) |
| **Release Checklist** | [docs/planning/teamguard-release-checklist.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-release-checklist.md) |
| **Author / Custodians** | Principal Software Architect, Senior Technical Project Manager, Security Engineer, QA Lead |

---

## Section 2 — Executive Summary & Readiness Assessment

### 2.1 Engineering Proposal Context
This document is an **Engineering Planning Baseline Pending Ratification** establishing a rigorous, security-first roadmap for TeamGuard. It provides a comprehensive **provisional engineering planning reference** for development teams, but is **not an approved implementation contract**: the requirements baseline remains at `v1.1.0-draft`, and seven architectural decisions (UD-001 through UD-005, Task Update Policy, Reporting Scope) are unresolved explicit project blockers awaiting formal stakeholder ratification. **Implementation of any decision-dependent capability requires ratification before engineering work may begin.**

### 2.2 Reconciled Baseline Metrics
An exhaustive cross-artifact audit between the canonical Product Specification ([teamguard-product-specs.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-product-specs.md)), Security Standards ([teamguard-rbac.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-rbac.md)), User Story Catalogue ([teamguard-user-stories.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md)), and active repository code establishes the following baseline:

- **Total User Stories Audited**: Exactly **79 unique stories** across **19 functional modules** (`US-AUTH-001` through `US-SYNC-002`).
  - *Regex Reconciliation Note*: Naive alphabetic-only regex (`US-[A-Z]+-[0-9]+`) identifies only 76 stories because Module Q uses the standard web accessibility numeronym `A11Y` (`US-A11Y-001`, `US-A11Y-002`, `US-A11Y-003`). Alphanumeric regex (`US-[A-Z0-9]+-[0-9]+`) correctly accounts for all 79 stories.
- **Total PRD Features Traced**: Exactly **60 PRD features** (`TG-AUTH-01` through `TG-A11Y-03`, 100% mapped).
- **Implementation Status Distribution**:
  - **Verified in Repository**: **31 stories** (39.2%) — Verified operational in code and local runtime with passing evidence at `TIER-2` or `TIER-3`.
  - **Partially Implemented**: **5 stories** (6.3%) — Foundational code or API exists; full acceptance criteria require planned expansion or contain a documented defect (`US-A11Y-002`, `US-A11Y-003`, `US-FILE-002`, `US-FILE-003`, `US-FILE-004`).
  - **Planned Implementation**: **32 stories** (40.5%) — In-scope for Core v1.0 release (Track A: Phases 1–4).
  - **Blocked by Product Decision**: **11 stories** (13.9%) — Explicitly quarantined in Phase 5 awaiting formal decision ratification.
  - **Total Reconciled**: **31 + 5 + 32 + 11 = 79 stories** (100.0%).
- **Implementation Task Inventory**: Exactly **35 distinct tasks** across 7 phases (`TASK-001` through `TASK-603`).
  - **32 story-linked engineering tasks** across Phases 0–5 (`TASK-001` through `TASK-507`).
  - **3 operational release tasks** in Phase 6 (`TASK-601`, `TASK-602`, `TASK-603`).
- **Story-to-Task Mapping Rule**: Every user story is explicitly assigned to a designated, fully defined engineering task (many-to-one mapping rule). Tasks may encompass multiple interrelated stories (e.g. `TASK-001` covers `US-TENANT-001` and `US-TENANT-005`), guaranteeing 100% requirement coverage with zero unmapped requirements.

### 2.3 Baseline Foundation Planning Indicator (45.5%)
To replace unsubstantiated scores with a transparent engineering indicator, TeamGuard tracks baseline foundation progress using a multi-factor formula:

$$\text{Planning Foundation Indicator} = (w_1 \times S_c) + (w_2 \times T_c) + (w_3 \times I_c)$$

1. **Core Scope Story Completion ($S_c = 50.0%$) [Weight: 50%]**:
   - In-scope Core Release stories (Track A: Phases 0–4): 68 stories (79 total minus 11 blocked).
   - Verified completed: 34 stories.
   - $S_c = \frac{31}{68} \approx 45.6\%$.
2. **Automated Verification Test Suite Establishment ($T_c = 25.0%$) [Weight: 25%]**:
   - Current passing tests: 6 integration tests in `backend/test/rbac.test.js` covering login, persona switching, RBAC permissions, negative PM checks, tenant isolation, and Super Admin lockout guard.
   - Target automated test suites planned: **28 comprehensive test suites** (canonical inventory defined in Section 12.2; derived from task-level test plans across all 35 tasks). The 6 currently passing integration tests demonstrate baseline coverage of core RBAC/ABAC but do not by themselves establish broad acceptance-criteria coverage.
   - $T_c = \frac{6}{28} \approx 21.4\%$.
3. **Security Invariant Enforcement ($I_c = 57.1%$) [Weight: 25%]**:
   - 7 Release-Critical Invariants evaluated.
   - Currently enforced: 4 invariants (Server RBAC, Real-time permission derivation, Lockout guards, Uniform 401 login).
   - Invariants requiring remediation: 3 invariants (Header fail-closed enforcement fallback defect, task protected fields mutation loophole, production secret vault injection).
   - $I_c = \frac{4}{7} = 57.1\%$.

$$\text{Weighted Foundation Indicator} = (0.50 \times 0.50) + (0.25 \times 0.25) + (0.25 \times 0.571) = 25.0\% + 6.25\% + 14.28\% = \mathbf{45.5\%}$$

> [!NOTE]
> **Methodology Limitation Note**:
> The 45.5% figure is strictly a **planning and foundation indicator** measuring the current ratio of verified core requirements, test suites, and invariants against the target engineering contract. It must not be cited as a measure of production readiness, which is governed exclusively by the objective sign-off gates in [teamguard-release-checklist.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-release-checklist.md).

### 2.4 Two-Track Release Scope Strategy & Gate Reconciliation
To prevent release exit criteria from conflicting with unresolved product decisions:
- **Track A: Core v1.0 Production Release**:
  - Scope: Encompasses **Phases 0 through 4** plus **Phase 6** deployment and production hardening. Covers all **68 Core Stories** (31 Verified + 5 Partial + 32 Planned).
  - Mandatory Gates: Security gates `SEC-01` through `SEC-10`, `TEST-01` through `TEST-06`, `DB-01` through `DB-06`, and `OPS-01` through `OPS-08` are non-negotiable invariants.
  - Approved Exclusions: The **11 Decision-Blocked Stories** (Phase 5) and associated checks (`SEC-11`, `SEC-12`) are classified as **Post-v1.0 Deferred / Feature-Flagged Exclusions**. Their formal exclusion requires a documented stakeholder release waiver recording the approver, approval date, scope, and evidence reference. **This waiver is currently `PENDING` — see §16.1, Gate 5.** Until the waiver is executed, these exclusions are treated as planned deferrals only. Because invitation and platform administration endpoints are physically unmounted and disabled in Track A, zero unverified code paths exist in Track A.
- **Track B: Enterprise Expansion Release (Post-v1.0 / v1.1)**:
  - Scope: The 11 Blocked Stories quarantined in Phase 5.
  - Activated only after stakeholder decisions UD-001 through UD-005, Task Update Policy, and Reporting Scope are ratified in [teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md).

---

## Section 3 — Scope and Authoritative Governance

### 3.1 Requirements Hierarchy
Development must strictly adhere to the following hierarchy of authority:
1. **Canonical Product Specification**: [.agents/rules/teamguard-product-specs.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-product-specs.md) (`v1.1.0-draft`).
2. **Security & Authorization Rules**: [.agents/rules/teamguard-rbac.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-rbac.md).
3. **Exhaustive User Story Catalogue**: [docs/product/teamguard-user-stories.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md) (`TG-USC-v1.0.1-revised`).
4. **Architectural Decision Register**: [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md).

### 3.2 Strict Planning Boundary
This document is strictly an **engineering planning contract**. Development teams must not implement features, execute destructive migrations, or invent business logic for unresolved requirements during planning.

---

## Section 4 — Repository Baseline & Verified Technical Foundation

### 4.1 Technology Stack & Runtime Versions
- **Backend Runtime**: Node.js v24.15.0 LTS with Express 5.3.0.
- **Database ORM**: Prisma ORM 7.10.0 with `@prisma/adapter-pg` 7.10.0 and PostgreSQL 16 on port 5432.
- **Frontend Architecture**: React 19.2.8, Vite 8.3.0, Lucide React 1.56.0.
- **Styling**: Vanilla CSS (`frontend/src/index.css`) featuring curated design tokens, CSS variables, dark theme palettes, glassmorphism, and responsive breakpoints.
- **Test Runner**: Native Node.js test runner (`node --test`) in `backend/test/rbac.test.js` (6/6 tests passing in 13.8s).

### 4.2 Database Models in Active Schema
Verification of [backend/prisma/schema.prisma](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/schema.prisma) confirms exactly **12 database models**:
1. `Organization`: Tenant container with unique slug, name, and timestamps.
2. `User`: User credentials, email, username, display name, and active status.
3. `Membership`: Composite relation (userId, organizationId) with membership status.
4. `Role`: Tenant-scoped and system-level role definitions.
5. `Permission`: Discrete system permissions categorized by module.
6. `MembershipRole`: Join table mapping memberships to assigned roles.
7. `RolePermission`: Join table defining discrete permissions granted to roles.
8. `Project`: Project entities partitioned by organizationId with color tokens.
9. `Task`: Work items with title, description, status, priority, due date, projectId, creatorId, assigneeId.
10. `FileAsset`: Metadata records for workspace documents with byte size, MIME type, and project links.
11. `AuditLog`: Append-only security audit trail records capturing actor, action, entity, organizationId, and metadata.
12. `RefreshSession`: JWT refresh token families with token hashes, expiration timestamps, and revocation tracking.

---

## Section 5 — Current Architecture & Technical Constraints

### 5.1 Multi-Tenant Context Resolution
Tenant isolation is enforced via the `x-organization-id` HTTP header processed by [backend/src/middleware/tenant.middleware.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/middleware/tenant.middleware.js).
- **CRITICAL DEFECT DETECTED**: Lines 18–35 contain legacy fallback logic that silently resolves the caller's first active membership when `x-organization-id` is omitted. This violates strict fail-closed multi-tenancy and is remediated in Phase 0 (`TASK-001`).

### 5.2 Server-Authoritative RBAC & ABAC Engine
Authorization is evaluated dynamically on every request in [backend/src/middleware/rbac.middleware.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/middleware/rbac.middleware.js).
- The system derives effective permissions per-request directly from database joins.
- **DEFECT DETECTED**: `tasks.controller.js` under `task:update:own` does not block mutating `projectId`, `creatorId`, or `assigneeId`. Remediated in Phase 0 (`TASK-002`).

### 5.3 Real-Time SSE Transport Specification
Standard browser `EventSource` does not allow custom HTTP headers. To enforce multi-tenant authorization without passing bearer tokens in URLs (which leak into proxy logs and browser history), TeamGuard adopts an **Authenticated Fetch-Based Streaming Client** (`@microsoft/fetch-event-source` or native `fetch` with `ReadableStream` reader).
- **Capabilities Verified**:
  1. Passes standard `Authorization: Bearer <accessToken>` and `x-organization-id` headers directly in HTTP request headers.
  2. Automatic reconnect with exponential backoff and `Last-Event-ID` cursor tracking for missed event replay.
  3. Clean stream cancellation via `AbortController` upon component unmount, tab close, or workspace switch.
  4. Seamless dynamic tenant-context re-binding: when switching organizations, the client aborts the active stream and re-establishes a fresh connection with the new tenant header.
  5. Server-side per-connection authorization: protected by existing `authenticateToken` and `requireTenant` middleware.

---

## Section 6 — Critical Defects, Security Gaps & Discrepancies

The baseline repository audit identified 5 critical defects requiring immediate Phase 0 remediation:

### Defect 1: Silent Organization Fallback Violates Fail-Closed Tenancy
- **Location**: [backend/src/middleware/tenant.middleware.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/middleware/tenant.middleware.js#L18-L35).
- **Vulnerability**: Omitting `x-organization-id` causes the server to query the user's first active organization and proceed, risking cross-tenant data corruption if client state desynchronizes.
- **Remediation (TASK-001)**: Remove lines 18–35. Enforce strict `HTTP 400 Bad Request` on missing header, and `HTTP 403 Forbidden` on unverified membership.

### Defect 2: Task Update Mutation Loophole on Protected Fields
- **Location**: [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js).
- **Vulnerability**: A user with `task:update:own` can submit a JSON payload modifying `projectId`, `creatorId`, or `assigneeId`.
- **Remediation (TASK-002)**: Enforce a strict field-level mutation barrier. Reject modifications to protected fields across all payload shapes, alternate casing (`project_id`, `CreatorId`), query params, and prototype pollution keys.

### Defect 3: Stale Cross-Tenant Client Cache Leakage
- **Location**: [frontend/src/context/AuthContext.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/context/AuthContext.jsx).
- **Vulnerability**: Switching organizations does not purge existing React Query caches or local state.
- **Remediation (TASK-003)**: Trigger explicit cache purge (`queryClient.clear()`) and reset workspace state on organization switch.

### Defect 4: Baseline Security Controls Deferred Too Late
- **Location**: [backend/src/app.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/app.js).
- **Vulnerability**: Helmet security headers, CORS origin whitelisting, and IP/account rate limiting were deferred to Phase 6, leaving baseline servers vulnerable to brute-force and clickjacking during active development.
- **Remediation (TASK-004)**: Pull baseline Helmet headers, strict CORS, and express-rate-limit directly into Phase 0.

### Defect 5: Missing Automated Negative Authorization Suites
- **Location**: `backend/test/`.
- **Gap**: Only 6 integration tests exist. Critical security boundaries lack automated negative test coverage.
- **Remediation (TASK-006)**: Implement 25+ automated negative integration test vectors covering ID tampering, privilege escalation, and token replay.

---

## Section 7 — Product-Decision Blockers & Planning Assumptions

All 7 unresolved decisions are preserved as explicit blockers in [teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md). Provisional engineering designs are detailed below:

1. **UD-001: Platform Super Admin & Break-Glass Recovery** (Blocks `US-PLAT-001`, `US-PLAT-002`):
   - Provisional Design: Unified App with Operator Context. Enforces mandatory MFA step-up verification token (5m validity, single-use nonce), active ITSM ticket ID validation (`/^TG-[0-9]{4,8}$/`), action scope restriction (no customer data browsing), 60m session TTL, and immutable hash-chained logging. If notification dispatch fails, action rolls back.
2. **UD-002: Cloud Binary Object Storage Provider** (Blocks `US-STOR-001`):
   - Provisional Design: S3-Compatible Cloud Storage via presigned URLs. Confirmation endpoint `POST /api/v1/files/confirm` enforces server-side `HeadObjectCommand` verifying object existence, size <= quota, permitted MIME whitelist, safe RFC 5987 filename sanitization, tenant key prefix, checksum, and row-level quota locking before inserting `FileAsset`. S3 lifecycle rule purges incomplete multipart uploads after 24h.
3. **UD-003: Real-Time Transport & State Synchronization** (Blocks `US-SYNC-001`, `US-SYNC-002`):
   - Provisional Design: SSE via Authenticated Fetch Streaming Client (`@microsoft/fetch-event-source`) with `AbortController` cancellation, `Last-Event-ID` reconnect, and smart polling fallback.
4. **UD-004: Rich Text Editor Integration** (Blocks `US-COLLAB-004`):
   - Provisional Design: TipTap / ProseMirror with strict DOMPurify HTML sanitization.
5. **UD-005: Member Invitation Delivery Mechanism** (Blocks `US-INV-001`, `US-INV-002`, `US-INV-003`):
   - Provisional Design: Resend Transactional Email API with secure 7-day token link fallback.
6. **DP-TASK-001: Task Creator vs. Assignee Policy Bifurcation** (Blocks `US-ABAC-004`):
   - Provisional Design: Discrete bifurcation (`task:update:own` vs. `task:update:assigned`).
7. **DP-REP-001: Reporting Scope & Metrics Export** (Blocks `US-REP-001`):
   - Provisional Design: CSV export streaming of task velocity and audit logs.

---

## Section 8 — Prioritization Methodology

Work is sequenced strictly by technical dependencies, security invariants, and release tracks:
1. **Foundation & Early Hardening (Phase 0)**: Remediate existing vulnerabilities and deploy baseline security headers/rate limiting before adding new code.
2. **Access Control & Governance (Phase 1)**: Solidify organization, membership, and RBAC privilege barriers.
3. **Core Workflows (Phase 2)**: Projects, tasks, drag-and-drop Kanban, and multi-view representations.
4. **Collaboration & Utility (Phase 3 & 4)**: Subtasks, comments, audit feeds, calendar, command palette, and dedicated file management.
5. **Provisional Blocked Work (Phase 5)**: Quarantined under Track B awaiting decision ratification.
6. **Production Packaging & CI Gates (Phase 6)**: Containerization, secret vaults, CI quality gates, and E2E regression.

---

## Section 9 — Phase-by-Phase Development Roadmap

| Phase | Phase Name | Release Track | Included Tasks | Scope & Objective |
| :---: | :--- | :---: | :---: | :--- |
| **Phase 0** | Baseline Hardening & Defect Remediation | Track A | `TASK-001`–`TASK-006` | Eliminate tenant header fallback, protect task fields, purge switch cache, deploy baseline Helmet/rate limiting, session rotation, negative test suite. |
| **Phase 1** | Organization, Membership & RBAC Administration | Track A | `TASK-101`–`TASK-104` | Member directory, last-owner guards, custom roles, template cloning, delegation barriers. |
| **Phase 2** | Core Workflows: Projects, Tasks & Multi-View Board | Track A | `TASK-201`–`TASK-206` | Project keys, progress aggregation, task CRUD, Kanban board, List/Table views, multi-filters. |
| **Phase 3** | Collaboration, Subtasks, Activity Streams & Dispatch | Track A | `TASK-301`–`TASK-304` | Subtasks, comments with 15m edit window, task activity stream, real-time notification dispatch. |
| **Phase 4** | Workspace Utility, Navigation, Files & Accessibility | Track A | `TASK-401`–`TASK-405` | Command palette (Cmd+K), release calendar, notification center, WCAG AA compliance, file management. |
| **Phase 5** | Provisional Implementation of Blocked Features | Track B | `TASK-501`–`TASK-507` | Quarantined capabilities awaiting stakeholder decision ratification (UD-001..005). |
| **Phase 6** | Production Hardening, Quality Gates & Deployment | Track A | `TASK-601`–`TASK-603` | DB migration staging validation, Docker containerization, CI/CD quality gates & E2E suite. |

---

## Section 10 — Detailed Implementation Task Register (35 Tasks)

### Phase 0: Baseline Hardening & Critical Defect Remediation

#### Task ID: TASK-001 — Strict Multi-Tenant Header Enforcement & Fail-Closed Scoping
- **Objective**: Eliminate legacy silent fallback in `tenant.middleware.js` (lines 18–35). Require explicit, valid `x-organization-id` on all protected routes.
- **Linked User Stories**: `US-TENANT-001`, `US-TENANT-005`
- **Linked PRD Features**: `TG-TENANT-001`
- **Priority**: Critical (P0)
- **Status**: Remediation Implementation Required
- **Affected Files**: [backend/src/middleware/tenant.middleware.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/middleware/tenant.middleware.js)
- **Implementation Steps**:
  1. Remove lines 18–35 fallback querying first active membership.
  2. Parse `x-organization-id`; if missing or invalid integer, immediately return `HTTP 400 Bad Request` with `{ "error": "x-organization-id header is required" }`.
  3. Verify membership; if caller is not an `ACTIVE` member, return `HTTP 403 Forbidden`.
- **Data/API Impact**: Breaks any legacy client requests omitting tenant header; enforces RFC 7807 error format.
- **Security Considerations**: Eliminates cross-tenant data corruption vulnerability.
- **Dependencies & Blockers**: None (Unblocked).
- **Test Plan**: Negative API tests asserting 400 on missing header, 400 on non-integer header (`x-organization-id: abc`), 403 on unjoined organization ID.
- **Acceptance Criteria**: All tenant requests fail closed with 400/403 when header is absent or unauthorized.
- **Definition of Done**: Middleware refactored, automated tests passing in `backend/test/tenant.test.js`.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk; rollback restores previous middleware git commit.

#### Task ID: TASK-002 — Protected Task Governance Fields Mutation Barrier
- **Objective**: Enforce strict server-side immutability on `projectId`, `creatorId`, and `assigneeId` during task updates under `task:update:own`.
- **Linked User Stories**: `US-ABAC-003`
- **Linked PRD Features**: `TG-ABAC-003`
- **Priority**: Critical (P0)
- **Status**: Remediation Implementation Required
- **Affected Files**: [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js)
- **Implementation Steps**:
  1. In `updateTask`, inspect parsed body for `projectId`, `creatorId`, `assigneeId`.
  2. If caller lacks `task:assign` or `project:manage`, strip or reject mutation payload with `HTTP 403 Forbidden` (`{ "code": "PROTECTED_FIELD_MUTATION" }`).
  3. Cover alternate payload casing (`project_id`, `CreatorId`), query parameter injections, and prototype pollution keys (`__proto__`, `constructor`).
- **Data/API Impact**: Prevents unauthorized project re-parenting and creator spoofing.
- **Security Considerations**: Enforces ABAC immutability invariants.
- **Dependencies & Blockers**: None (Unblocked).
- **Test Plan**: Comprehensive automated negative tests submitting alternate casing, query params, and JSON body keys attempting field mutation.
- **Acceptance Criteria**: Any attempt by non-admin actor to modify protected fields returns 403.
- **Definition of Done**: Controller validation active, negative tests passing in `backend/test/abac.test.js`.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-003 — Workspace Switch Cache Invalidation & Multi-Tenant State Isolation
- **Objective**: Purge all client-side query caches and in-memory tenant state when switching active workspace in frontend console.
- **Linked User Stories**: `US-AUTH-004`, `US-TENANT-003`
- **Linked PRD Features**: `TG-AUTH-004`, `TG-TENANT-003`
- **Priority**: High (P1)
- **Status**: Remediation Implementation Required
- **Affected Files**: [frontend/src/context/AuthContext.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/context/AuthContext.jsx), [frontend/src/AppShell.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/AppShell.jsx)
- **Implementation Steps**:
  1. In `switchOrganization`, invoke `queryClient.clear()` to completely wipe React Query cache.
  2. Clear selected project IDs and active view filters from `localStorage`.
  3. Re-hydrate workspace permissions and projects fresh for the target organization.
- **Data/API Impact**: Ensures UI renders only fresh tenant data.
- **Security Considerations**: Prevents cross-tenant visual residue in client browser.
- **Dependencies & Blockers**: TASK-001.
- **Test Plan**: Cypress/Playwright test verifying that task cards from Org A vanish immediately upon switching to Org B.
- **Acceptance Criteria**: Zero residual cache items from previous organization remain accessible.
- **Definition of Done**: Frontend context updated, automated E2E test passing.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-004 — Baseline Security Controls: Helmet Headers, CORS Whitelist & Auth Rate Limiting
- **Objective**: Deploy baseline Helmet security headers, strict CORS origin whitelisting, and auth rate limiting into development and staging environments immediately.
- **Linked User Stories**: `US-AUTH-002`, `US-TENANT-001`
- **Linked PRD Features**: `TG-AUTH-002`, `TG-TENANT-001`
- **Priority**: Critical (P0)
- **Status**: Implementation Required
- **Affected Files**: [backend/src/app.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/app.js), `backend/src/middleware/rate-limiter.middleware.js`
- **Implementation Steps**:
  1. Mount `helmet()` with Content Security Policy, HSTS, frameguard, and referrer policy.
  2. Configure CORS strictly to `process.env.FRONTEND_ORIGIN` with credentials enabled; wildcards strictly forbidden.
  3. Mount `express-rate-limit` on `/api/v1/auth/*` (max 10 requests / 15m per IP).
  4. Mount `GET /api/health` reporting database connectivity status without exposing sensitive credentials.
- **Data/API Impact**: Middleware pipeline addition.
- **Security Considerations**: Protects against brute-force, clickjacking, and XSS from Day 1.
- **Dependencies & Blockers**: None (Unblocked).
- **Test Plan**: Automated test asserting 429 on 11th consecutive failed login; curl asserting presence of `X-Frame-Options: SAMEORIGIN` and CSP headers.
- **Acceptance Criteria**: Security headers present; rate limiter enforces 429.
- **Definition of Done**: Middleware mounted, tested, and passing in test runner.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-005 — Multi-Device Refresh Token Rotation, Family Invalidation, Session Cleanup & Account Profile Security
- **Objective**: Harden JWT refresh token rotation with cryptographic family tracking, reuse detection, session cleanup, and enforce secure account profile updates (display name, email, password change with current-password re-entry).
- **Linked User Stories**: `US-AUTH-001`, `US-AUTH-002`, `US-AUTH-003`, `US-AUTH-005`, `US-ACC-001`
- **Linked PRD Features**: `TG-AUTH-001`, `TG-AUTH-002`, `TG-AUTH-003`, `TG-AUTH-005`, `TG-ACC-001`
- **Priority**: High (P1)
- **Status**: Hardening Required
- **Affected Files**: [backend/src/services/token.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/token.service.js), [backend/src/controllers/auth.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/auth.controller.js)
- **Implementation Steps**:
  1. Ensure `RefreshSession` rotates on every refresh request.
  2. On detection of an already-used refresh token, revoke all sessions sharing that `familyId` (`revokedAt = now()`).
  3. Provide cron/cleanup endpoint to purge expired sessions.
- **Data/API Impact**: Updates `RefreshSession` table rows.
- **Security Considerations**: Defends against stolen refresh token replay attacks.
- **Dependencies & Blockers**: None (Unblocked).
- **Test Plan**: Automated test simulating token replay and verifying family revocation.
- **Acceptance Criteria**: Replayed token returns 401 and revokes family.
- **Definition of Done**: Test passing in `backend/test/auth.test.js`.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-006 — Negative Security, Header-Tampering & Cross-Tenant Regression Test Suite
- **Objective**: Implement comprehensive negative authorization test suite in native `node --test` covering cross-tenant attacks and privilege escalation.
- **Linked User Stories**: `US-TENANT-005`, `US-DEV-001`
- **Linked PRD Features**: `TG-TENANT-001`, `TG-DEV-001`
- **Priority**: Critical (P0)
- **Status**: Implementation Required
- **Affected Files**: `backend/test/tenant-security.test.js`, [backend/prisma/seed.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/seed.js)
- **Implementation Steps**:
  1. Author 20+ automated test vectors asserting 400/401/403 across tenant scoping, role delegation, and ID manipulation.
  2. Ensure seed script provisions reproducible multi-tenant test fixtures cleanly.
- **Data/API Impact**: None (test runner only).
- **Security Considerations**: Automates regression defense for RCG-1 through RCG-5.
- **Dependencies & Blockers**: TASK-001, TASK-002, TASK-004.
- **Test Plan**: Execute `node --test backend/test/tenant-security.test.js`.
- **Acceptance Criteria**: 100% of negative security tests pass.
- **Definition of Done**: Test suite committed and executing cleanly in `npm test`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Zero risk.

---

### Phase 1: Organization, Membership & RBAC Administration

#### Task ID: TASK-101 — Organization Member Directory, Last-Owner Safeguards & Role Reassignment
- **Objective**: Build member management directory with role assignment API and last-owner protection.
- **Linked User Stories**: `US-TENANT-004`, `US-INV-004`, `US-INV-005`
- **Linked PRD Features**: `TG-TENANT-004`, `TG-INV-001`
- **Priority**: High (P1)
- **Status**: Implementation Required
- **Affected Files**: [backend/src/controllers/users.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/users.controller.js), [frontend/src/views/MembersView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/views/MembersView.jsx)
- **Implementation Steps**:
  1. Create `GET /api/members` returning tenant members, status, and role names.
  2. Implement `PATCH /api/members/:id/role` guarded by `roles:assign`.
  3. Enforce last-owner safeguard: prevent deactivation/removal of the final `Owner` / `Super Admin`.
- **Data/API Impact**: Updates `MembershipRole` and `Membership` records.
- **Security Considerations**: Prevents accidental organizational orphan state.
- **Dependencies & Blockers**: TASK-001.
- **Test Plan**: Integration test asserting 403 when removing the only active owner.
- **Acceptance Criteria**: Member directory loads; last owner cannot be deactivated.
- **Definition of Done**: Controller and UI connected with automated tests.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-102 — Organization Management, Dynamic Permission Matrix & Super Admin Lockout Guard
- **Objective**: Complete organization metadata updates and dynamic permission matrix toggling with Super Admin immutability.
- **Linked User Stories**: `US-TENANT-002`, `US-RBAC-001`, `US-RBAC-002`, `US-RBAC-003`
- **Linked PRD Features**: `TG-TENANT-002`, `TG-RBAC-001`, `TG-RBAC-002`, `TG-RBAC-003`, `TG-RBAC-004`
- **Priority**: High (P1)
- **Status**: Verified in Baseline / Expansion Required
- **Affected Files**: [backend/src/controllers/permissions-matrix.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/permissions-matrix.controller.js), [frontend/src/views/TeamPermissionsMatrixView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/views/TeamPermissionsMatrixView.jsx)
- **Implementation Steps**:
  1. Validate organization creation and slug generation.
  2. Connect permission matrix discrete checkbox toggles to `POST /api/permissions/matrix/toggle`.
  3. Enforce hard error if caller attempts to remove permissions from the system `Super Admin` role.
- **Data/API Impact**: Updates `RolePermission` table.
- **Security Considerations**: Preserves Super Admin administrative authority.
- **Dependencies & Blockers**: TASK-001.
- **Test Plan**: Test #6 in `backend/test/rbac.test.js` verified; add UI e2e test.
- **Acceptance Criteria**: Super Admin role permissions cannot be unchecked.
- **Definition of Done**: Verified pass in automated test suite.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-103 — Custom Role Creation, Template Cloning & Module-Level Bulk Toggles
- **Objective**: Allow administrators to create custom tenant roles cloned from existing templates with bulk module toggles.
- **Linked User Stories**: `US-RBAC-004`, `US-RBAC-005`
- **Linked PRD Features**: `TG-RBAC-005`, `TG-RBAC-006`
- **Priority**: Medium (P2)
- **Status**: Implementation Required
- **Affected Files**: [backend/src/controllers/roles.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/roles.controller.js), [frontend/src/views/TeamPermissionsMatrixView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/views/TeamPermissionsMatrixView.jsx)
- **Implementation Steps**:
  1. Implement `POST /api/roles` accepting name, description, cloneFromRoleId.
  2. Implement bulk toggle endpoint `POST /api/roles/:id/modules/:module/toggle`.
  3. Add modal dialog in frontend matrix for "Create Custom Role".
- **Data/API Impact**: Inserts new `Role` and associated `RolePermission` rows.
- **Security Considerations**: Bounded by delegation barrier (TASK-104).
- **Dependencies & Blockers**: TASK-102.
- **Test Plan**: Unit test cloning Member role into QA role and asserting permission copy.
- **Acceptance Criteria**: Custom role appears in matrix; bulk toggles work instantaneously.
- **Definition of Done**: Full custom role lifecycle operational.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-104 — Universal Privilege Delegation Barrier & System Role Protection
- **Objective**: Prevent privilege escalation by forbidding administrators from granting permissions they do not possess. Protect system roles from renaming/deletion.
- **Linked User Stories**: `US-RBAC-006`, `US-RBAC-007`
- **Linked PRD Features**: `TG-RBAC-007`, `TG-RBAC-008`
- **Priority**: Critical (P0)
- **Status**: Implementation Required
- **Affected Files**: [backend/src/middleware/rbac.middleware.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/middleware/rbac.middleware.js), [backend/src/controllers/roles.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/roles.controller.js)
- **Implementation Steps**:
  1. In role creation/assignment, compare target permissions against caller's active permissions.
  2. If target permission $\not\subset$ caller permissions, return `HTTP 403 Forbidden` (`{ "code": "DELEGATION_BARRIER_BREACH" }`).
  3. Block `DELETE /api/roles/:id` if `isSystem = true`.
- **Data/API Impact**: Validation barrier on role mutations.
- **Security Considerations**: Prevents low-privilege actors from escalating to Super Admin.
- **Dependencies & Blockers**: TASK-103.
- **Test Plan**: Negative integration test asserting 403 when Project Manager tries to create role with `roles:manage`.
- **Acceptance Criteria**: Delegation boundary strictly enforced; system roles immutable.
- **Definition of Done**: Automated test passing in `backend/test/rbac.test.js`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

---

### Phase 2: Core Workflows — Projects, Tasks & Multi-View Board

#### Task ID: TASK-201 — Project Core CRUD, Tenant Scoping & Soft Deletion Lifecycle
- **Objective**: Build robust project lifecycle API with soft-deletion and tenant-scoped cascades.
- **Linked User Stories**: `US-PROJ-001`, `US-PROJ-004`
- **Linked PRD Features**: `TG-PROJ-001`, `TG-PROJ-004`
- **Priority**: High (P1)
- **Status**: Expansion Required
- **Affected Files**: [backend/src/controllers/projects.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/projects.controller.js), [backend/src/services/projects.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/projects.service.js)
- **Implementation Steps**:
  1. Add `deletedAt` timestamp field to Project queries (soft deletion).
  2. When project is soft-deleted, filter out associated tasks from standard queries.
  3. Enforce strict `organizationId` match on all project mutations.
- **Data/API Impact**: Adds soft delete filter to Prisma queries.
- **Security Considerations**: Cross-tenant project access rejected with 403.
- **Dependencies & Blockers**: TASK-001.
- **Test Plan**: API test asserting soft-deleted project is excluded from `GET /api/projects`.
- **Acceptance Criteria**: Projects create, update, soft-delete cleanly.
- **Definition of Done**: Controller, service, and tests passing in `backend/test/projects.test.js`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-202 — JIRA-Style Project Keys, Dynamic Progress & Archival Protection
- **Objective**: Generate unique uppercase project keys (e.g. `PROJ`), calculate task completion %, and enforce read-only archival state.
- **Linked User Stories**: `US-PROJ-002`, `US-PROJ-003`, `US-PROJ-005`
- **Linked PRD Features**: `TG-PROJ-002`, `TG-PROJ-003`, `TG-PROJ-005`
- **Priority**: Medium (P2)
- **Status**: Implementation Required
- **Affected Files**: [backend/src/services/projects.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/projects.service.js), [frontend/src/views/ProjectsView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/views/ProjectsView.jsx)
- **Implementation Steps**:
  1. Auto-generate project key from title (`/[A-Z]{2,10}/`) and enforce unique constraint per tenant.
  2. Implement progress calculation: $\frac{\text{DONE tasks}}{\text{total tasks}} \times 100$.
  3. If `isArchived = true`, reject task creation or status updates with 403.
- **Data/API Impact**: Adds `key` and `isArchived` fields to Project model.
- **Security Considerations**: Archived projects remain read-only.
- **Dependencies & Blockers**: TASK-201.
- **Test Plan**: Test asserting mutation rejection on archived project.
- **Acceptance Criteria**: Key generated, progress displayed, archived projects protected.
- **Definition of Done**: Service methods and UI badges operational.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-203 — Task Core CRUD, Validation, Status Workflow & Priority Engine
- **Objective**: Provide comprehensive task management API with status state-machine and dynamic ABAC permission evaluation.
- **Linked User Stories**: `US-TASK-001`, `US-TASK-002`, `US-TASK-003`, `US-TASK-006`, `US-ABAC-001`, `US-ABAC-002`
- **Linked PRD Features**: `TG-TASK-001`, `TG-TASK-002`, `TG-TASK-003`, `TG-TASK-006`, `TG-ABAC-001`, `TG-ABAC-002`
- **Priority**: Critical (P0)
- **Status**: Verified in Baseline / Expansion Required
- **Affected Files**: [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js), [backend/src/services/tasks.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/tasks.service.js)
- **Implementation Steps**:
  1. Validate title, priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), status (`TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`).
  2. When moving to `DONE`, set `completedAt = now()`.
  3. Enforce ABAC ownership checks (creator vs assignee vs admin) with structured 403 error codes.
- **Data/API Impact**: Task CRUD endpoints.
- **Security Considerations**: Rigorous negative tests for unauthorized status mutations.
- **Dependencies & Blockers**: TASK-001, TASK-002.
- **Test Plan**: Tests #2 and #4 in `backend/test/rbac.test.js` verified; add unit tests for priority transitions.
- **Acceptance Criteria**: State machine transitions work smoothly; negative tests return 403.
- **Definition of Done**: 100% test pass on task workflow suite.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-204 — Slide-Over Task Detail Drawer & Native Drag-and-Drop Kanban
- **Objective**: Connect interactive Kanban board drag-and-drop column transitions and slide-over task drawer with Esc key handling.
- **Linked User Stories**: `US-TASK-004`, `US-TASK-005`
- **Linked PRD Features**: `TG-TASK-004`, `TG-TASK-005`
- **Priority**: High (P1)
- **Status**: Verified in Baseline / Expansion Required
- **Affected Files**: [frontend/src/views/KanbanBoardView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/views/KanbanBoardView.jsx), `frontend/src/components/TaskDetailDrawer.jsx`
- **Implementation Steps**:
  1. Refactor existing modal dialog into smooth slide-over drawer mounting from right edge.
  2. Support Esc key dismissal and backdrop click dismissal.
  3. HTML5 drag-and-drop updates task status optimistically and calls `PATCH /api/tasks/:id`.
- **Data/API Impact**: Client-side state and REST mutation.
- **Security Considerations**: Visual lock icon on cards user cannot drag.
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: E2E test verifying card drag from TODO to IN_PROGRESS updates database.
- **Acceptance Criteria**: Drawer mounts smoothly; drag-and-drop reflects state in DB.
- **Definition of Done**: Frontend component operational and tested.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-205 — Multi-View Task Representations: List & Table Views
- **Objective**: Deliver interactive List and Table views for tasks with due date badges and overdue alert styling.
- **Linked User Stories**: `US-TASK-007`, `US-TASK-008`, `US-TASK-009`
- **Linked PRD Features**: `TG-TASK-007`, `TG-TASK-008`, `TG-TASK-009`
- **Priority**: Medium (P2)
- **Status**: Implementation Required
- **Affected Files**: `frontend/src/views/TaskListView.jsx`, `frontend/src/views/TaskTableView.jsx`, [frontend/src/index.css](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/index.css)
- **Implementation Steps**:
  1. Build List view grouped by status with collapsible sections.
  2. Build Table view featuring compact grid, column headers, and inline priority tags.
  3. Add due date badges: red for overdue, amber for due within 48h, muted grey for future.
- **Data/API Impact**: Client-side view rendering consuming `GET /api/tasks`.
- **Security Considerations**: Identical RBAC guards applied to all views.
- **Dependencies & Blockers**: TASK-204.
- **Test Plan**: Frontend component tests verifying table sort and overdue badge styling.
- **Acceptance Criteria**: View switcher smoothly alternates between Kanban, List, Table.
- **Definition of Done**: Both views operational with responsive styling.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-206 — Task Search, Filtering, Sorting & Pagination Engine
- **Objective**: Implement multi-parameter search, filtering (status, priority, assignee, project), column sorting, and pagination.
- **Linked User Stories**: `US-TASK-010`
- **Linked PRD Features**: `TG-TASK-010`
- **Priority**: Medium (P2)
- **Status**: Implementation Required
- **Affected Files**: [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js), [backend/src/services/tasks.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/tasks.service.js)
- **Implementation Steps**:
  1. Expand `GET /api/tasks` with query params: `search`, `status`, `priority`, `assigneeId`, `projectId`, `sortBy`, `page`, `limit`.
  2. Implement Prisma `where` clauses with case-insensitive search (`mode: 'insensitive'`).
  3. Return paginated payload with total count, page, and totalPages.
- **Data/API Impact**: Query parameter expansion on existing endpoint.
- **Security Considerations**: Tenant scoping strictly enforced on all filter combinations.
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: Automated integration tests asserting correct filtering across 5 parameter combinations.
- **Acceptance Criteria**: Filter queries return accurate subsets within <100ms.
- **Definition of Done**: Tests passing in `backend/test/tasks.test.js`.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

---

### Phase 3: Collaboration, Subtasks, Activity Streams & Real-Time Dispatch

#### Task ID: TASK-301 — Subtask Relational Schema, Checklist CRUD & Progress Propagation
- **Objective**: Add Subtask database model, checklist CRUD endpoints, and dynamic parent progress calculation.
- **Linked User Stories**: `US-SUB-001`, `US-SUB-002`
- **Linked PRD Features**: `TG-SUB-001`, `TG-SUB-002`
- **Priority**: High (P1)
- **Status**: Implementation Required
- **Affected Files**: [backend/prisma/schema.prisma](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/schema.prisma), `backend/src/controllers/subtasks.controller.js`, `frontend/src/components/SubtaskChecklist.jsx`
- **Implementation Steps**:
  1. Generate Prisma migration adding `Subtask` model (id, title, isCompleted, taskId, createdAt).
  2. Implement subtask CRUD endpoints nested under `/api/tasks/:taskId/subtasks`.
  3. Recalculate parent task completion progress whenever subtask checkbox is toggled.
- **Data/API Impact**: Staged Migration #1 adding `Subtask` table with foreign key cascade to `Task`.
- **Security Considerations**: Subtask mutations guarded by parent task update permissions.
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: Unit test verifying that checking 2 of 4 subtasks sets parent progress to 50%.
- **Acceptance Criteria**: Subtasks create, delete, and toggle with instant UI feedback.
- **Definition of Done**: Migration applied cleanly, automated tests passing in `backend/test/subtasks.test.js`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Reversible migration; drop table on rollback.

#### Task ID: TASK-302 — Collaborative Task Comments, 15m Window & Moderation
- **Objective**: Implement task discussion comments with DOMPurify sanitization, 15-minute author edit window, and moderator deletion.
- **Linked User Stories**: `US-COLLAB-001`, `US-COLLAB-002`, `US-COLLAB-003`
- **Linked PRD Features**: `TG-COLLAB-001`, `TG-COLLAB-002`, `TG-COLLAB-003`
- **Priority**: High (P1)
- **Status**: Implementation Required
- **Affected Files**: [backend/prisma/schema.prisma](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/schema.prisma), `backend/src/controllers/comments.controller.js`, `frontend/src/components/TaskCommentsSection.jsx`
- **Implementation Steps**:
  1. Add `Comment` model (id, content, taskId, authorId, editedAt, createdAt).
  2. Enforce 15-minute edit window: reject `PATCH /api/comments/:id` if `now() - createdAt > 15 minutes` unless moderator.
  3. Sanitize markdown input using DOMPurify before storing.
- **Data/API Impact**: Staged Migration #2 adding `Comment` table.
- **Security Considerations**: XSS defense on rendered markdown; author privilege enforcement.
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: Automated test asserting 403 when author attempts edit at 16 minutes.
- **Acceptance Criteria**: Comments post cleanly; edit window enforced; admin can moderate.
- **Definition of Done**: Endpoints active, tests passing in `backend/test/comments.test.js`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Reversible migration.

#### Task ID: TASK-303 — Task Activity Stream & Slide-Over Audit Drawer
- **Objective**: Surface immutable task activity timeline and organization audit log queries in slide-over drawer.
- **Linked User Stories**: `US-AUDIT-001`, `US-AUDIT-002`, `US-ACT-001`
- **Linked PRD Features**: `TG-AUD-001`, `TG-AUD-002`, `TG-ACT-001`
- **Priority**: Medium (P2)
- **Status**: Verified in Baseline / Expansion Required
- **Affected Files**: [backend/src/controllers/audit.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/audit.controller.js), `frontend/src/components/ActivityTimeline.jsx`
- **Implementation Steps**:
  1. Query existing `AuditLog` filtered by `entity = 'Task'` and `entityId = :taskId`.
  2. Format chronological timeline items (e.g., "John moved card to In Progress 2h ago").
  3. Render activity feed tab inside task detail drawer.
- **Data/API Impact**: Read-only queries against existing `AuditLog` table.
- **Security Considerations**: Tenant isolation strictly verified on audit queries.
- **Dependencies & Blockers**: TASK-204.
- **Test Plan**: Test verifying that updating a task automatically creates an audit entry and shows in activity timeline.
- **Acceptance Criteria**: Activity timeline displays mutation history accurately.
- **Definition of Done**: Component connected to audit API.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Zero risk.

#### Task ID: TASK-304 — Real-Time Notification & Activity Dispatch Pipeline (Transport-Independent)
- **Objective**: Build internal event emitter pipeline that dispatches notification events when tasks, comments, or memberships mutate.
- **Linked User Stories**: `US-NOTIF-001`, `US-NOTIF-002`
- **Linked PRD Features**: `TG-NOTIF-001`, `TG-NOTIF-002`
- **Priority**: Medium (P2)
- **Status**: Implementation Required
- **Affected Files**: `backend/src/services/event-dispatcher.service.js`, `frontend/src/components/NotificationBell.jsx`
- **Implementation Steps**:
  1. Build decoupled in-process `EventEmitter` dispatching structured workspace events (`task:created`, `comment:added`).
  2. Persist notification rows to database for offline recipients.
  3. Connect in-app notification bell with unread badge counter.
- **Data/API Impact**: Adds `Notification` table via migration.
- **Security Considerations**: Notifications filtered strictly by organization and recipient permissions.
- **Dependencies & Blockers**: TASK-302.
- **Test Plan**: Unit test verifying notification row creation on task assignment.
- **Acceptance Criteria**: Unread counter increments; mark-as-read clears counter.
- **Definition of Done**: Dispatcher and bell UI operational.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

---

### Phase 4: Workspace Utility, Navigation, Files & Accessibility

#### Task ID: TASK-401 — Global Command Palette (`Cmd/Ctrl+K`) Multi-Entity Search
- **Objective**: Implement global command palette modal responding to keyboard shortcut with cross-entity search and arrow navigation.
- **Linked User Stories**: `US-CMD-001`, `US-CMD-002`
- **Linked PRD Features**: `TG-CMD-001`, `TG-CMD-002`
- **Priority**: Medium (P2)
- **Status**: Implementation Required
- **Affected Files**: `frontend/src/components/CommandPaletteModal.jsx`, `backend/src/controllers/search.controller.js`
- **Implementation Steps**:
  1. Register global window keydown listener for `Cmd+K` / `Ctrl+K`.
  2. Build `GET /api/search?q=:term` executing parallel tenant queries across projects, tasks, and members.
  3. Implement arrow key selection and Enter navigation in modal dialog.
- **Data/API Impact**: Fast search endpoint with index optimization.
- **Security Considerations**: Search results strictly limited to caller's active organization.
- **Dependencies & Blockers**: TASK-201, TASK-203.
- **Test Plan**: E2E test verifying `Cmd+K` opens modal and searching navigates to task.
- **Acceptance Criteria**: Modal opens instantly (<50ms); keyboard navigation works flawlessly.
- **Definition of Done**: Command palette component operational in AppShell.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-402 — Workspace Release Calendar Grid
- **Objective**: Build monthly calendar grid displaying tasks on due dates with month navigation and "Today" reset.
- **Linked User Stories**: `US-CAL-001`, `US-CAL-002`
- **Linked PRD Features**: `TG-CAL-001`, `TG-CAL-002`
- **Priority**: Medium (P2)
- **Status**: Implementation Required
- **Affected Files**: `frontend/src/views/CalendarView.jsx`
- **Implementation Steps**:
  1. Build month grid layout rendering 7 columns (Mon–Sun).
  2. Map tasks to calendar day cells based on `dueDate`.
  3. Add header controls for prev/next month navigation and "Today" quick reset.
- **Data/API Impact**: Consumes existing `GET /api/tasks` with date range filters.
- **Security Considerations**: Standard tenant scoping.
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: Component test verifying task appears in correct calendar day cell.
- **Acceptance Criteria**: Month grid renders correctly across leap years and month transitions.
- **Definition of Done**: Calendar view operational in main navigation.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-403 — In-App Notification Center, Dashboard KPI Cards & Preferences
- **Objective**: Complete Dashboard KPI cards, 48h urgent task feeds, activity heatmaps, and notification subscription settings.
- **Linked User Stories**: `US-DASH-001`–`US-DASH-006`, `US-NOTIF-003`
- **Linked PRD Features**: `TG-DASH-001`–`TG-DASH-006`, `TG-NOTIF-003`
- **Priority**: High (P1)
- **Status**: Verified in Baseline / Expansion Required
- **Affected Files**: [frontend/src/views/DashboardView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/views/DashboardView.jsx), [backend/src/controllers/dashboard.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/dashboard.controller.js)
- **Implementation Steps**:
  1. Optimize KPI aggregation queries (Projects, Tasks, Members, Storage).
  2. Ensure 48h urgent tasks query uses indexed `dueDate` comparisons.
  3. Render 90-day contribution heatmap and user notification preferences toggle.
- **Data/API Impact**: Dashboard summary endpoints.
- **Security Considerations**: All aggregations partitioned by `organizationId`.
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: API test asserting dashboard KPIs match actual database counts.
- **Acceptance Criteria**: Dashboard loads within <200ms; heatmap renders cleanly.
- **Definition of Done**: Dashboard fully responsive and verified.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-404 — Global Accessibility Shortcuts, Focus Trapping & WCAG AA Compliance
- **Objective**: Enforce WCAG AA 4.5:1 text contrast, visible focus rings, focus trapping in modal/drawer dialogs. *Note: Account profile & security settings (`TG-ACC-001`) are owned by `TASK-005`.*
- **Linked User Stories**: `US-A11Y-001`, `US-A11Y-002`, `US-A11Y-003`
- **Linked PRD Features**: `TG-A11Y-001`, `TG-A11Y-002`, `TG-A11Y-003`
- **Priority**: High (P1)
- **Status**: Partially Implemented / Expansion Required
- **Affected Files**: [frontend/src/index.css](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/index.css), `frontend/src/hooks/useFocusTrap.js`, [frontend/src/views/AccountPage.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/views/AccountPage.jsx)
- **Implementation Steps**:
  1. Implement `useFocusTrap` hook trapping Tab key inside open modals and drawers.
  2. Audit all color tokens in `index.css` to guarantee 4.5:1 contrast against dark backgrounds.
  3. Add `aria-modal="true"`, `role="dialog"`, and accessible button labels across console.
  4. Ensure AccountPage password updates require current password confirmation.
- **Data/API Impact**: Account profile update endpoint (`PATCH /api/users/me`).
- **Security Considerations**: Password update requires current password re-entry.
- **Dependencies & Blockers**: TASK-204, TASK-401.
- **Test Plan**: Automated axe-core accessibility scan returning zero critical or serious violations.
- **Acceptance Criteria**: Focus trapped in dialogs; keyboard navigation passes automated audit.
- **Definition of Done**: WCAG AA verification sign-off completed.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-405 — File Asset Directory, Project Association & Bulk Metadata Operations
- **Objective**: Provide comprehensive file asset directory listing, project filtering, multi-row selection, floating bulk action dock (duplicate, delete), and task attachment linking.
- **Linked User Stories**: `US-FILE-001`, `US-FILE-002`, `US-FILE-003`, `US-FILE-004`, `US-FILE-005`
- **Linked PRD Features**: `TG-FILE-001`, `TG-FILE-002`, `TG-FILE-003`, `TG-FILE-004`, `TG-FILE-005`
- **Priority**: Medium (P2)
- **Status**: Verified in Baseline / Expansion Required
- **Affected Files**: [backend/src/controllers/files.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/files.controller.js), [frontend/src/views/FilesView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/views/FilesView.jsx), `frontend/src/components/FloatingBulkDock.jsx`
- **Implementation Steps**:
  1. Optimize `GET /api/v1/files` with project filtering and pagination.
  2. Connect multi-select checkboxes to floating bottom action dock.
  3. Implement bulk duplicate endpoint appending "(Copy)" suffix to names.
  4. Implement bulk delete endpoint guarded by `files:delete` permission.
  5. Connect task attachment association foreign key.
- **Data/API Impact**: Manages `FileAsset` database rows and `Task` associations.
- **Security Considerations**: Strict tenant isolation; cross-tenant file access blocked.
- **Dependencies & Blockers**: TASK-201, TASK-203.
- **Test Plan**: Automated integration tests covering file listing, project filter, bulk duplicate, and bulk delete transactions.
- **Acceptance Criteria**: Files directory displays correctly; floating bulk dock executes batch operations atomically.
- **Definition of Done**: File management endpoints and UI verified.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

---

### Phase 5: Provisional Implementation of Blocked Features (Awaiting Ratification)

> [!WARNING]
> **Governance Quarantine**: Tasks TASK-501 through TASK-507 are formally quarantined under **Release Track B**. No production code or irreversible migrations may be deployed until stakeholder decisions are ratified in [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md).

#### Task ID: TASK-501 (Blocked) — Platform Super Admin Governance & Break-Glass Recovery
- **Objective**: Build platform operator tenant overview and audited break-glass recovery.
- **Linked User Stories**: `US-PLAT-001`, `US-PLAT-002`
- **Linked PRD Features**: `TG-PLAT-001`
- **Priority**: Medium (P2)
- **Status**: Blocked by Product Decision UD-001
- **Affected Files**: `backend/src/controllers/platform.controller.js`, `frontend/src/views/PlatformAdminView.jsx`
- **Provisional Specification**:
  - Enforce server-side MFA step-up verification token (`x-mfa-token`, 5m TTL, single-use nonce).
  - Validate active ITSM ticket ID format (`/^TG-[0-9]{4,8}$/`).
  - Action scope strictly limited to owner re-assignment; customer task/file browsing forbidden.
  - Time-bounded session token (max 60m TTL, non-renewable).
  - Write immutable `PlatformAuditLog` record with hash-chaining (`prevLogHash`). If alert delivery fails, action rolls back.
- **Dependencies & Blockers**: **UD-001 Ratification Required**.
- **Effort Estimate Range**: M–L (3–5 business days).

#### Task ID: TASK-502 (Blocked) — Persistent S3-Compatible Object Storage Engine & Quotas
- **Objective**: Ingest file binaries via S3 presigned URLs with server-side HeadObject validation and quota tracking.
- **Linked User Stories**: `US-STOR-001`
- **Linked PRD Features**: `TG-STOR-001`, `TG-FILE-005`
- **Priority**: High (P1)
- **Status**: Blocked by Product Decision UD-002
- **Affected Files**: `backend/src/services/storage.service.js`, `backend/src/controllers/files.controller.js`
- **Provisional Specification**:
  - Presigned PUT URL generated with 15m expiration and sanitized RFC 5987 filename.
  - Confirmation endpoint `POST /api/files/confirm` executes AWS S3 `HeadObjectCommand` to verify existence, byte size <= quota, permitted MIME type, and tenant path prefix (`tenants/{orgId}/projects/{projId}/files/`) before inserting `FileAsset`.
  - Quota concurrency enforced via row-level locking (`SELECT remainingStorageBytes ... FOR UPDATE`).
  - S3 lifecycle rule purges incomplete multipart uploads after 24h; cron cleans up orphaned objects.
- **Dependencies & Blockers**: **UD-002 Ratification Required**.
- **Effort Estimate Range**: M–L (3–5 business days).

#### Task ID: TASK-503 (Blocked) — Real-Time State Synchronization via Authenticated Fetch Streams / SSE
- **Objective**: Deliver multi-client real-time Kanban updates via SSE using an authenticated fetch streaming client.
- **Linked User Stories**: `US-SYNC-001`, `US-SYNC-002`
- **Linked PRD Features**: `TG-SYNC-001`
- **Priority**: Medium (P2)
- **Status**: Blocked by Product Decision UD-003
- **Affected Files**: `backend/src/controllers/sync.controller.js`, `frontend/src/services/eventStream.js`
- **Provisional Specification**:
  - Unidirectional SSE stream (`GET /api/v1/events/stream`) authenticated via Bearer JWT and `x-organization-id` headers using `@microsoft/fetch-event-source`.
  - Clean stream cancellation via `AbortController` on unmount or workspace switch.
  - Client invalidates React Query cache on event receipt; smart polling fallback.
- **Dependencies & Blockers**: **UD-003 Ratification Required**.
- **Effort Estimate Range**: M–L (3–4 business days).

#### Task ID: TASK-504 (Blocked) — TipTap Rich Text Editor Integration
- **Objective**: Integrate TipTap / ProseMirror rich text WYSIWYG editor for task descriptions and comments.
- **Linked User Stories**: `US-COLLAB-004`
- **Linked PRD Features**: `TG-EDT-001`
- **Priority**: Low (P3)
- **Status**: Blocked by Product Decision UD-004
- **Affected Files**: `frontend/src/components/RichTextEditor.jsx`
- **Provisional Specification**:
  - Ingest JSON Prosemirror document schema; sanitize HTML via DOMPurify; CSP compliance.
- **Dependencies & Blockers**: **UD-004 Ratification Required**.
- **Effort Estimate Range**: S–M (2–3 business days).

#### Task ID: TASK-505 (Blocked) — Transactional Email Member Invitations & Expiration Lifecycle
- **Objective**: Dispatch email invitations via Resend API with 7-day token expiration and recipient identity match.
- **Linked User Stories**: `US-INV-001`, `US-INV-002`, `US-INV-003`
- **Linked PRD Features**: `TG-INV-001`
- **Priority**: High (P1)
- **Status**: Blocked by Product Decision UD-005
- **Affected Files**: `backend/src/controllers/invitations.controller.js`, `backend/src/services/email.service.js`
- **Provisional Specification**:
  - Resend transactional email API dispatching cryptographically random invitation token.
  - Acceptance validates that authenticated account email matches invitation recipient.
- **Dependencies & Blockers**: **UD-005 Ratification Required**.
- **Effort Estimate Range**: M (3 business days).

#### Task ID: TASK-506 (Blocked) — Task Creator vs. Assignee Permission Bifurcation
- **Objective**: Bifurcate task update permissions into discrete `task:update:own` (creator) and `task:update:assigned` (assignee).
- **Linked User Stories**: `US-ABAC-004`
- **Linked PRD Features**: `TG-ABAC-001`
- **Priority**: High (P1)
- **Status**: Blocked by Product Decision (Task Update Policy DP-TASK-001)
- **Affected Files**: [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js)
- **Provisional Specification**:
  - Introduce discrete permission codename and evaluate in ABAC policy engine.
- **Dependencies & Blockers**: **DP-TASK-001 Ratification Required**.
- **Effort Estimate Range**: S–M (1–2 business days).

#### Task ID: TASK-507 (Blocked) — Compliance & Velocity Reporting CSV Export
- **Objective**: Stream organization task velocity and security audit history as CSV downloads.
- **Linked User Stories**: `US-REP-001`
- **Linked PRD Features**: `TG-REP-001`
- **Priority**: Low (P3)
- **Status**: Blocked by Product Decision (Reporting Scope DP-REP-001)
- **Affected Files**: `backend/src/controllers/reports.controller.js`
- **Provisional Specification**:
  - Server streams database records as CSV with `Content-Type: text/csv`.
- **Dependencies & Blockers**: **DP-REP-001 Ratification Required**.
- **Effort Estimate Range**: S–M (2 business days).

---

### Phase 6: Production Packaging, Infrastructure & Release Verification

#### Task ID: TASK-601 — Database Migration Staging, Forward Verification & Point-in-Time Restore
- **Objective**: Validate Prisma schema migration pipelines, tested forward migrations, foreign key cascades, and point-in-time restore procedures in staging environment.
- **Linked User Stories**: Operational Data Integrity across all modules
- **Linked PRD Features**: `TG-TENANT-001`, `TG-RBAC-001`
- **Priority**: Critical (P0)
- **Status**: Implementation Required
- **Affected Files**: `backend/prisma/migrations/`, [backend/prisma/schema.prisma](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/schema.prisma), `backend/scripts/restore-backup.sh`
- **Implementation Steps**:
  1. Execute forward migrations against staging PostgreSQL instance; verify zero schema drift via `prisma migrate diff`.
  2. Test point-in-time backup and restore scripts.
  3. Validate foreign key cascade behavior during tenant deletion in staging environment.
- **Data/API Impact**: Confirms database integrity.
- **Security Considerations**: Defends against data loss and orphan records.
- **Dependencies & Blockers**: TASK-301, TASK-302.
- **Test Plan**: Execute migration roll-forward and backup restoration in ephemeral PostgreSQL container.
- **Acceptance Criteria**: Migrations apply cleanly; point-in-time backup restores without data loss.
- **Definition of Done**: DB scripts documented and verified.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-602 — Production Multi-Stage Dockerfile & Container Optimization
- **Objective**: Author hardened, multi-stage Dockerfiles for backend API and frontend Vite static assets with non-root execution.
- **Linked User Stories**: Operational Deployment across all modules
- **Linked PRD Features**: Deployment baseline
- **Priority**: High (P1)
- **Status**: Implementation Required
- **Affected Files**: `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.prod.yml`
- **Implementation Steps**:
  1. Author multi-stage build: builder stage compiles dependencies; production stage runs non-root (`USER node`).
  2. Serve frontend static assets via lightweight NGINX container with gzip/brotli compression.
  3. Verify container image size (<150 MB for backend) and vulnerability scan (Trivy).
- **Data/API Impact**: Deployment packaging.
- **Security Considerations**: Non-root container execution; minimal attack surface.
- **Dependencies & Blockers**: TASK-004.
- **Test Plan**: Build and launch containers via `docker-compose -f docker-compose.prod.yml up`.
- **Acceptance Criteria**: Containers boot cleanly, pass health check, and serve traffic.
- **Definition of Done**: Dockerfiles committed and image build passes in CI.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-603 — CI/CD Quality Gates, E2E Regression Suite & Final Release Verification
- **Objective**: Establish automated GitHub Actions CI pipeline running linter, typecheck, unit tests, negative security tests, and E2E regression.
- **Linked User Stories**: Release Verification across all 68 Track A stories
- **Linked PRD Features**: All Core Features
- **Priority**: Critical (P0)
- **Status**: Implementation Required
- **Affected Files**: `.github/workflows/ci.yml`, `frontend/e2e/release-journey.spec.js`
- **Implementation Steps**:
  1. Set up GitHub Actions CI executing on every push and pull request.
  2. Execute unit tests, integration tests, and Playwright end-to-end user journeys.
  3. Require 100% green pass on all checks prior to production release tag creation.
- **Data/API Impact**: CI pipeline configuration.
- **Security Considerations**: Enforces RCG-6 and RCG-7 release gates.
- **Dependencies & Blockers**: TASK-601, TASK-602.
- **Test Plan**: Run full CI pipeline and verify automated green status badge.
- **Acceptance Criteria**: Full test suite passes; zero skips; release checklist executed.
- **Definition of Done**: CI pipeline operational and blocking broken pull requests.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

---

## Section 11 — Dependencies and Critical Path Analysis

### 11.1 Reconciled Task Dependency Graph

```
┌────────────────────────────────────────────────────────┐
│  Phase 0: Baseline Hardening & Defect Remediation      │
│  TASK-001 (Tenant Scoping) ──> TASK-002 (Task Fields) │
│       │                                │               │
│       v                                v               │
│  TASK-003 (Cache Purge)    TASK-004 (Baseline Security)│
│       │                                │               │
│       v                                v               │
│  TASK-005 (Token Rotation) ──> TASK-006 (Neg. Tests)  │
└──────────────────────┬─────────────────────────────────┘
                       │
                       v
┌────────────────────────────────────────────────────────┐
│  Phase 1: Organization, Membership & RBAC Admin        │
│  TASK-101 (Member Dir) ──> TASK-102 (Matrix & Lockout)│
│                                │                       │
│                                v                       │
│  TASK-103 (Custom Roles) ──> TASK-104 (Delegation Bar) │
└──────────────────────┬─────────────────────────────────┘
                       │
                       v
┌────────────────────────────────────────────────────────┐
│  Phase 2: Core Workflows: Projects & Tasks             │
│  TASK-201 (Project CRUD) ──> TASK-202 (Keys/Progress)  │
│       │                                                │
│       v                                                │
│  TASK-203 (Task CRUD & ABAC) ──> TASK-204 (Drawer/DND) │
│       │                                │               │
│       v                                v               │
│  TASK-206 (Search & Filters)   TASK-205 (List & Table) │
└──────────────────────┬─────────────────────────────────┘
                       │
                       v
┌────────────────────────────────────────────────────────┐
│  Phase 3: Collaboration, Subtasks & Activity           │
│  TASK-301 (Subtasks) ──> TASK-302 (Comments & Window)  │
│       │                                │               │
│       v                                v               │
│  TASK-303 (Activity Timeline)  TASK-304 (Dispatcher)  │
└──────────────────────┬─────────────────────────────────┘
                       │
                       v
┌────────────────────────────────────────────────────────┐
│  Phase 4: Workspace Utility, Files & Accessibility     │
│  TASK-401 (Command Palette)   TASK-402 (Calendar)      │
│       │                                │               │
│       v                                v               │
│  TASK-403 (Dashboard & Notif) TASK-404 (WCAG AA & Acc) │
│                                        │               │
│                                        v               │
│                               TASK-405 (Files Bulk)    │
└──────────────────────┬─────────────────────────────────┘
                       │
                       v
┌────────────────────────────────────────────────────────┐
│  Phase 6: Production Packaging, Docker & CI Gates      │
│  TASK-601 (DB Staging Migrations)                      │
│       │                                                │
│       v                                                │
│  TASK-602 (Docker Containers) ──> TASK-603 (CI/E2E Gate)│
└────────────────────────────────────────────────────────┘
```

### 11.2 Provisional Critical Path & Duration Analysis
- **Phase 0 (Hardening)**: 3 business days (TASK-001 -> TASK-002 -> TASK-004 -> TASK-006)
- **Phase 1 (RBAC/Orgs)**: 4 business days (TASK-101 -> TASK-102 -> TASK-103 -> TASK-104)
- **Phase 2 (Workflows)**: 6 business days (TASK-201 -> TASK-203 -> TASK-204 -> TASK-205)
- **Phase 3 (Collaboration)**: 4 business days (TASK-301 -> TASK-302 -> TASK-304)
- **Phase 4 (Utility/Files/A11y)**: 3 business days (TASK-401 -> TASK-404 -> TASK-405)
- **Phase 6 (Deployment)**: 4 business days (TASK-601 -> TASK-602 -> TASK-603)
- **Total Track A Critical Path Duration**: **24 business days** (~5 calendar weeks).
  *(Note: Provisional planning estimate assuming 1–2 full-time senior engineers; subject to validation during sprint execution).*

---

## Section 12 — Testing and Quality Strategy

### 12.1 Four-Tier Evidence Model
All verification claims must cite an explicit evidence tier:
- `TIER-1: CODE_INSPECTED` (Source code / configuration verified)
- `TIER-2: TEST_VERIFIED` (Passing test execution evidence)
- `TIER-3: RUNTIME_VERIFIED` (Local running development server verified)
- `TIER-4: PROD_VERIFIED` (Production staging environment verified)

### 12.2 Test Suites Structure
1. **Unit Tests**:
   - Permission resolution engine (`rbac.middleware.js`).
   - Token family rotation and reuse detection (`token.service.js`).
   - Uniform credential error format (`auth.service.js`).
2. **API Integration Tests**:
   - Explicit `x-organization-id` validation (400 on missing/malformed, 403 on unjoined).
   - Protected task fields mutation rejection across payload shapes, casing, query params.
   - Super Admin lockout guard (403 on permission revocation).
   - Privilege delegation barrier (403 on unauthorized custom role creation).
3. **End-to-End User Journeys (Playwright)**:
   - Critical path: User register -> create project -> create task -> drag to In Progress -> open drawer -> add subtask -> logout.
   - Workspace switch cache purge: ensure Org A cards do not persist into Org B view.
   - WCAG AA accessibility: automated axe-core scanning on all views.

---

## Section 13 — Database, Schema & API Evolution Strategy

### 13.1 Schema Evolution & Staged Migrations
The active database schema contains **12 models**. To prevent downtime and data loss, schema evolution proceeds across 3 non-breaking staged migrations:
1. **Migration 1 (Phase 3 — Subtask Schema)**:
   - Add `Subtask` table with foreign key `taskId` (cascade delete on task).
2. **Migration 2 (Phase 3/4 — Collaboration Schema)**:
   - Add `Comment` table (`taskId`, `authorId`, `content`, `editedAt`).
   - Add `Notification` table (`recipientId`, `type`, `data`, `readAt`).
3. **Migration 3 (Phase 5 — Enterprise Expansion Schema, Post-Ratification)**:
   - Add `PlatformAuditLog` table and `isPlatformAdmin` boolean flag on `User`.
   - Add `Invitation` table (`email`, `token`, `expiresAt`, `organizationId`).

### 13.2 API Contract Integrity & Versioning
All endpoints adhere to `/api/v1/*` REST conventions:
- Strict JSON request and response payloads.
- Uniform error responses adhering to RFC 7807:
  ```json
  {
    "error": "Access denied: you cannot modify protected governance fields",
    "code": "PROTECTED_FIELD_MUTATION",
    "details": { "forbiddenFields": ["projectId", "creatorId"] }
  }
  ```

---

## Section 14 — Deployment, Infrastructure & Operational Readiness

### 14.1 Production Secret Vault Injection
- Strictly prohibit secrets in Git repositories.
- Production environment variables (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) injected at container startup via cloud secret vaults (AWS Secrets Manager, Doppler, or Infisical).

### 14.2 Container Optimization & Non-Root Execution
- Node.js backend container executes under unprivileged `USER node` (UID 1000).
- Frontend served as static HTML/JS bundle via NGINX with gzip/brotli compression and long-lived caching headers for fingerprinted assets.

---

## Section 15 — Risk Management, Mitigations & Rollback Strategy

| Risk ID | Risk Description | Severity | Probability | Mitigation Strategy | Rollback Mechanism |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **RSK-01** | Strict tenant header enforcement breaks legacy frontend components | High | Low | Audit all API client interceptors in Phase 0; ensure `x-organization-id` is attached to every request. | Revert middleware git commit; temporary debug logging. |
| **RSK-02** | Stored XSS in task comments or descriptions | High | Low | Enforce server-side DOMPurify sanitization before database persistence; Content Security Policy header. | Strip HTML tags via migration script; tighten CSP. |
| **RSK-03** | Stale cache cross-tenant leakage in browser | Critical | Low | Comprehensive cache purge on workspace switch (`queryClient.clear()`); verified via automated Playwright tests. | Force hard reload on organization switch. |
| **RSK-04** | Database migration failure during deployment | High | Low | Staged tested forward migrations; point-in-time backup restore verified in staging. | Revert via forward-correcting migration; restore snapshot. |

---

## Section 16 — Release Gates & Definition of Done

### 16.1 Track A (Core v1.0 Release) Exit Gate
Release candidate promotion requires:
1. **100% Verification of Core Scope**: All 68 Core Stories (Phases 0–4) verified with evidence at `TIER-2` (Automated Test Pass) or higher.
2. **Release-Critical Invariants Signed Off**: Checks `SEC-01` through `SEC-10` in [teamguard-release-checklist.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-release-checklist.md) marked PASS.
3. **Zero High/Critical Vulnerabilities**: Static analysis (npm audit, Trivy) clean.
4. **Automated Test Suite Pass**: 100% pass across unit, integration, and E2E regression suites.
5. **Phase 5 Exclusion Waiver** `[STATUS: PENDING]`: A formal stakeholder release waiver must be executed documenting Phase 5 features (`SEC-11`, `SEC-12`) as excluded from Core v1.0 release. The waiver must record: **Approver name**, **Approval date**, **Scope** (list of excluded story IDs and feature IDs), and an **Evidence reference** (document path or ticket ID). Release candidate promotion is blocked until this gate is signed.

### 16.2 Track B (Enterprise Expansion Release) Exit Gate
Activated only after stakeholder decisions UD-001 through UD-005 are formally ratified and Phase 5 tasks TASK-501 through TASK-507 pass all applicable acceptance criteria.

---

## Section 17 — Story-to-Task Traceability Summary

| Functional Module | User Story Count | PRD Feature Count | Implementation Status Breakdown | Assigned Engineering Tasks |
| :--- | :---: | :---: | :--- | :--- |
| **Authentication & Accounts** | 5 | 5 | 5 Verified | `TASK-003`, `TASK-004`, `TASK-005` |
| **Multi-Tenant Organizations** | 5 | 4 | 5 Verified | `TASK-001`, `TASK-003`, `TASK-004`, `TASK-006`, `TASK-101`, `TASK-102` |
| **Platform Administration** | 2 | 1 | 2 Blocked (UD-001) | `TASK-501 (Blocked)` |
| **Invitations & Onboarding** | 5 | 1 | 2 Planned, 3 Blocked (UD-005) | `TASK-101`, `TASK-505 (Blocked)` |
| **RBAC Administration** | 7 | 8 | 4 Verified, 3 Planned | `TASK-102`, `TASK-103`, `TASK-104` |
| **ABAC & Policy Engine** | 4 | 3 | 2 Verified, 1 Planned, 1 Blocked | `TASK-002`, `TASK-203`, `TASK-506 (Blocked)` |
| **Project Management** | 5 | 5 | 1 Verified, 4 Planned | `TASK-201`, `TASK-202` |
| **Task Management** | 10 | 10 | 5 Verified, 5 Planned | `TASK-203`, `TASK-204`, `TASK-205`, `TASK-206` |
| **Subtask Hierarchy** | 2 | 2 | 2 Planned | `TASK-301` |
| **Collaboration & Comments** | 4 | 4 | 3 Planned, 1 Blocked (UD-004) | `TASK-302`, `TASK-504 (Blocked)` |
| **Audit Logs & Compliance** | 2 | 2 | 2 Verified | `TASK-303` |
| **Activity Feeds** | 1 | 1 | 1 Planned | `TASK-303` |
| **File Management** | 5 | 5 | 1 Verified, 3 Partial, 1 Planned | `TASK-405` |
| **Storage Engine** | 1 | 1 | 1 Blocked (UD-002) | `TASK-502 (Blocked)` |
| **Dashboard & Metrics** | 6 | 6 | 6 Verified | `TASK-403` |
| **Calendar & Timeline** | 2 | 2 | 2 Planned | `TASK-402` |
| **Notifications** | 3 | 3 | 3 Planned | `TASK-304`, `TASK-403` |
| **Command Palette** | 2 | 2 | 2 Planned | `TASK-401` |
| **Accessibility (WCAG AA)** | 3 | 3 | 1 Verified, 2 Partially Implemented | `TASK-404` |
| **Account Management** | 1 | 1 | 1 Verified | `TASK-005` |
| **Reporting & Analytics** | 1 | 1 | 1 Blocked (Reporting Scope) | `TASK-507 (Blocked)` |
| **Developer Tooling** | 1 | 1 | 1 Verified | `TASK-006` |
| **State Synchronization** | 2 | 1 | 2 Blocked (UD-003) | `TASK-503 (Blocked)` |
| **TOTALS RECONCILED** | **79 Stories** | **60 Features** | **31 Verified, 5 Partial, 32 Planned, 11 Blocked** | **35 Tasks across 7 Phases (32 Story-Linked + 3 Operational)** |

---

## Section 18 — Open Questions & Stakeholder Action Items

Prior to expanding into Phase 5, stakeholder sign-off is required on the 7 architectural decisions in [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md):
1. **UD-001**: Approve Unified Application with Operator Context & MFA Step-Up for platform administration.
2. **UD-002**: Ratify S3-compatible cloud storage provider (Cloudflare R2 or AWS S3) with server-side HeadObject validation.
3. **UD-003**: Approve Server-Sent Events via authenticated fetch streaming client for real-time broadcasts.
4. **UD-004**: Approve TipTap / ProseMirror rich text editor with strict DOMPurify sanitization.
5. **UD-005**: Ratify Resend transactional email API with 7-day token link fallback for invitations.
6. **DP-TASK-001**: Approve discrete permission bifurcation (`task:update:own` vs. `task:update:assigned`).
7. **DP-REP-001**: Confirm Phase 1 CSV export scope for task velocity and audit logs.

---

## Section 19 — Final Planning Recommendations

1. **Immediate Execution Priority**: Begin implementation with **Phase 0: Baseline Hardening & Defect Remediation** (`TASK-001` through `TASK-006`). Remediating the implicit tenant fallback, task field mutation gap, and deploying baseline Helmet headers and rate limiting eliminates foundational security liabilities before new feature code is written.
2. **Release Track Separation**: Execute Core Release Track A (Phases 0–4 + Phase 6) to deliver a rock-solid, production-ready work management platform covering all 68 core stories.
3. **Formal Decision Governance**: Treat Phase 5 tasks as strictly blocked until stakeholder sign-off is recorded in the Decision Register.

---
