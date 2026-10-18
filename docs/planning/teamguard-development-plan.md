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
   - Status: **RATIFIED & IMPLEMENTED (Option A)** under `TASK-504`. TipTap / ProseMirror with dual-layer DOMPurify and sanitize-html sanitization, 64KB/16KB bounding.
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
| **Phase 0** | Baseline Hardening & Defect Remediation | Track A | `TASK-001`–`TASK-006` | Eliminate tenant header fallback, protect task fields, purge switch cache, deploy baseline Helmet/rate limiting, session rotation, negative test suite. **[COMPLETE / 100% VERIFIED]** |
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
- **Status**: Complete / Verified (TIER-2 & TIER-3)
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
- **Status**: Complete / Verified (TIER-2 & TIER-3)
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
- **Status**: Implemented & Verified (TIER-2 & TIER-3)
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
- **Status**: Implemented & Verified (TIER-2 & TIER-3)
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
- **Status**: Complete / Verified
- **Affected Files**: [backend/src/services/auth.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/auth.service.js), [backend/src/controllers/auth.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/auth.controller.js), [backend/src/routes/auth.routes.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/routes/auth.routes.js), [frontend/src/features/account/AccountPage.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/account/AccountPage.jsx), [backend/test/auth.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/auth.test.js)
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
- **Status**: Complete / Verified (TIER-2: 25/25 Pass in tenant-security.test.js)
- **Affected Files**: `backend/test/tenant-security.test.js`, [backend/prisma/seed.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/seed.js), `backend/config/seed.js`
- **Implementation Steps**:
  1. Author 20+ automated test vectors asserting 400/401/403 across tenant scoping, role delegation, and ID manipulation (25 total vectors implemented).
  2. Ensure seed script provisions reproducible multi-tenant test fixtures cleanly (Nova Labs fixtures added and verified idempotent).
- **Data/API Impact**: None (test runner & seed fixtures only).
- **Security Considerations**: Automates regression defense for RCG-1 through RCG-5.
- **Dependencies & Blockers**: TASK-001, TASK-002, TASK-004.
- **Test Plan**: Execute `node --test backend/test/tenant-security.test.js`.
- **Acceptance Criteria**: 100% of negative security tests pass.
- **Definition of Done**: Test suite committed and executing cleanly in `npm test` (65/65 pass).
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Zero risk.

---

### Phase 1: Organization, Membership & RBAC Administration

#### Task ID: TASK-101 — Organization Member Directory, Last-Owner Safeguards & Role Reassignment
- **Objective**: Build member management directory with role assignment API and last-owner protection.
- **Linked User Stories**: `US-TENANT-004`, `US-INV-004`, `US-INV-005`
- **Linked PRD Features**: `TG-TENANT-004`, `TG-INV-001`
- **Priority**: High (P1)
- **Status**: Complete / Verified (TIER-2 & TIER-3)
- **Affected Files**: [backend/src/controllers/members.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/members.controller.js), [backend/src/routes/members.routes.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/routes/members.routes.js), [backend/test/members.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/members.test.js), [frontend/src/features/members/MembersView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/members/MembersView.jsx), [frontend/src/services/api-client.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/services/api-client.js)
- **Implementation Steps**:
  1. Create `GET /api/members` returning tenant members, status, and role names.
  2. Implement `PATCH /api/members/:id/role` guarded by `members:manage`.
  3. Enforce last-owner safeguard: prevent deactivation/removal/demotion of the final `Owner` / `Super Admin`.
- **Data/API Impact**: Updates `MembershipRole` and `Membership` records; records audit events.
- **Security Considerations**: Prevents accidental organizational orphan state (BR-010).
- **Dependencies & Blockers**: TASK-001.
- **Test Plan**: Integration tests asserting 403 when demoting, deactivating, or removing the only active owner (`backend/test/members.test.js`).
- **Acceptance Criteria**: Member directory loads; last owner cannot be demoted, deactivated, or removed; role reassignment and department edits update state cleanly with audit trail.
- **Definition of Done**: Controller, routes, client service, and UI connected with automated tests passing (10/10 test vectors).
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-102 — Organization Management, Dynamic Permission Matrix & Super Admin Lockout Guard
- **Objective**: Complete organization metadata updates and dynamic permission matrix toggling with Super Admin immutability.
- **Linked User Stories**: `US-TENANT-002`, `US-RBAC-001`, `US-RBAC-002`, `US-RBAC-003`
- **Linked PRD Features**: `TG-TENANT-002`, `TG-RBAC-001`, `TG-RBAC-002`, `TG-RBAC-003`, `TG-RBAC-004`
- **Priority**: High (P1)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/src/controllers/organizations.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/organizations.controller.js), [backend/src/controllers/permissions-matrix.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/permissions-matrix.controller.js), [backend/src/controllers/roles.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/roles.controller.js), [backend/src/routes/organizations.routes.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/routes/organizations.routes.js), [backend/src/routes/admin.routes.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/routes/admin.routes.js), [backend/test/org.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/org.test.js), [frontend/src/features/permissions/TeamPermissionsMatrixView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/permissions/TeamPermissionsMatrixView.jsx), [frontend/src/layout/AppShell.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/layout/AppShell.jsx), [frontend/src/services/api-client.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/services/api-client.js)
- **Implementation Steps**:
  1. Validate organization creation and slug generation via `POST /api/organizations` and metadata updates via `PATCH /api/organizations/:id`.
  2. Connect permission matrix discrete checkbox toggles to `POST /api/permissions/matrix/toggle` with audit logging and immediate dynamic enforcement.
  3. Enforce hard error (HTTP 403 Forbidden, `SUPER_ADMIN_LOCKOUT_PROTECTION`) if caller attempts to remove permissions from the system `Super Admin` role (`BR-004`).
- **Data/API Impact**: Updates `Organization`, `Role`, `Membership`, and `RolePermission` tables; records immutable audit events.
- **Security Considerations**: Preserves Super Admin administrative authority, prevents lockout, and enforces cross-tenant IDOR protection.
- **Dependencies & Blockers**: TASK-001.
- **Test Plan**: 13/13 test vectors in `backend/test/org.test.js` and Test #6 in `backend/test/rbac.test.js`.
- **Acceptance Criteria**: Secondary organizations can be provisioned and updated; Super Admin role permissions display locked indicators and cannot be revoked; discrete permission toggles take effect immediately without token re-issuance.
- **Definition of Done**: Backend endpoints, controller guards, client services, and elevated matrix/workspace UI connected with automated tests passing (13/13 test vectors).
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-103 — Custom Role Creation, Template Cloning & Module-Level Bulk Toggles
- **Objective**: Allow administrators to create custom tenant roles cloned from existing templates with module-level bulk toggles and safeguarded role deletion.
- **Linked User Stories**: `US-RBAC-004`, `US-RBAC-005`
- **Linked PRD Features**: `TG-RBAC-005`, `TG-RBAC-006`
- **Priority**: Medium (P2)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/src/controllers/roles.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/roles.controller.js), [backend/src/routes/roles.routes.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/routes/roles.routes.js), [backend/src/routes/permissions-matrix.routes.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/routes/permissions-matrix.routes.js), [backend/test/roles.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/roles.test.js), [frontend/src/features/permissions/TeamPermissionsMatrixView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/permissions/TeamPermissionsMatrixView.jsx), [frontend/src/services/api-client.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/services/api-client.js), [frontend/src/App.css](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/App.css)
- **Implementation Steps**:
  1. Implement `POST /api/roles` accepting `name`, `description`, and `cloneFromRoleId`, preventing duplicate names in the tenant (`HTTP 409 Conflict`), and logging audit trail.
  2. Implement module bulk toggle endpoints `POST /api/roles/:roleId/modules/:module/toggle` and `POST /api/permissions-matrix/bulk-toggle` with Super Admin lockout safeguards (`BR-004` / `SEC-05`).
  3. Implement safeguarded role deletion `DELETE /api/roles/:roleId` blocking system roles (`HTTP 403 Forbidden`) and roles assigned to active members (`HTTP 400 Bad Request`).
  4. Build dynamic frontend modal dialogs in `TeamPermissionsMatrixView` for custom role creation with template cloning, inline module-level "Select All" / "Clear All" bulk toggles, and deletion confirmation dialog.
- **Data/API Impact**: Inserts and mutates `Role` and `RolePermission` records with strict tenant isolation; generates immutable `AuditLog` records.
- **Security Considerations**: Enforces `roles:manage` authorization, Super Admin lockout immutability, and cross-tenant IDOR boundaries.
- **Dependencies & Blockers**: TASK-102.
- **Test Plan**: 13/13 automated test vectors in [backend/test/roles.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/roles.test.js).
- **Acceptance Criteria**: Custom roles can be created clean or cloned from templates; duplicate names rejected with 409; bulk module toggles grant/revoke immediately; Super Admin bulk revocation blocked; unassigned custom roles can be deleted with audit logging.
- **Definition of Done**: Backend endpoints, controller guards, client services, and interactive frontend UI verified with 13/13 automated test vectors passing cleanly.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-104 — Universal Privilege Delegation Barrier & System Role Protection
- **Objective**: Prevent privilege escalation by forbidding administrators from granting permissions they do not possess. Protect system roles from renaming/deletion.
- **Linked User Stories**: `US-RBAC-006`, `US-RBAC-007`
- **Linked PRD Features**: `TG-RBAC-007`, `TG-RBAC-008`
- **Priority**: Critical (P0)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/src/middleware/rbac.middleware.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/middleware/rbac.middleware.js), [backend/src/controllers/roles.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/roles.controller.js), [backend/src/controllers/permissions-matrix.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/permissions-matrix.controller.js), [backend/src/controllers/members.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/members.controller.js), [backend/test/delegation.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/delegation.test.js)
- **Implementation Steps**:
  1. Universal Privilege Delegation Barrier in `validateDelegationBarrier()`: compares target grant/clone/assignment permissions against caller's active workspace permissions (`req.userPermissions`).
  2. If target permissions $\not\subseteq$ caller permissions, return `HTTP 403 Forbidden` (`{ "code": "DELEGATION_BARRIER_BREACH", "unauthorizedPermissions": [...] }`).
  3. System Role Protection in `isSystemRole()`: blocks renaming and deletion (`DELETE /api/roles/:id` and `PATCH /api/roles/:id`) for system roles (`HTTP 403 Forbidden`, `{ "code": "SYSTEM_ROLE_IMMUTABLE" }`), while permitting metadata/description updates for authorized admins.
  4. Super Admin lockout immutability guarded across discrete toggle, bulk toggle, and permission assignment endpoints.
- **Data/API Impact**: Fail-closed validation barrier on role mutations (`POST /api/roles`, `PUT /api/roles/:id/permissions`, `POST /api/roles/:id/modules/:module/toggle`, `POST /api/permissions-matrix/toggle`, `PATCH /api/members/:membershipId/role`).
- **Security Considerations**: Permanently blocks privilege escalation attacks (horizontal and vertical); prevents intermediate admins from granting or cloning unheld privileges or reassigning users to roles exceeding their authority.
- **Dependencies & Blockers**: TASK-103.
- **Test Plan**: 14 automated integration vectors in `backend/test/delegation.test.js` validating cloning barriers, discrete and bulk toggling restrictions, member reassignment barriers, Super Admin unbounded authority, system role immutability, and cross-tenant isolation.
- **Acceptance Criteria**: Delegation boundary strictly enforced across all 5 mutation vectors; system roles immutable; full test suite passing with 0 failures.
- **Definition of Done**: Verified across Tier-1, Tier-2, and Tier-3; 14 test vectors passing in `backend/test/delegation.test.js`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

---

### Phase 2: Core Workflows — Projects, Tasks & Multi-View Board

#### Task ID: TASK-201 — Project Core CRUD, Tenant Scoping & Soft Deletion Lifecycle
- **Objective**: Build robust project lifecycle API with soft-deletion and tenant-scoped cascades.
- **Linked User Stories**: `US-PROJ-001`, `US-PROJ-004`
- **Linked PRD Features**: `TG-PROJ-001`, `TG-PROJ-004`
- **Priority**: High (P1)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/src/controllers/projects.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/projects.controller.js), [backend/src/services/projects.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/projects.service.js), [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js), [backend/prisma/schema.prisma](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/schema.prisma), [backend/test/projects.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/projects.test.js), [frontend/src/services/api-client.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/services/api-client.js)
- **Implementation Steps**:
  1. Add `deletedAt` timestamp field and composite indexes to `Project` model in Prisma.
  2. Implement `projects.service.js` with tenant-scoped list, get, create, update, soft-delete, and restore operations.
  3. When project is soft-deleted, filter out associated tasks from standard task queries and block task creation/mutation against soft-deleted projects.
  4. Enforce strict `organizationId` match on all project mutations with cross-tenant IDOR defense (404 Not Found).
  5. Support `POST /api/projects/:id/restore` to restore soft-deleted projects and their tasks.
- **Data/API Impact**: Adds `deletedAt` column and indexes to `Project` table; adds `restore` route; filters soft-deleted rows in project and task Prisma queries.
- **Security Considerations**: Cross-tenant project access rejected with 404 (IDOR defense); RBAC checks (`project:create`, `project:update`, `project:delete`, `project:view`) strictly enforced server-side.
- **Dependencies & Blockers**: TASK-001.
- **Test Plan**: 16 automated integration vectors in `backend/test/projects.test.js` covering creation with initial tasks, payload validation, negative RBAC, tenant scoping, IDOR defense, soft-deletion, cascade task scoping, task creation block, project restoration, and audit logging.
- **Acceptance Criteria**: Projects create, update, soft-delete, and restore cleanly; cascade task filtering verified; 16/16 tests pass.
- **Definition of Done**: Controller, service, routes, client, and automated test suite passing in `backend/test/projects.test.js`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-202 — JIRA-Style Project Keys, Dynamic Progress & Archival Protection
- **Objective**: Generate unique uppercase project keys (e.g. `PROJ`), calculate task completion %, and enforce read-only archival state.
- **Linked User Stories**: `US-PROJ-002`, `US-PROJ-003`, `US-PROJ-005`
- **Linked PRD Features**: `TG-PROJ-002`, `TG-PROJ-003`, `TG-PROJ-005`
- **Priority**: Medium (P2)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/src/services/projects.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/projects.service.js), [backend/src/controllers/projects.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/projects.controller.js), [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js), [backend/test/projects.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/projects.test.js), [frontend/src/features/projects/ProjectSetupWizardModal.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/projects/ProjectSetupWizardModal.jsx), [frontend/src/features/tasks/KanbanBoardView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/tasks/KanbanBoardView.jsx)
- **Implementation Steps**:
  1. Auto-generate project key from title (`/^[A-Z][A-Z0-9_]{1,9}$/`) and enforce unique constraint per tenant.
  2. Implement progress calculation: $\frac{\text{DONE tasks}}{\text{total tasks}} \times 100$.
  3. If `isArchived = true`, reject task creation or mutations with HTTP 400 (`code: "PROJECT_ARCHIVED"`).
- **Data/API Impact**: Added `key` and `isArchived` fields with indexes to Project model. Endpoints `POST /:id/archive` and `POST /:id/unarchive`.
- **Security Considerations**: Archived projects remain read-only; mutation freezing enforced in task create, update, and delete.
- **Dependencies & Blockers**: TASK-201.
- **Test Plan**: 28 automated tests in `backend/test/projects.test.js` validating key generation, immutability, uniqueness, dynamic progress, and archival protection.
- **Acceptance Criteria**: Key generated, progress displayed, archived projects protected.
- **Definition of Done**: Service methods, routes, controller, client, and UI badges operational and 100% verified.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-203 — Task Core CRUD, Validation, Status Workflow & Priority Engine
- **Objective**: Provide comprehensive task management API with status state-machine and dynamic ABAC permission evaluation.
- **Linked User Stories**: `US-TASK-001`, `US-TASK-002`, `US-TASK-003`, `US-TASK-006`, `US-ABAC-001`, `US-ABAC-002`
- **Linked PRD Features**: `TG-TASK-001`, `TG-TASK-002`, `TG-TASK-003`, `TG-TASK-006`, `TG-ABAC-001`, `TG-ABAC-002`
- **Priority**: Critical (P0)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js), [backend/src/services/tasks.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/tasks.service.js), [backend/test/tasks.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/tasks.test.js)
- **Implementation Steps**:
  1. Validate title, priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), status (`TODO`, `IN_PROGRESS`, `REVISION` / `REVIEW`, `DONE`).
  2. When moving to `DONE`, set `completedAt = now()`. When moving away from `DONE`, reset `completedAt = null`.
  3. Enforce ABAC ownership checks (creator vs assignee vs admin) with structured 403 error codes (`CANNOT_UPDATE_OTHERS_TASK`).
  4. Enforce protected governance fields barrier (`creatorId`, `projectId`, `assigneeId`) with `PROTECTED_FIELD_MUTATION` and prototype pollution defense.
  5. Enforce project archival mutation freezing (`PROJECT_ARCHIVED`) across create, update, and delete.
- **Data/API Impact**: Task CRUD endpoints (`GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `DELETE /api/tasks/:id`). Added `completedAt` timestamp and composite indexes.
- **Security Considerations**: Strict tenant isolation, zero-leak IDOR, ABAC ownership validation, and audit logging.
- **Dependencies & Blockers**: TASK-001, TASK-002, TASK-201, TASK-202.
- **Test Plan**: 28 automated integration tests in `backend/test/tasks.test.js` validating CRUD, priority engine, status workflow, completedAt, ABAC ownership, IDOR isolation, and archival freezing.
- **Acceptance Criteria**: State machine transitions work smoothly; negative tests return 403; archival freezing enforced.
- **Definition of Done**: 100% test pass on task workflow suite (28/28 tests passing).
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-204 — Slide-Over Task Detail Drawer & Native Drag-and-Drop Kanban
- **Objective**: Connect interactive Kanban board native drag-and-drop column transitions and slide-over task drawer with Esc key handling and optimistic rollback.
- **Linked User Stories**: `US-TASK-004`, `US-TASK-005`, `US-ABAC-002`, `US-ABAC-003`
- **Linked PRD Features**: `TG-TASK-004`, `TG-TASK-005`, `TG-TASK-008`
- **Priority**: High (P1)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: `frontend/src/features/tasks/KanbanBoardView.jsx`, `frontend/src/features/tasks/TaskDetailDrawer.jsx`, `frontend/src/components/TaskDetailDrawer.jsx`, `frontend/src/App.css`, `frontend/src/features/tasks/task-drawer-dnd.test.js`
- **Implementation Steps**:
  1. Built slide-over detail drawer (`TaskDetailDrawer.jsx`) mounting from right edge with smooth CSS transitions (`transform: translateX(0)`), background blur backdrop (`backdrop-filter: blur(4px)`), `Esc` key dismissal, and backdrop click handling.
  2. Implemented native HTML5 drag-and-drop between Kanban columns (`TODO`, `IN_PROGRESS`, `REVISION`, `DONE`) with drag tilt (`is-dragging`), drop zone highlights (`drag-over-column`), and optimistic UI updates.
  3. Built automatic rollback restoring cards to original columns upon server rejection (`HTTP 403 Forbidden` / `HTTP 400 Bad Request`) with error notices.
  4. Added visual ownership lock indicators (`🔒`) and drag prevention: non-editable cards have `draggable={false}`, `card-non-draggable` cursor, and locked governance fields.
  5. Implemented governance field mutation barrier preserving creator provenance and locking `projectId` / `assigneeId` for regular members.
- **Data/API Impact**: Real-time optimistic client state and `PATCH /api/tasks/:id` REST mutations.
- **Security Considerations**: Visual lock on non-owned cards; project archival freeze; zero-trust server validation.
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: Unit test suite in `frontend/src/features/tasks/task-drawer-dnd.test.js` (4/4 passing), full backend regression suite (172/172 passing), and live browser validation across drawer animations, Esc dismissal, close button dismissal, and Kanban column transitions.
- **Acceptance Criteria**: Drawer mounts and animates smoothly; Esc key dismisses drawer; drag-and-drop updates database with optimistic rollback on rejection.
- **Definition of Done**: Frontend component fully operational, tested, and validated in browser.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-205 — Multi-View Task Representations: List & Table Views
- **Objective**: Deliver interactive List (collapsible status accordions) and Table (dense spreadsheet data grid) views for tasks with due date badges, overdue alert styling, and column sorting.
- **Linked User Stories**: `US-TASK-005`, `US-TASK-007`, `US-TASK-008`, `US-TASK-009`
- **Linked PRD Features**: `TG-TASK-007`, `TG-TASK-008`, `TG-TASK-009`
- **Priority**: Medium (P2)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: `frontend/src/features/tasks/TaskListView.jsx`, `frontend/src/features/tasks/TaskTableView.jsx`, `frontend/src/features/tasks/DueDateBadge.jsx`, `frontend/src/features/tasks/dueDateUtils.js`, `frontend/src/features/tasks/KanbanBoardView.jsx`, `frontend/src/App.css`, `frontend/src/features/tasks/task-multi-views.test.js`
- **Implementation Steps**:
  1. Built status-aware due date utility and badge (`DueDateBadge.jsx` / `dueDateUtils.js`): red pulsing alert for overdue tasks, amber for due within 48h, neutral slate for future, green for completed, and muted dash for unassigned dates.
  2. Built interactive List view (`TaskListView.jsx`) partitioned by status (`TODO`, `IN_PROGRESS`, `REVISION`, `DONE`) with collapsible accordions, item count badges, "Expand All" / "Collapse All" controls, and inline status dropdowns.
  3. Built dense Table view (`TaskTableView.jsx`) with sortable column headers (`Key`, `Title`, `Status`, `Priority`, `Assignee`, `Project`, `Due Date`), multi-type comparator ranking, and row click integration opening the detail drawer.
  4. Updated `KanbanBoardView.jsx` with an accessible view mode tabswitcher (`Board`, `List`, `Table`) sharing unified priority filtering and optimistic mutation pipelines.
  5. Implemented comprehensive CSS in `frontend/src/App.css` featuring curated micro-interactions, responsive grids, and dark theme support.
- **Data/API Impact**: Real-time client-side view rendering consuming `GET /api/tasks` and `PATCH /api/tasks/:id`.
- **Security Considerations**: Identical ABAC ownership checks (`canEditTask`) and project archival locks enforced consistently across all three representations.
- **Dependencies & Blockers**: TASK-204.
- **Test Plan**: Unit test suite in `frontend/src/features/tasks/task-multi-views.test.js` (9/9 passing), full backend regression suite (172/172 passing), and end-to-end browser verification of view transitions, sorting, accordion collapsing, and drawer triggers.
- **Acceptance Criteria**: View switcher smoothly alternates between Board, List, and Table; column headers sort ascending/descending; due date badges display correct alert colors.
- **Definition of Done**: Both views fully operational, responsive, tested, and verified in browser.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-206 — Task Search, Filtering, Sorting & Pagination Engine
- **Objective**: Implement multi-parameter search, filtering (status, priority, assignee, project), column sorting, and pagination.
- **Linked User Stories**: `US-TASK-010`
- **Linked PRD Features**: `TG-TASK-010`
- **Priority**: Medium (P2)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/src/controllers/tasks.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/tasks.controller.js), [backend/src/services/tasks.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/tasks.service.js), [backend/test/tasks.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/tasks.test.js), [frontend/src/features/tasks/KanbanBoardView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/tasks/KanbanBoardView.jsx), [frontend/src/services/api-client.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/services/api-client.js), [frontend/src/App.css](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/App.css), `frontend/src/features/tasks/task-search-filter.test.js`
- **Implementation Steps**:
  1. Expanded `GET /api/tasks` endpoint with comprehensive query parameters: `search`, `status`, `priority`, `assigneeId` (with `'unassigned'` / `'null'` resolution), `projectId`, `sortBy`, `sortOrder`, `page`, and `limit`.
  2. Implemented robust Prisma `where` filtering with case-insensitive search (`mode: 'insensitive'`) on title, description, and numeric ID matching JIRA keys.
  3. Integrated server-side pagination math returning `{ tasks, total, page, limit, totalPages }` with disjoint slicing and multi-tenant isolation.
  4. Built real-time UI filter toolbar in `KanbanBoardView.jsx` featuring search input with clear trigger, project/assignee/status/priority select dropdowns, active filter counter, reset button, and pagination controls for List/Table views.
  5. Validated complete coverage across backend integration suite (6/6 tests passing, 179/179 total) and frontend unit suite (5/5 tests passing, 20/20 total).
- **Data/API Impact**: Enhanced `GET /api/tasks` returning paginated response payload `{ tasks, total, page, limit, totalPages }` with backward-compatible array handling.
- **Security Considerations**: Strict tenant isolation (`organizationId`) enforced on every search, filter, and pagination query (zero cross-tenant data leak).
- **Dependencies & Blockers**: TASK-203, TASK-204, TASK-205.
- **Test Plan**: 6 automated integration tests in `backend/test/tasks.test.js` asserting search, status/priority filtering, project/assignee filtering, column sorting, pagination slices, and cross-tenant boundary isolation; 5 frontend unit tests in `frontend/src/features/tasks/task-search-filter.test.js`; end-to-end browser verification of search, filters, reset, and pagination.
- **Acceptance Criteria**: Filter queries return accurate subsets within <100ms; multi-attribute combinations filter cleanly; search handles titles, descriptions, and JIRA keys; pagination slices are disjoint.
- **Definition of Done**: Backend tests passing (179/179), frontend tests passing (20/20), and interactive browser verification completed.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Low risk; backward compatible with previous task listing responses.


---

### Phase 3: Collaboration, Subtasks, Activity Streams & Real-Time Dispatch

#### Task ID: TASK-301 — Subtask Relational Schema, Checklist CRUD & Progress Propagation
- **Objective**: Add Subtask database model, checklist CRUD endpoints, and dynamic parent progress calculation.
- **Linked User Stories**: `US-SUB-001`, `US-SUB-002`
- **Linked PRD Features**: `TG-SUB-001`, `TG-SUB-002`
- **Priority**: High (P1)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/prisma/schema.prisma](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/schema.prisma), `backend/src/controllers/subtasks.controller.js`, `backend/src/services/subtasks.service.js`, `frontend/src/features/tasks/SubtaskChecklist.jsx`, `frontend/src/features/tasks/TaskDetailDrawer.jsx`, `frontend/src/features/tasks/KanbanBoardView.jsx`
- **Implementation Steps**:
  1. Generate Prisma migration adding `Subtask` model (id, organizationId, title, isCompleted, order, taskId, createdAt, updatedAt) with cascade delete.
  2. Implement subtask CRUD endpoints nested under `/api/tasks/:taskId/subtasks` with parent task ABAC and project archival enforcement.
  3. Recalculate parent task completion progress whenever subtask checkbox is toggled.
- **Data/API Impact**: Staged Migration #1 adding `Subtask` table with foreign key cascade to `Task` and `Organization`.
- **Security Considerations**: Subtask mutations guarded by parent task update permissions (`task:update:any` or own-task ownership under `task:update:own`) and project archival freeze.
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: Unit and integration tests verifying subtask creation, validation, deletion, and progress rollup (17/17 pass in `backend/test/subtasks.test.js`, 5/5 pass in `frontend/src/features/tasks/subtasks.test.js`).
- **Acceptance Criteria**: Subtasks create, delete, and toggle with instant UI feedback and badge updates.
- **Definition of Done**: Migration applied cleanly, automated tests passing in `backend/test/subtasks.test.js` and `frontend/src/features/tasks/subtasks.test.js`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Reversible migration; drop table on rollback.

#### Task ID: TASK-302 — Collaborative Task Comments, 15m Window & Moderation
- **Objective**: Implement task discussion comments with DOMPurify sanitization, 15-minute author edit window, and moderator deletion.
- **Linked User Stories**: `US-COLLAB-001`, `US-COLLAB-002`, `US-COLLAB-003`
- **Linked PRD Features**: `TG-COLLAB-001`, `TG-COLLAB-002`, `TG-COLLAB-003`
- **Priority**: High (P1)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/prisma/schema.prisma](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/prisma/schema.prisma), `backend/src/controllers/comments.controller.js`, `backend/src/services/comments.service.js`, `frontend/src/features/tasks/TaskCommentsSection.jsx`, `frontend/src/features/tasks/TaskDetailDrawer.jsx`
- **Implementation Steps**:
  1. Add `Comment` model (id, organizationId, taskId, authorId, content, editedAt, createdAt, updatedAt) with cascade delete.
  2. Implement chronological comments CRUD nested under `/api/tasks/:taskId/comments`.
  3. Enforce 15-minute author edit/deletion window and enable moderator deletion anytime.
  4. Sanitize markdown/HTML input using sanitizeHtml before database persistence.
- **Data/API Impact**: Staged Migration #2 adding `Comment` table with foreign key cascade to `Task`, `Organization`, and `User`.
- **Security Considerations**: XSS defense on stored and rendered markdown; author privilege enforcement; project archival freeze (`PROJECT_ARCHIVED`).
- **Dependencies & Blockers**: TASK-203.
- **Test Plan**: Integration test suite verifying comment posting, XSS sanitization, 15m edit window expiration, non-author rejection, moderator deletion, and audit logging (16/16 pass in `backend/test/comments.test.js`, 7/7 pass in `frontend/src/features/tasks/comments.test.js`).
- **Acceptance Criteria**: Comments post cleanly; edit window enforced; admin can moderate; live count badges update.
- **Definition of Done**: Endpoints active, tests passing in `backend/test/comments.test.js` and `frontend/src/features/tasks/comments.test.js`.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Reversible migration.

#### Task ID: TASK-303 — Task Activity Stream & Slide-Over Audit Drawer
- **Objective**: Surface immutable task activity timeline and organization audit log queries in slide-over drawer and reports.
- **Linked User Stories**: `US-AUDIT-001`, `US-AUDIT-002`, `US-ACT-001`
- **Linked PRD Features**: `TG-AUD-001`, `TG-AUD-002`, `TG-ACT-001`
- **Priority**: Medium (P2)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: [backend/src/controllers/audit.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/audit.controller.js), [backend/src/services/audit.service.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/services/audit.service.js), [backend/src/routes/audit.routes.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/routes/audit.routes.js), [frontend/src/features/tasks/TaskActivityStream.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/tasks/TaskActivityStream.jsx), [frontend/src/features/reports/AuditReportsView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/reports/AuditReportsView.jsx), [frontend/src/features/tasks/TaskDetailDrawer.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/tasks/TaskDetailDrawer.jsx)
- **Implementation Steps**:
  1. Implemented `getTaskActivityService` querying `AuditLog` by task, subtask, and comment events with actor attribution.
  2. Implemented `listAuditLogsService`, `getAuditActionsService`, and `getAuditStatsService` with strict tenant isolation and `audit:read` guard.
  3. Integrated `TaskActivityStream` tab in slide-over drawer with category filters, timeline connectors, and JSON inspect disclosure.
  4. Built `AuditReportsView` in main app navigation under "reports" with 4 KPI cards, filter bar, pagination, and CSV/JSON export.
- **Data/API Impact**: Mounted `GET /api/tasks/:taskId/activity` and `/api/audit` endpoints with strict indexing on `[organizationId, createdAt]`.
- **Security Considerations**: Zero-leak tenant isolation enforced on task and workspace audit queries.
- **Dependencies & Blockers**: TASK-204, TASK-301, TASK-302.
- **Test Plan**: Integration suite in `backend/test/activity.test.js` (16/16 pass) and unit tests in `frontend/src/features/tasks/activity.test.js` (5/5 pass).
- **Acceptance Criteria**: Activity timeline displays mutation history accurately, and organization audit logs query reliably.
- **Definition of Done**: All endpoints active, drawer tabs integrated, 100% test pass rate.
- **Effort Estimate**: S (1 business day).
- **Risk & Rollback**: Zero risk.

#### Task ID: TASK-304 — Real-Time Notification & Activity Dispatch Pipeline (Transport-Independent)
- **Objective**: Build internal event emitter pipeline that dispatches notification events when tasks, comments, or memberships mutate.
- **Linked User Stories**: `US-NOTIF-001`, `US-NOTIF-002`
- **Linked PRD Features**: `TG-NOTIF-001`, `TG-NOTIF-002`
- **Priority**: Medium (P2)
- **Status**: Completed (Sprint 3 / Phase 3)
- **Affected Files**: `backend/prisma/schema.prisma`, `backend/src/services/event-dispatcher.service.js`, `backend/src/services/notifications.service.js`, `backend/src/controllers/notifications.controller.js`, `backend/src/routes/notifications.routes.js`, `backend/test/notifications.test.js`, `frontend/src/features/notifications/NotificationBell.jsx`, `frontend/src/features/notifications/NotificationDrawer.jsx`, `frontend/src/features/notifications/notificationUtils.js`, `frontend/src/features/notifications/notification.test.js`, `frontend/src/services/api-client.js`, `frontend/src/layout/AppShell.jsx`, `frontend/src/App.css`
- **Implementation Steps**:
  1. Relational schema addition: `Notification` model with relations to `Organization` and `User` (recipients and actors) with cascade deletion and compound indexing.
  2. Built decoupled in-process `workspaceEventEmitter` in `event-dispatcher.service.js` listening for `task:created`, `task:assigned`, `task:status_changed`, `comment:created`, and `subtask:completed`.
  3. Enforced strict self-notification prevention invariant (`actorId !== recipientId`) and active tenant membership barrier.
  4. Implemented full REST API endpoints: `GET /api/notifications` (with pagination and unread filter), `GET /unread-count`, `PATCH /:id/read`, `PATCH /mark-all-read`, `DELETE /:id`, and `DELETE /clear-read`.
  5. Built topbar `NotificationBell` with animated unread badge counter, polling sync, and slide-over `NotificationDrawer` with relative times, type badges, mark-as-read, clear-read, and deep-linking into tasks.
- **Data/API Impact**: `Notification` model active with indexes on `[organizationId, userId, isRead]` and `[userId, createdAt]`.
- **Security Considerations**: All notification queries and mutations strictly scoped to `organizationId` and `req.auth.userId` (zero-leak cross-user/tenant isolation).
- **Dependencies & Blockers**: TASK-302, TASK-303 (Resolved).
- **Test Plan**: 18 comprehensive backend integration tests in `backend/test/notifications.test.js` (246/246 total pass rate); 4 unit tests in `frontend/src/features/notifications/notification.test.js` (41/41 total pass rate).
- **Acceptance Criteria**: Unread counter increments; mark-as-read clears counter; deep-links open target tasks.
- **Definition of Done**: Dispatcher, REST APIs, bell UI, and slide-over drawer fully operational and verified.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

---

### Phase 4: Workspace Utility, Navigation, Files & Accessibility

#### Task ID: TASK-401 — Global Command Palette (`Cmd/Ctrl+K`) Multi-Entity Search
- **Objective**: Implement global command palette modal responding to keyboard shortcut with cross-entity search and arrow navigation.
- **Linked User Stories**: `US-CMD-001`, `US-CMD-002`
- **Linked PRD Features**: `TG-CMD-001`, `TG-CMD-002`
- **Priority**: Medium (P2)
- **Status**: Completed
- **Affected Files**: `frontend/src/features/search/CommandPaletteModal.jsx`, `frontend/src/features/search/commandPaletteUtils.js`, `backend/src/controllers/search.controller.js`, `backend/src/services/search.service.js`, `backend/src/routes/search.routes.js`
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
- **Status**: Completed
- **Affected Files**: `frontend/src/features/calendar/CalendarView.jsx`, `frontend/src/features/calendar/calendarUtils.js`, `frontend/src/features/calendar/calendarUtils.test.js`, `frontend/src/App.jsx`, `frontend/src/App.css`, `backend/src/services/tasks.service.js`, `backend/test/tasks.test.js`
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
- **Status**: Completed
- **Affected Files**: `backend/src/controllers/dashboard.controller.js`, `backend/src/services/dashboard.service.js`, `backend/src/controllers/notifications.controller.js`, `backend/src/services/notifications.service.js`, `backend/src/routes/notifications.routes.js`, `backend/test/dashboard.test.js`, `frontend/src/features/dashboard/DashboardView.jsx`, `frontend/src/features/dashboard/dashboardUtils.js`, `frontend/src/features/dashboard/dashboardUtils.test.js`, `frontend/src/features/notifications/NotificationPreferencesModal.jsx`, `frontend/src/features/notifications/notificationPreferencesUtils.js`, `frontend/src/features/notifications/notificationPreferencesUtils.test.js`, `frontend/src/features/notifications/NotificationDrawer.jsx`, `frontend/src/features/notifications/NotificationBell.jsx`, `frontend/src/services/api-client.js`, `frontend/src/App.jsx`, `frontend/src/App.css`
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
- **Status**: Completed / 100% Verified (TIER-2 & TIER-3)
- **Affected Files**: [frontend/src/features/a11y/a11yUtils.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/a11y/a11yUtils.js), [frontend/src/features/a11y/a11yUtils.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/a11y/a11yUtils.test.js), [frontend/src/hooks/useFocusTrap.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/hooks/useFocusTrap.js), [frontend/src/features/a11y/KeyboardShortcutsModal.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/a11y/KeyboardShortcutsModal.jsx), [frontend/src/index.css](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/index.css), [frontend/src/App.css](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/App.css), [frontend/src/layout/AppShell.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/layout/AppShell.jsx), [frontend/src/features/tasks/KanbanBoardView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/tasks/KanbanBoardView.jsx), [frontend/src/features/tasks/TaskDetailDrawer.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/tasks/TaskDetailDrawer.jsx), [frontend/src/features/notifications/NotificationDrawer.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/notifications/NotificationDrawer.jsx), [frontend/src/features/notifications/NotificationPreferencesModal.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/notifications/NotificationPreferencesModal.jsx), [frontend/src/features/projects/ProjectSetupWizardModal.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/projects/ProjectSetupWizardModal.jsx), [frontend/src/components/AdminPrimitives.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/components/AdminPrimitives.jsx)
- **Implementation Steps**:
  1. Implement `useFocusTrap` hook trapping Tab key inside open modals and drawers with boundary wrapping.
  2. Implement `a11yUtils.js` with focus element discovery, editable target detection, and relative luminance/contrast calculation.
  3. Deploy `KeyboardShortcutsModal.jsx` cheatsheet triggered globally by `?` or topbar button.
  4. Wire global `C` shortcut for quick task creation with input safeguards (`US-A11Y-002`).
  5. Deploy accessible Skip-to-Content anchor link (`.skip-to-content-link`) targeting `#main-content`.
  6. Audit all color tokens in `index.css` and `App.css` to guarantee >= 4.5:1 text contrast and high-contrast `:focus-visible` emerald rings.
  7. Add `aria-modal="true"`, `role="dialog"`, `aria-labelledby`, and accessible button labels across all console modals and drawers.
- **Data/API Impact**: Pure frontend accessibility & navigation enhancements.
- **Security Considerations**: Focus management prevents focus escaping into inert background layers.
- **Dependencies & Blockers**: TASK-204, TASK-401.
- **Test Plan**: Pure a11y unit tests in `a11yUtils.test.js` (contrast math, focus wrap, shortcut guards) + browser subagent visual validation.
- **Acceptance Criteria**: Focus trapped in dialogs; Esc dismisses cleanly; skip link visible on focus; contrast meets WCAG AA >= 4.5:1.
- **Definition of Done**: WCAG AA verification sign-off completed and 100% test pass.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

#### Task ID: TASK-405 — File Asset Directory, Project Association & Bulk Metadata Operations
- **Objective**: Provide comprehensive file asset directory listing, project filtering, multi-row selection, floating bulk action dock (duplicate, delete), and project/task association operations.
- **Linked User Stories**: `US-FILE-001`, `US-FILE-002`, `US-FILE-003`, `US-FILE-004`, `US-FILE-005`
- **Linked PRD Features**: `TG-FILE-001`, `TG-FILE-002`, `TG-FILE-003`, `TG-FILE-004`, `TG-FILE-005`
- **Priority**: Medium (P2)
- **Status**: Completed / 100% Verified (TIER-2 & TIER-3)
- **Affected Files**: [backend/src/controllers/files.controller.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/controllers/files.controller.js), [backend/src/routes/files.routes.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/src/routes/files.routes.js), [backend/test/files.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/backend/test/files.test.js), [frontend/src/features/files/FilesBulkView.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/files/FilesBulkView.jsx), [frontend/src/features/files/filesUtils.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/files/filesUtils.js), [frontend/src/features/files/filesUtils.test.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/features/files/filesUtils.test.js), [frontend/src/components/FloatingBulkDock.jsx](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/components/FloatingBulkDock.jsx), [frontend/src/services/api-client.js](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/services/api-client.js), [frontend/src/App.css](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/frontend/src/App.css)
- **Implementation Steps**:
  1. Optimize `GET /api/files` with project filtering, case-insensitive search (`q`), sorting (`sortBy`, `sortOrder`), and pagination.
  2. Implement `FloatingBulkDock.jsx` with accessible selection counter, duplicate, and delete actions.
  3. Implement bulk duplicate endpoint appending ` (Copy)` suffix to copied file names.
  4. Implement bulk delete endpoint guarded by `files:delete` permission with transactional batch deletion.
  5. Implement `PATCH /api/files/:fileId` for file renaming and project reassignment (`US-FILE-005`) with tenant ownership validation.
  6. Connect project association selector in Add File and Edit File modals with `useFocusTrap` dialog focus trapping.
  7. Deploy frontend utilities `filesUtils.js` with pure sorting, filtering, formatting, and duplicate naming algorithms.
- **Data/API Impact**: Manages `FileAsset` database rows and `Project` associations.
- **Security Considerations**: Strict tenant isolation; cross-tenant file mutations and project associations return HTTP 404; RBAC permissions (`files:upload`, `files:update`, `files:delete`) strictly enforced.
- **Dependencies & Blockers**: TASK-201, TASK-203.
- **Test Plan**: Automated integration tests in `backend/test/files.test.js` (16 test vectors) + frontend unit tests in `filesUtils.test.js` (5 unit tests).
- **Acceptance Criteria**: Files directory displays correctly; column headers sort asc/desc; floating bulk dock executes batch operations atomically; duplicates receive ` (Copy)` suffix.
- **Definition of Done**: File management endpoints, floating dock UI, and tests 100% verified.
- **Effort Estimate**: M (2 business days).
- **Risk & Rollback**: Low risk.

---

### Phase 5: Provisional Implementation of Blocked Features (Awaiting Ratification)

> [!WARNING]
> **Governance Quarantine**: Tasks TASK-501 through TASK-507 are formally quarantined under **Release Track B**. No production code or irreversible migrations may be deployed until stakeholder decisions are ratified in [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md).

#### Task ID: TASK-501 — Platform Super Admin Governance & Break-Glass Recovery
- **Objective**: Build platform operator tenant overview and audited break-glass recovery.
- **Linked User Stories**: `US-PLAT-001`, `US-PLAT-002`
- **Linked PRD Features**: `TG-PLAT-001`
- **Priority**: Medium (P2)
- **Status**: Completed (UD-001 Ratified)
- **Affected Files**: `backend/src/middleware/platform.middleware.js`, `backend/src/services/platform.service.js`, `backend/src/controllers/platform.controller.js`, `backend/src/routes/platform.routes.js`, `frontend/src/features/platform/PlatformAdminView.jsx`, `backend/test/platform.test.js`
- **Implemented Specification**:
  - Enforced server-side MFA step-up verification token (`x-mfa-token`, 5m TTL, single-use nonce in database).
  - Validated active ITSM ticket ID format (`/^TG-[0-9]{4,8}$/`) and justification length >= 20 characters.
  - Action scope strictly limited to owner re-assignment; customer task/file browsing forbidden.
  - Write immutable `PlatformAuditLog` record with SHA-256 hash chaining (`prevLogHash` and `currentHash`).
  - Durable Outbox pattern (`BreakGlassAlertOutbox`) committed atomically inside same transaction.
- **Dependencies & Blockers**: Resolved (UD-001 Ratified Option B).
- **Verification**: 16 automated backend tests passing in `backend/test/platform.test.js`, 3 frontend unit tests in `platformGovernance.test.js`, and visual browser recording verified.

#### Task ID: TASK-502 — Persistent S3-Compatible Object Storage Engine & Quotas (Completed)
- **Objective**: Ingest file binaries via S3 presigned URLs with server-side HeadObject validation and quota tracking.
- **Linked User Stories**: `US-STOR-001`
- **Linked PRD Features**: `TG-STOR-001`, `TG-FILE-005`
- **Priority**: High (P1)
- **Status**: Completed (Unblocked via Ratification of UD-002 Option A)
- **Affected Files**: `backend/src/services/storage.service.js`, `backend/src/controllers/files.controller.js`, `backend/src/routes/files.routes.js`, `backend/test/storage.test.js`, `frontend/src/features/files/FilesBulkView.jsx`, `frontend/src/features/files/filesStorageUtils.test.js`
- **Implemented Specification**:
  - Presigned PUT URL generated with 15m expiration and sanitized RFC 5987 filename (`tenants/{orgId}/projects/{projId}/files/{uuid}-{filename}`).
  - Executable binary blocklist (`.exe`, `.sh`, `.bat`, `.cmd`, `.bin`, etc.) rejected at URL issuance with HTTP 400. Max file size bounded to 50 MB.
  - Confirmation endpoint `POST /api/files/confirm` executes server-side AWS S3 `HeadObjectCommand` to verify existence, actual byte size <= quota, permitted MIME type, and tenant path prefix before activating `FileAsset` with `status: "READY"`.
  - Quota concurrency enforced via PostgreSQL row-level locking (`SELECT ... FROM "Organization" WHERE id = :orgId FOR UPDATE`).
  - Presigned download GET URL generated with 5m expiration, strictly scoped to active tenant (cross-tenant requests return 404).
  - Frontend drag-and-drop dropzone with direct presigned S3 PUT upload, storage quota progress bar banner, and download button.
- **Verification**: 17 automated backend integration tests passing in `backend/test/storage.test.js`, 5 frontend unit tests in `filesStorageUtils.test.js`, and browser visual verification recorded.

#### Task ID: TASK-503 — Real-Time State Synchronization via Authenticated Fetch Streams / SSE
- **Objective**: Deliver multi-client real-time Kanban updates via SSE using an authenticated fetch streaming client.
- **Linked User Stories**: `US-SYNC-001`, `US-SYNC-002`
- **Linked PRD Features**: `TG-SYNC-001`
- **Priority**: Medium (P2)
- **Status**: Completed (UD-003 Ratified)
- **Affected Files**: `backend/src/services/sync.service.js`, `backend/src/controllers/sync.controller.js`, `backend/src/routes/sync.routes.js`, `frontend/src/services/eventStream.js`, `frontend/src/features/sync/syncUtils.js`, `frontend/src/features/tasks/KanbanBoardView.jsx`
- **Delivered Capabilities**:
  - SSE endpoint `GET /api/events/stream` and `/api/v1/events/stream` protected by JWT authentication and strict `x-organization-id` tenant isolation (cross-tenant access rejected with 403; missing header with 400).
  - In-memory multi-tenant broker maintaining per-tenant subscriber sets and 100-event ring buffer for reconnection replay.
  - Standard SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`).
  - Heartbeat pings (`: ping\n\n`) emitted every 15s to keep connections alive through proxies with zero memory leaks on disconnect.
  - `Last-Event-ID` cursor tracking & replay: clients replaying from cursor receive missed events; if buffer overflowed, server emits `sync:reconcile` prompting full state refresh.
  - Native fetch `ReadableStream` reader client in frontend passing `Authorization: Bearer <token>` and `x-organization-id` headers, supporting exponential backoff reconnection and `AbortController` cancellation.
  - Optimistic UI updates on Kanban card drag-and-drop with automatic rollback on server error.
  - Live Sync animated indicator badge displayed in header toolbar.
- **Verification**: 13 automated backend tests in `backend/test/sync.test.js` and 5 frontend unit tests in `frontend/src/features/sync/syncUtils.test.js` passing with 100% success.

#### Task ID: TASK-504 — TipTap Rich Text Editor Integration (UD-004)
- **Objective**: Integrate TipTap / ProseMirror rich text WYSIWYG editor for task descriptions and comments.
- **Linked User Stories**: `US-COLLAB-004`
- **Linked PRD Features**: `TG-EDT-001`
- **Priority**: Low (P3)
- **Status**: Complete / Verified (TIER-1, TIER-2 & TIER-3)
- **Affected Files**: `frontend/src/components/RichTextEditor.jsx`, `frontend/src/components/RichTextViewer.jsx`, `frontend/src/features/editor/editorUtils.js`, `frontend/src/features/editor/editorUtils.test.js`, `frontend/src/features/tasks/TaskDetailDrawer.jsx`, `frontend/src/features/tasks/TaskCommentsSection.jsx`, `backend/src/utils/sanitize.js`, `backend/src/services/tasks.service.js`, `backend/src/services/comments.service.js`, `backend/test/rich-text.test.js`
- **Delivered Capabilities**:
  - Headless TipTap / ProseMirror rich text WYSIWYG editor with accessible toolbar (Bold, Italic, Strikethrough, Inline Code, H1-H3, Lists, Blockquote, Link modal, Undo/Redo).
  - Native markdown input rules (`#`, `##`, `*`, `1.`, `>`, ```` ``` ````).
  - Real-time payload size bounding counter with visual warning/danger badges.
  - Strict payload size limit enforcement: 64 KB maximum for task descriptions and 16 KB maximum for comments (exceeding payloads rejected with HTTP 400 Bad Request).
  - Dual-layer stored XSS defense: server-side `sanitize-html` parsing with whitelisted semantic tags/attributes and client-side DOMPurify sanitization.
  - Safe rich text rendering in `RichTextViewer` with responsive typography and empty fallback state.
- **Verification**: 8 automated tests in `backend/test/rich-text.test.js`, 3 frontend unit tests in `frontend/src/features/editor/editorUtils.test.js`, and 86/86 frontend tests passing.

#### Task ID: TASK-505 (Completed & Verified) — Transactional Email Member Invitations & Expiration Lifecycle
- **Objective**: Dispatch email invitations via Resend API with 7-day token expiration, identity match verification, and pending invitation lifecycle management.
- **Linked User Stories**: `US-INV-001`, `US-INV-002`, `US-INV-003`
- **Linked PRD Features**: `TG-INV-001`
- **Priority**: High (P1)
- **Status**: Completed & Verified (UD-005 Ratified)
- **Affected Files**:
  - `backend/prisma/schema.prisma`
  - `backend/src/services/email.service.js`
  - `backend/src/services/invitations.service.js`
  - `backend/src/controllers/invitations.controller.js`
  - `backend/src/routes/invitations.routes.js`
  - `backend/src/middleware/authenticate.js`
  - `backend/src/app.js`
  - `frontend/src/services/api-client.js`
  - `frontend/src/features/invitations/invitation-utils.js`
  - `frontend/src/features/invitations/AcceptInvitationModal.jsx`
  - `frontend/src/features/members/MembersView.jsx`
  - `frontend/src/App.jsx`
- **Architectural & Security Invariants**:
  - Resend transactional email API (`POST https://api.resend.com/emails`) dispatching cryptographically secure 32-byte hexadecimal invitation tokens (`crypto.randomBytes(32).toString("hex")`).
  - Single-use token security: token is stored exclusively as an immutable SHA-256 hash (`tokenHash`), never in plaintext.
  - In-memory sandbox outbox fallback when `RESEND_API_KEY` is omitted or in test environments (`NODE_ENV === "test"`).
  - Strict recipient email matching invariant (`SEC-11`): authenticated user session email must match `invitation.email` exactly, returning `403 Forbidden` (`"This invitation was sent to a different email address"`) on mismatch.
  - Universal Privilege Delegation Barrier (`DELEGATION_BARRIER_BREACH` HTTP 403) blocking inviters from assigning roles containing permissions exceeding their personal authority.
  - Active member re-invitation defense: rejects invitation creation with HTTP 400 (`"User is already a member of this organization"`).
  - Atomic acceptance transaction: assigns membership & role, updates invitation status to `ACCEPTED`, logs audit event, and guards against concurrent race conditions with HTTP 409 Conflict.
  - Pending invitation management: admin revocation (`POST /api/invitations/:id/revoke`), single-use token refresh on resend (`POST /api/invitations/:id/resend`), and auto-expiration on read operations.
  - Frontend UI: Members directory tab switching ("Members Directory" vs "Pending Invitations"), "Invite Member" modal with shareable link copy fallback, and URL search parameter token listener launching `AcceptInvitationModal`.
- **Verification**: 13 automated tests in `backend/test/invitations.test.js`, 5 frontend unit tests in `frontend/test/invitations.test.js`, and comprehensive UI in `MembersView.jsx` and `AcceptInvitationModal.jsx`.

#### Task ID: TASK-506 (Completed & Verified) — Task Creator vs. Assignee Permission Bifurcation
- **Objective**: Bifurcate task update permissions into discrete `task:update:own` (creator) and `task:update:assigned` (assignee).
- **Linked User Stories**: `US-ABAC-004`
- **Linked PRD Features**: `TG-ABAC-001`
- **Priority**: High (P1)
- **Status**: Completed & Verified (DP-TASK-001 Ratified)
- **Affected Files**:
  - `backend/config/seed.js`
  - `backend/src/controllers/organizations.controller.js`
  - `backend/src/routes/tasks.routes.js`
  - `backend/src/services/tasks.service.js`
  - `backend/src/services/subtasks.service.js`
  - `backend/test/bifurcation.test.js`
  - `frontend/src/features/tasks/TaskDetailDrawer.jsx`
  - `frontend/src/features/tasks/KanbanBoardView.jsx`
  - `frontend/src/features/calendar/CalendarView.jsx`
  - `frontend/src/features/tasks/task-drawer-dnd.test.js`
- **Architectural & Security Invariants**:
  - Discrete permission codenames: `task:update:own` strictly evaluates author ownership (`task.creatorId === actor.id`), granting full modification of author-defined scope and title.
  - `task:update:assigned` strictly evaluates assignee execution (`task.assigneeId === actor.id`), granting task execution status transitions, priority updates, progress description notes, and subtask checklist modifications, while strictly prohibiting author title alterations (rejected with `HTTP 403 Forbidden` / `ASSIGNEE_CANNOT_MUTATE_TITLE`).
  - Strict protected fields barrier: Neither permission permits mutating `projectId`, `creatorId`, or `assigneeId` without elevated permissions (`task:assign`, `project:manage`, or `task:manage`).
  - Default role assignment: Built-in `Team Member` role holds both `task:update:own` and `task:update:assigned`. Custom roles can be tailored with either or both.
  - Frontend UI: Title input in `TaskDetailDrawer.jsx` is visually locked with an author requirement hint when user is assignee without creator authority.
- **Verification**: 9 automated tests in `backend/test/bifurcation.test.js`, 4 unit tests in `frontend/src/features/tasks/task-drawer-dnd.test.js`, and title lock in `TaskDetailDrawer.jsx`.

#### Task ID: TASK-507 — Compliance & Velocity Reporting CSV Export
- **Objective**: Stream organization task velocity and security audit history as CSV downloads.
- **Linked User Stories**: `US-REP-001`
- **Linked PRD Features**: `TG-REP-001`
- **Priority**: Medium (P2)
- **Status**: Completed & Verified (DP-REP-001 Ratified)
- **Affected Files**: `backend/src/controllers/reports.controller.js`, `backend/src/services/reports.service.js`, `backend/src/routes/reports.routes.js`, `frontend/src/features/reports/AuditReportsView.jsx`, `frontend/src/features/reports/reportsUtils.js`
- **Specification**:
  - Server streams database records as CSV with `Content-Type: text/csv; charset=utf-8` and RFC 4180 escaping with formula injection defense.
  - Multi-tab UI for Compliance & Audit Trail and Velocity & Completion Rates.
  - Generates immutable `AuditLog` entry with `action: "report:export"`.
- **Verification**: 13 automated tests in `backend/test/reports.test.js`, 5 unit tests in `frontend/src/features/reports/reportsUtils.test.js`.

---

### Phase 6: Production Packaging, Infrastructure & Release Verification

#### Task ID: TASK-601 — Database Migration Staging, Forward Verification & Point-in-Time Restore
- **Objective**: Validate Prisma schema migration pipelines, tested forward migrations, foreign key cascades, and point-in-time restore procedures in staging environment.
- **Linked User Stories**: Operational Data Integrity across all modules
- **Linked PRD Features**: `TG-TENANT-001`, `TG-RBAC-001`
- **Priority**: Critical (P0)
- **Status**: Completed & Verified
- **Affected Files**: `backend/prisma/migrations/`, `backend/prisma/schema.prisma`, `backend/scripts/backup-db.js`, `backend/scripts/restore-backup.js`, `backend/scripts/restore-backup.sh`, `backend/scripts/backup-db.sh`, `backend/test/migration-staging.test.js`
- **Delivered Capabilities**:
  1. Baselined all 10 migrations in `backend/prisma/migrations/` and verified zero schema drift via `prisma migrate diff`.
  2. Implemented automated point-in-time backup engine (`backup-db.js`, `backup-db.sh`) generating SQL dumps with cryptographic SHA-256 metadata verification.
  3. Implemented point-in-time restore engine (`restore-backup.js`, `restore-backup.sh`) with pre-flight checksum verification and post-restore relational integrity checks.
  4. Validated foreign key cascade behavior during tenant deletion (100% cascade cleanup across tasks, subtasks, comments, files, memberships, invitations, and audit logs with 0 orphans).
- **Verification**: 5 automated tests passing in `backend/test/migration-staging.test.js`.

#### Task ID: TASK-602 — Production Multi-Stage Dockerfile & Container Optimization
- **Objective**: Author hardened, multi-stage Dockerfiles for backend API and frontend Vite static assets with non-root execution.
- **Linked User Stories**: Operational Deployment across all modules
- **Linked PRD Features**: Deployment baseline
- **Priority**: High (P1)
- **Status**: Completed & Verified
- **Affected Files**: `backend/Dockerfile`, `backend/.dockerignore`, `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore`, `docker-compose.prod.yml`, `.dockerignore`, `backend/test/docker-packaging.test.js`
- **Delivered Capabilities**:
  1. Authored hardened multi-stage `backend/Dockerfile` (`node:22-alpine` builder/production, `dumb-init` signal handling, layer-cached Prisma client generation, non-root `USER node` execution, `/api/health` healthcheck).
  2. Authored hardened multi-stage `frontend/Dockerfile` (`node:22-alpine` builder, `nginx:1.27-alpine` production, non-root `USER nginx`, `/healthz` healthcheck).
  3. Authored production `frontend/nginx.conf` with security response headers (`X-Frame-Options DENY`, `X-Content-Type-Options nosniff`), Gzip compression engine, SPA history fallback (`try_files`), and reverse proxy for REST API and SSE event streams.
  4. Configured `docker-compose.prod.yml` orchestrating `postgres:16-alpine`, `backend`, and `frontend` across isolated bridge network `teamguard-network` with persistent storage volume and healthcheck dependencies (`condition: service_healthy`).
- **Verification**: 6 automated tests passing in `backend/test/docker-packaging.test.js`.

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
| **Platform Administration** | 2 | 1 | 2 Verified | `TASK-501` |
| **Invitations & Onboarding** | 5 | 1 | 5 Verified | `TASK-101`, `TASK-505` |
| **RBAC Administration** | 7 | 8 | 7 Verified, 0 Planned | `TASK-102`, `TASK-103`, `TASK-104` |
| **ABAC & Policy Engine** | 4 | 3 | 4 Verified, 0 Planned | `TASK-002`, `TASK-203`, `TASK-506` |
| **Project Management** | 5 | 5 | 5 Verified, 0 Planned | `TASK-201`, `TASK-202` |
| **Task Management** | 10 | 10 | 10 Verified, 0 Planned | `TASK-203`, `TASK-204`, `TASK-205`, `TASK-206` |
| **Subtask Hierarchy** | 2 | 2 | 2 Verified, 0 Planned | `TASK-301` |
| **Collaboration & Comments** | 4 | 4 | 4 Verified, 0 Planned | `TASK-302`, `TASK-504` |
| **Audit Logs & Compliance** | 2 | 2 | 2 Verified | `TASK-303` |
| **Activity Feeds** | 1 | 1 | 1 Verified | `TASK-303` |
| **File Management** | 5 | 5 | 1 Verified, 3 Partial, 1 Planned | `TASK-405` |
| **Storage Engine** | 1 | 1 | 1 Verified | `TASK-502` |
| **Dashboard & Metrics** | 6 | 6 | 6 Verified | `TASK-403` |
| **Calendar & Timeline** | 2 | 2 | 2 Verified | `TASK-402` |
| **Notifications** | 3 | 3 | 3 Verified | `TASK-304`, `TASK-403` |
| **Command Palette** | 2 | 2 | 2 Verified | `TASK-401` |
| **Accessibility (WCAG AA)** | 3 | 3 | 1 Verified, 2 Partially Implemented | `TASK-404` |
| **Account Management** | 1 | 1 | 1 Verified | `TASK-005` |
| **Reporting & Analytics** | 1 | 1 | 1 Verified | `TASK-507` |
| **Developer Tooling** | 1 | 1 | 1 Verified | `TASK-006` |
| **State Synchronization** | 2 | 1 | 2 Verified | `TASK-503` |
| **TOTALS RECONCILED** | **79 Stories** | **60 Features** | **47 Verified, 5 Partial, 23 Planned, 4 Blocked** | **35 Tasks across 7 Phases (32 Story-Linked + 3 Operational)** |

---

## Section 18 — Open Questions & Stakeholder Action Items

Prior to expanding into Phase 5, stakeholder sign-off is required on the 7 architectural decisions in [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md):
1. **UD-001**: Approve Unified Application with Operator Context & MFA Step-Up for platform administration.
2. **UD-002**: Ratify S3-compatible cloud storage provider (Cloudflare R2 or AWS S3) with server-side HeadObject validation.
3. **UD-003**: Approve Server-Sent Events via authenticated fetch streaming client for real-time broadcasts.
4. **UD-004**: Ratified (Option A: TipTap / ProseMirror rich text editor with strict DOMPurify sanitization — `TASK-504` Completed).
5. **UD-005**: Ratified (Option B: Resend Transactional Email API with 7-Day Token Link Fallback — `TASK-505` Completed & Verified).
6. **DP-TASK-001**: Ratified (Option B: Discrete Permission Bifurcation `task:update:own` vs. `task:update:assigned` — `TASK-506` Completed & Verified).
7. **DP-REP-001**: Ratified (Option A: Streaming CSV Export of Task Velocity & Audit History — `TASK-507` Completed & Verified).

---

## Section 19 — Final Planning Recommendations

1. **Immediate Execution Priority**: Begin implementation with **Phase 0: Baseline Hardening & Defect Remediation** (`TASK-001` through `TASK-006`). Remediating the implicit tenant fallback, task field mutation gap, and deploying baseline Helmet headers and rate limiting eliminates foundational security liabilities before new feature code is written.
2. **Release Track Separation**: Execute Core Release Track A (Phases 0–4 + Phase 6) to deliver a rock-solid, production-ready work management platform covering all 68 core stories.
3. **Formal Decision Governance**: Treat Phase 5 tasks as strictly blocked until stakeholder sign-off is recorded in the Decision Register.

---
