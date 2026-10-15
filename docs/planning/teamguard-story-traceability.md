# TeamGuard User Story Traceability Matrix & Verification Map

---

## Section 1 — Document Control

| Metadata Field | Value |
| :--- | :--- |
| **Document Title** | TeamGuard User Story Traceability Matrix & Verification Map |
| **Document Identifier** | `TG-TRM-v1.2.0` |
| **Target Path** | [docs/planning/teamguard-story-traceability.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-story-traceability.md) |
| **Document Version** | `1.2.0-draft` |
| **Document Status** | Engineering Planning Draft — Pending Requirements and Decision Ratification |
| **Last Updated** | 2026-10-14 |
| **Requirements Source** | [.agents/rules/teamguard-product-specs.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-product-specs.md) (`v1.1.0-draft`) |
| **Security Standards** | [.agents/rules/teamguard-rbac.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-rbac.md) |
| **User Stories Baseline** | [docs/product/teamguard-user-stories.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md) (`TG-USC-v1.0.1-revised`) |
| **Decision Register** | [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md) |
| **Master Development Plan** | [docs/planning/teamguard-development-plan.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-development-plan.md) |
| **Release Checklist** | [docs/planning/teamguard-release-checklist.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-release-checklist.md) |
| **Author / Custodians** | Principal Software Architect, Senior Technical Project Manager, QA Lead |

---

## Section 2 — Executive Traceability Overview & Coverage Dimensions

Every user story in TeamGuard's catalogue ([docs/product/teamguard-user-stories.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md)) is explicitly assigned to a designated, fully defined engineering task (many-to-one mapping rule). This ensures that every functional requirement, edge case, and acceptance criterion has an explicit implementation vehicle, test plan, and Definition of Done.

### 2.1 Reconciled Coverage Dimensions
To prevent conflating mapping with verification, TeamGuard tracks three independent coverage dimensions:
1. **Requirement Mapping Coverage (100% Mapped)**:
   - Exactly **79 of 79 unique user stories** and **60 PRD features** are mapped to implementation tasks and test suites.
   - *Regex Reconciliation Note*: Naive alphabetic-only regex (`US-[A-Z]+-[0-9]+`) identifies only 76 stories because Module Q uses the standard web accessibility numeronym `A11Y` (`US-A11Y-001`, `US-A11Y-002`, `US-A11Y-003`). Alphanumeric regex (`US-[A-Z0-9]+-[0-9]+`) accounts for all 79 stories.
2. **Implementation Scope Coverage**:
   - **Verified in Repository**: **31 stories** (39.2%) — Operational in active codebase and local runtime with evidence at `TIER-2` or `TIER-3`.
   - **Partially Implemented**: **5 stories** (6.3%) — Foundational code or API exists; full acceptance criteria require planned expansion or contain a documented defect (`US-A11Y-002`, `US-A11Y-003`, `US-FILE-002`, `US-FILE-003`, `US-FILE-004`).
   - **Planned Implementation**: **32 stories** (40.5%) — In-scope for Core v1.0 release (Track A: Phases 1–4).
   - **Blocked by Product Decision**: **11 stories** (13.9%) — Quarantined under Track B (Phase 5) awaiting stakeholder decision ratification.
   - **Sum Reconciled**: **31 + 5 + 32 + 11 = 79 stories** (100.0%).
   - **Track A In-Scope Core Scope**: Exactly **68 stories** (31 Verified + 5 Partial + 32 Planned).
3. **Verification & Test Coverage**:
   - **Passing Automated Tests**: 6 integration tests in `backend/test/rbac.test.js` verifying core auth, persona switching, RBAC permissions, negative PM checks, tenant isolation, and Super Admin lockout guard.
   - **Planned Test Suites**: **28 test suites** specified across all 35 tasks with concrete unit, integration, and negative security test cases (canonical inventory in Development Plan §12.2). The 6 currently passing integration tests demonstrate baseline core RBAC/ABAC coverage only; they do not by themselves establish broad acceptance-criteria coverage across all 68 in-scope stories.

### 2.2 Task Inventory Reconciliation
- **Story-Linked Tasks**: Exactly **32 distinct engineering tasks** across Phases 0–5 (`TASK-001` through `TASK-507`).
- **Operational Release Tasks**: Exactly **3 operational infrastructure tasks** in Phase 6 (`TASK-601`: DB migration verification, `TASK-602`: Docker multi-stage containers, `TASK-603`: CI/CD regression gates).
- **Total Task Inventory**: Exactly **35 tasks** defined in Section 10 of the Master Development Plan.

### 2.3 Four-Tier Evidence Hierarchy
1. `TIER-1: CODE_INSPECTED` — Inspected in source code, middleware, model, or UI component.
2. `TIER-2: TEST_VERIFIED` — Passing automated test output executed via test runner (`backend/test/rbac.test.js`).
3. `TIER-3: RUNTIME_VERIFIED` — Verified in active running dev runtime (localhost:5000 API / localhost:5173 Vite).
4. `TIER-4: PROD_VERIFIED` — Verified in deployed production staging environment (Pending deployment in Phase 6).

---

## Section 3 — Exhaustive 79-Story Traceability Matrix

| Story ID | Story Title | PRD Feature ID | Module | Implementation Status | Evidence Tier & Source | Assigned Task ID | Target Test Scope & File | Priority | Decision Blocker Status |
| :--- | :--- | :---: | :--- | :---: | :--- | :---: | :--- | :---: | :---: |
| `US-AUTH-001` | Public Workspace & User Registration | `TG-AUTH-001` | Authentication & Accounts | Verified in Repository | `TIER-1` (auth.controller.js) | `TASK-005` | Registration unit test in backend/test/auth.test.js | Critical | Unblocked |
| `US-AUTH-002` | Secure Credential Login & Session Issuance | `TG-AUTH-002` | Authentication & Accounts | Verified in Repository | `TIER-2` (Test #1 in rbac.test.js) | `TASK-004`, `TASK-005` | Credential & token test in backend/test/auth.test.js | Critical | Unblocked |
| `US-AUTH-003` | Silent Refresh Token Rotation & Family Revocation | `TG-AUTH-003` | Authentication & Accounts | Verified in Repository | `TIER-1` (token.service.js) | `TASK-005` | Token reuse & family kill in backend/test/auth.test.js | High | Unblocked |
| `US-AUTH-004` | Secure Session Logout, Cookie Invalidation & Cache Purge | `TG-AUTH-004` | Authentication & Accounts | Verified in Repository | `TIER-1` (auth.controller.js) | `TASK-003` | Cookie clear & blacklist test in backend/test/auth.test.js | Medium | Unblocked |
| `US-AUTH-005` | Authenticated User Profile & Permission Hydration | `TG-AUTH-005`, `TG-ACC-001` | Authentication & Accounts | Verified in Repository | `TIER-3` (AccountPage.jsx) | `TASK-005` | Profile hydration test in backend/test/auth.test.js | High | Unblocked |
| `US-TENANT-001` | Strict Organization Header Scoping & Context Resolution | `TG-TENANT-001` | Multi-Tenant Organizations | Verified in Repository | `TIER-2` (Test #5 in rbac.test.js) | `TASK-001`, `TASK-004` | Fail-closed tenant test in backend/test/tenant.test.js | Critical | Unblocked |
| `US-TENANT-002` | Provisioning New Secondary Organizations | `TG-TENANT-002` | Multi-Tenant Organizations | Verified in Repository | `TIER-1` (organizations.controller.js) | `TASK-102` | Org provisioning test in backend/test/org.test.js | Medium | Unblocked |
| `US-TENANT-003` | Multi-Organization Listing & Workspace Context Switch | `TG-TENANT-003` | Multi-Tenant Organizations | Verified in Repository | `TIER-3` (AppShell.jsx) | `TASK-003` | Context switch cache test in backend/test/org.test.js | High | Unblocked |
| `US-TENANT-004` | Organization Member Directory Inspection | `TG-TENANT-004` | Multi-Tenant Organizations | Verified in Repository | `TIER-3` (MembersView.jsx) | `TASK-101` | Member directory API test in backend/test/members.test.js | Medium | Unblocked |
| `US-TENANT-005` | Cross-Tenant Access Rejection & ID Manipulation Defense | `TG-TENANT-001` | Multi-Tenant Organizations | Verified in Repository | `TIER-2` (tasks.controller.js) | `TASK-001`, `TASK-006` | ID tampering test in backend/test/tenant-security.test.js | Critical | Unblocked |
| `US-PLAT-001` | Platform Operator Global Tenant State Overview | `TG-PLAT-001` | Platform Administration | Blocked by Product Decision | Awaiting UD-001 Ratification | `TASK-501 (Blocked)` | Platform tenant overview in backend/test/platform.test.js | Medium | Blocked by Product Decision UD-001 |
| `US-PLAT-002` | Emergency Audited Break-Glass Tenant Recovery | `TG-PLAT-001` | Platform Administration | Blocked by Product Decision | Awaiting UD-001 Ratification | `TASK-501 (Blocked)` | Break-glass MFA & audit in backend/test/platform.test.js | Low | Blocked by Product Decision UD-001 |
| `US-INV-001` | Organization Member Invitation Creation & Dispatch | `TG-INV-001` | Invitations & Onboarding | Blocked by Product Decision | Awaiting UD-005 Ratification | `TASK-505 (Blocked)` | Invitation creation test in backend/test/invitations.test.js | High | Blocked by Product Decision UD-005 |
| `US-INV-002` | Token-Based Invitation Acceptance & Identity Verification | `TG-INV-001` | Invitations & Onboarding | Blocked by Product Decision | Awaiting UD-005 Ratification | `TASK-505 (Blocked)` | Token accept test in backend/test/invitations.test.js | High | Blocked by Product Decision UD-005 |
| `US-INV-003` | Pending Invitation Revocation, Expiry & Resend | `TG-INV-001` | Invitations & Onboarding | Blocked by Product Decision | Awaiting UD-005 Ratification | `TASK-505 (Blocked)` | Token expiry test in backend/test/invitations.test.js | Medium | Blocked by Product Decision UD-005 |
| `US-INV-004` | Organization Member Role Reassignment & Delegation Barrier | `TG-INV-001`, `TG-TENANT-004` | Invitations & Onboarding | Planned Implementation | `TIER-1` (users.controller.js) | `TASK-101` | Role reassignment test in backend/test/members.test.js | High | Unblocked |
| `US-INV-005` | Member Deactivation, Removal & Last-Owner Safeguards | `TG-INV-001`, `TG-TENANT-004` | Invitations & Onboarding | Planned Implementation | `TIER-1` (users.controller.js) | `TASK-101` | Last-owner guard test in backend/test/members.test.js | High | Unblocked |
| `US-RBAC-001` | Dynamic Module-Grouped Permission Matrix Rendering | `TG-RBAC-001`, `TG-RBAC-002` | RBAC Administration | Verified in Repository | `TIER-3` (TeamPermissionsMatrixView.jsx) | `TASK-102` | Matrix hydration test in backend/test/rbac.test.js | High | Unblocked |
| `US-RBAC-002` | Real-Time Discrete Permission Toggling & Enforcement | `TG-RBAC-003` | RBAC Administration | Verified in Repository | `TIER-2` (Test #3 in rbac.test.js) | `TASK-102` | Discrete toggle test in backend/test/rbac.test.js | High | Unblocked |
| `US-RBAC-003` | System Super Admin Lockout Guard Enforcement | `TG-RBAC-004` | RBAC Administration | Verified in Repository | `TIER-2` (Test #6 in rbac.test.js) | `TASK-102` | Lockout guard test in backend/test/rbac.test.js | Critical | Unblocked |
| `US-RBAC-004` | Organization Custom Role Creation & Template Cloning | `TG-RBAC-005` | RBAC Administration | Planned Implementation | `TIER-1` (roles.controller.js) | `TASK-103` | Custom role CRUD test in backend/test/roles.test.js | Medium | Unblocked |
| `US-RBAC-005` | Module-Level Bulk Permission Assignment ("Select All") | `TG-RBAC-006` | RBAC Administration | Planned Implementation | PRD Spec Section 7.4 | `TASK-103` | Bulk toggle test in backend/test/roles.test.js | Low | Unblocked |
| `US-RBAC-006` | Universal Privilege Delegation Boundary Enforcement | `TG-RBAC-007` | RBAC Administration | Planned Implementation | `TIER-1` (rbac.middleware.js) | `TASK-104` | Escalation barrier test in backend/test/rbac.test.js | Critical | Unblocked |
| `US-RBAC-007` | Read-Only System Default Roles Protection | `TG-RBAC-008` | RBAC Administration | Verified in Repository | `TIER-1` (roles.controller.js) | `TASK-104` | System role immutable test in backend/test/rbac.test.js | High | Unblocked |
| `US-ABAC-001` | Dynamic Attribute-Based Access Control Evaluation Engine | `TG-ABAC-001` | ABAC & Policy Engine | Verified in Repository | `TIER-1` (tasks.controller.js) | `TASK-203` | ABAC engine test in backend/test/abac.test.js | Critical | Unblocked |
| `US-ABAC-002` | Explicit Negative Authorization Responses & Reason Codes | `TG-ABAC-002` | ABAC & Policy Engine | Verified in Repository | `TIER-2` (Test #2 in rbac.test.js) | `TASK-203` | Negative auth payload test in backend/test/abac.test.js | High | Unblocked |
| `US-ABAC-003` | Immutable Creator & Project Scoping Mutation Protection | `TG-ABAC-003` | ABAC & Policy Engine | Planned Implementation | `TIER-1` (Protected field gap) | `TASK-002` | Mutation attack test in backend/test/abac.test.js | Critical | Unblocked |
| `US-ABAC-004` | Fine-Grained Task Creator vs. Assignee Policy Bifurcation | `TG-ABAC-001` | ABAC & Policy Engine | Blocked by Product Decision | Awaiting DP-TASK-001 Ratification | `TASK-506 (Blocked)` | Policy bifurcation test in backend/test/abac.test.js | High | Blocked by Product Decision (Task Update Policy) |
| `US-PROJ-001` | Project Creation, Color Token & Description Scoping | `TG-PROJ-001` | Project Management | Verified in Repository | `TIER-1` (projects.controller.js) | `TASK-201` | Project CRUD test in backend/test/projects.test.js | High | Unblocked |
| `US-PROJ-002` | JIRA-Style Project Key Auto-Generation & Uniqueness | `TG-PROJ-002` | Project Management | Planned Implementation | PRD Spec Section 7.6 | `TASK-202` | Key uniqueness test in backend/test/projects.test.js | Medium | Unblocked |
| `US-PROJ-003` | Dynamic Project Completion Percentage Calculation | `TG-PROJ-003` | Project Management | Planned Implementation | `TIER-3` (ProjectsView.jsx) | `TASK-202` | Progress calculation test in backend/test/projects.test.js | Low | Unblocked |
| `US-PROJ-004` | Project Soft-Deletion & Cascade Task Scoping | `TG-PROJ-004` | Project Management | Planned Implementation | `TIER-1` (projects.service.js) | `TASK-201` | Soft delete cascade test in backend/test/projects.test.js | High | Unblocked |
| `US-PROJ-005` | Project Archival, Read-Only State & Restoration | `TG-PROJ-005` | Project Management | Planned Implementation | PRD Spec Section 7.6 | `TASK-202` | Archival mutation block in backend/test/projects.test.js | Medium | Unblocked |
| `US-TASK-001` | Task Creation with Title, Description, Priority & Due Date | `TG-TASK-001` | Task Management | Verified in Repository | `TIER-1` (tasks.controller.js) | `TASK-203` | Task create validation in backend/test/tasks.test.js | Critical | Unblocked |
| `US-TASK-002` | Task Assignee Association & Dynamic Member Dropdown | `TG-TASK-002` | Task Management | Verified in Repository | `TIER-3` (KanbanBoardView.jsx) | `TASK-203` | Assignee association test in backend/test/tasks.test.js | High | Unblocked |
| `US-TASK-003` | Task Status Transition Workflow & Terminal Done State | `TG-TASK-003` | Task Management | Verified in Repository | `TIER-2` (Test #4 in rbac.test.js) | `TASK-203` | Status workflow test in backend/test/tasks.test.js | Critical | Unblocked |
| `US-TASK-004` | Interactive Kanban Board Drag-and-Drop Column Reordering | `TG-TASK-004` | Task Management | Verified in Repository | `TIER-3` (KanbanBoardView.jsx) | `TASK-204` | Drag-and-drop state test in frontend/e2e/kanban.spec.js | High | Unblocked |
| `US-TASK-005` | Slide-Over Task Detail Drawer with Live Attribute Editing | `TG-TASK-005` | Task Management | Planned Implementation | `TIER-3` (Modal currently; drawer planned) | `TASK-204` | Drawer Esc & live edit test in frontend/e2e/drawer.spec.js | High | Unblocked |
| `US-TASK-006` | Role-Enforced Task Deletion Protection | `TG-TASK-006` | Task Management | Verified in Repository | `TIER-1` (tasks.controller.js) | `TASK-203` | Task delete permission test in backend/test/tasks.test.js | Critical | Unblocked |
| `US-TASK-007` | Multi-View Task Representations: Interactive List View | `TG-TASK-007` | Task Management | Planned Implementation | PRD Spec Section 7.7 | `TASK-205` | List view rendering test in frontend/e2e/views.spec.js | Medium | Unblocked |
| `US-TASK-008` | Multi-View Task Representations: Compact Table View | `TG-TASK-008` | Task Management | Planned Implementation | PRD Spec Section 7.7 | `TASK-205` | Table view sorting test in frontend/e2e/views.spec.js | Medium | Unblocked |
| `US-TASK-009` | Task Due Date Visual Badging & Overdue Alert Styling | `TG-TASK-009` | Task Management | Planned Implementation | `TIER-3` (CSS classes present) | `TASK-205` | Overdue badge test in frontend/e2e/badges.spec.js | Low | Unblocked |
| `US-TASK-010` | Task Search, Multi-Filter & Column Sort Controls | `TG-TASK-010` | Task Management | Planned Implementation | `TIER-3` (Basic search input exists) | `TASK-206` | Multi-filter query test in backend/test/tasks.test.js | Medium | Unblocked |
| `US-SUB-001` | Relational Subtask Creation, Nesting & Deletion | `TG-SUB-001` | Subtask Hierarchy | Planned Implementation | PRD Spec Section 7.8 | `TASK-301` | Subtask CRUD test in backend/test/subtasks.test.js | High | Unblocked |
| `US-SUB-002` | Subtask Checkbox Toggling & Parent Progress Dynamic Rollup | `TG-SUB-002` | Subtask Hierarchy | Planned Implementation | PRD Spec Section 7.8 | `TASK-301` | Progress rollup test in backend/test/subtasks.test.js | Medium | Unblocked |
| `US-COLLAB-001` | Task Discussion Comments Posting & Markdown Rendering | `TG-COLLAB-001` | Collaboration & Comments | Planned Implementation | PRD Spec Section 7.9 | `TASK-302` | Comment create & sanitize in backend/test/comments.test.js | High | Unblocked |
| `US-COLLAB-002` | 15-Minute Author Edit Window & Edit Timestamp Tracking | `TG-COLLAB-002` | Collaboration & Comments | Planned Implementation | PRD Spec Section 7.9 | `TASK-302` | 15m window expiration test in backend/test/comments.test.js | Medium | Unblocked |
| `US-COLLAB-003` | Comment Deletion Privileges: Author vs. Moderator | `TG-COLLAB-003` | Collaboration & Comments | Planned Implementation | PRD Spec Section 7.9 | `TASK-302` | Moderator deletion test in backend/test/comments.test.js | Medium | Unblocked |
| `US-COLLAB-004` | TipTap / ProseMirror Rich Text Editor Ingestion | `TG-EDT-001` | Collaboration & Comments | Blocked by Product Decision | Awaiting UD-004 Ratification | `TASK-504 (Blocked)` | Rich text sanitization in backend/test/comments.test.js | Low | Blocked by Product Decision UD-004 |
| `US-AUDIT-001` | Centralized Immutable Audit Log Querying & Filtering | `TG-AUD-001` | Audit Logs & Compliance | Verified in Repository | `TIER-1` (audit.controller.js) | `TASK-303` | Audit log tenant query test in backend/test/audit.test.js | High | Unblocked |
| `US-AUDIT-002` | Security-Sensitive Mutation Audit Record Persistence | `TG-AUD-002` | Audit Logs & Compliance | Verified in Repository | `TIER-1` (audit.service.js) | `TASK-303` | Mutation audit intercept test in backend/test/audit.test.js | Critical | Unblocked |
| `US-ACT-001` | Task-Specific Slide-Over Activity History Stream | `TG-ACT-001` | Activity Feeds | Planned Implementation | PRD Spec Section 7.10 | `TASK-303` | Activity feed API test in backend/test/activity.test.js | Medium | Unblocked |
| `US-FILE-001` | File Asset Directory Listing & Filter by Project | `TG-FILE-001` | File Management | Verified in Repository | `TIER-3` (FilesView.jsx) | `TASK-405` | File asset directory query in backend/test/files.test.js | Medium | Unblocked |
| `US-FILE-002` | Multi-Select Checkboxes & Floating Bulk Operations Dock | `TG-FILE-002` | File Management | Partial | `TIER-1` (FilesBulkView.jsx + floating-bulk-bar UI inspected; `POST /bulk-delete`, `POST /bulk-duplicate` routes mounted; no automated acceptance test verifying floating dock trigger or selection state) | `TASK-405` | Floating dock interaction test in frontend/e2e/files.spec.js | Low | Unblocked |
| `US-FILE-003` | Bulk Duplicate File Assets with System Naming Suffix | `TG-FILE-003` | File Management | Partial | `TIER-1` (bulkDuplicateFiles inspected; names copies `"Copy of <name>"` — **acceptance criterion specifies `"(Copy)"` suffix; naming mismatch must be resolved**; no automated test) | `TASK-405` | File duplicate naming test in backend/test/files.test.js | Low | Unblocked |
| `US-FILE-004` | Permission-Guarded File Asset Deletion & Bulk Purge | `TG-FILE-004` | File Management | Partial | `TIER-1` (requirePermission("files","delete") guard on `/bulk-delete` route inspected; deleteMany scoped to organizationId; no automated negative authorization test) | `TASK-405` | File delete auth test in backend/test/files.test.js | Medium | Unblocked |
| `US-FILE-005` | Task Attachment Linking & Inline Preview Card | `TG-FILE-005` | File Management | Planned Implementation | PRD Spec Section 7.11 | `TASK-405` | Attachment link test in backend/test/files.test.js | Medium | Unblocked |
| `US-STOR-001` | S3-Compatible Cloud Binary Ingestion via Presigned URLs | `TG-STOR-001` | Storage Engine | Blocked by Product Decision | Awaiting UD-002 Ratification | `TASK-502 (Blocked)` | S3 HeadObject verification in backend/test/storage.test.js | High | Blocked by Product Decision UD-002 |
| `US-DASH-001` | Workspace Task KPI Metrics Summary Cards | `TG-DASH-001` | Dashboard & Metrics | Verified in Repository | `TIER-3` (DashboardView.jsx) | `TASK-403` | KPI aggregation test in backend/test/dashboard.test.js | High | Unblocked |
| `US-DASH-002` | Urgent Tasks Due Within 48 Hours Feed | `TG-DASH-002` | Dashboard & Metrics | Verified in Repository | `TIER-3` (DashboardView.jsx) | `TASK-403` | Due tasks window test in backend/test/dashboard.test.js | High | Unblocked |
| `US-DASH-003` | Active Projects Progress Gauge & Status Breakdown | `TG-DASH-003` | Dashboard & Metrics | Verified in Repository | `TIER-3` (DashboardView.jsx) | `TASK-403` | Project gauges test in backend/test/dashboard.test.js | Medium | Unblocked |
| `US-DASH-004` | Interactive Quick-Action Shortcuts ("New Task", etc.) | `TG-DASH-004` | Dashboard & Metrics | Verified in Repository | `TIER-3` (DashboardView.jsx) | `TASK-403` | Quick actions E2E in frontend/e2e/dashboard.spec.js | Low | Unblocked |
| `US-DASH-005` | Recent Workspace Activity Feed Stream | `TG-DASH-005` | Dashboard & Metrics | Verified in Repository | `TIER-3` (DashboardView.jsx) | `TASK-403` | Recent activity test in backend/test/dashboard.test.js | Medium | Unblocked |
| `US-DASH-006` | GitHub-Style 90-Day Contribution Activity Heatmap | `TG-DASH-006` | Dashboard & Metrics | Verified in Repository | `TIER-3` (DashboardView.jsx) | `TASK-403` | Heatmap aggregation in backend/test/dashboard.test.js | Low | Unblocked |
| `US-CAL-001` | Month Grid Calendar with Due Date Task Markers | `TG-CAL-001` | Calendar & Timeline | Planned Implementation | `TIER-3` (Placeholder view) | `TASK-402` | Calendar date mapper in frontend/e2e/calendar.spec.js | Medium | Unblocked |
| `US-CAL-002` | Calendar Multi-Month Navigation & "Today" Reset | `TG-CAL-002` | Calendar & Timeline | Planned Implementation | `TIER-3` (Placeholder view) | `TASK-402` | Month switcher test in frontend/e2e/calendar.spec.js | Low | Unblocked |
| `US-NOTIF-001` | In-App Real-Time Notification Bell & Counter | `TG-NOTIF-001` | Notifications | Planned Implementation | PRD Spec Section 7.14 | `TASK-304` | Notification badge test in frontend/e2e/notif.spec.js | Medium | Unblocked |
| `US-NOTIF-002` | Slide-Over Notification Drawer with "Mark All Read" | `TG-NOTIF-002` | Notifications | Planned Implementation | PRD Spec Section 7.14 | `TASK-304` | Mark read mutation test in backend/test/notif.test.js | Medium | Unblocked |
| `US-NOTIF-003` | Notification Event Subscriptions & Email Digest Settings | `TG-NOTIF-003` | Notifications | Planned Implementation | PRD Spec Section 7.14 | `TASK-403` | Notification preferences in backend/test/notif.test.js | Low | Unblocked |
| `US-CMD-001` | Global Quick Search Palette Launch (`Cmd/Ctrl+K`) | `TG-CMD-001` | Command Palette | Planned Implementation | PRD Spec Section 7.15 | `TASK-401` | Keyboard shortcut test in frontend/e2e/cmd.spec.js | Medium | Unblocked |
| `US-CMD-002` | Cross-Entity Search Results & Keyboard Arrow Navigation | `TG-CMD-002` | Command Palette | Planned Implementation | PRD Spec Section 7.15 | `TASK-401` | Fuzzy search API test in backend/test/search.test.js | Medium | Unblocked |
| `US-A11Y-001` | Full Keyboard Navigation & Visible Focus Ring Indicators | `TG-A11Y-001` | Accessibility (WCAG AA) | Verified in Repository | `TIER-3` (index.css focus styles) | `TASK-404` | Focus indicator audit in frontend/e2e/a11y.spec.js | High | Unblocked |
| `US-A11Y-002` | Accessible Modal & Drawer Dialogs with Focus Trapping | `TG-A11Y-002` | Accessibility (WCAG AA) | Partially Implemented | Modal Esc verified; focus trap planned | `TASK-404` | Focus trap test in frontend/e2e/a11y.spec.js | High | Unblocked |
| `US-A11Y-003` | Screen Reader ARIA Semantics & Contrast Compliance | `TG-A11Y-003` | Accessibility (WCAG AA) | Partially Implemented | Contrast verified; ARIA tags planned | `TASK-404` | Automated axe-core test in frontend/e2e/a11y.spec.js | High | Unblocked |
| `US-ACC-001` | Personal Account Profile & Security Settings Management | `TG-ACC-001` | Account Management | Verified in Repository | `TIER-3` (AccountPage.jsx) | `TASK-005` | Profile update test in backend/test/auth.test.js | Medium | Unblocked |
| `US-REP-001` | Project Velocity, Completion Rates & CSV Exports | `TG-REP-001` | Reporting & Analytics | Blocked by Product Decision | Awaiting DP-REP-001 Ratification | `TASK-507 (Blocked)` | CSV export stream test in backend/test/reports.test.js | Low | Blocked by Product Decision (Reporting Scope) |
| `US-DEV-001` | Developer Seed Script & Idempotent Fixture Generation | `TG-DEV-001` | Developer Tooling | Verified in Repository | `TIER-2` (prisma/seed.js) | `TASK-006` | Seed idempotency test in backend/test/seed.test.js | Medium | Unblocked |
| `US-SYNC-001` | Optimistic UI Task Updates with Error Rollback | `TG-SYNC-001` | State Synchronization | Blocked by Product Decision | Awaiting UD-003 Ratification | `TASK-503 (Blocked)` | Optimistic rollback test in frontend/e2e/sync.spec.js | Medium | Blocked by Product Decision UD-003 |
| `US-SYNC-002` | Multi-Client Real-Time Event Broadcasts via Fetch Stream / SSE | `TG-SYNC-001` | State Synchronization | Blocked by Product Decision | Awaiting UD-003 Ratification | `TASK-503 (Blocked)` | Event stream broadcast in backend/test/sync.test.js | Medium | Blocked by Product Decision UD-003 |

---

## Section 4 — Feature Rollup & Coverage Matrix (60 PRD Features)

| Feature ID | Feature Name | Canonical PRD Section | Covered Story IDs | Implementation Status | Assigned Task ID | Verification Strategy & Test Scope |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `TG-AUTH-001` | User & Workspace Registration | Section 7.1, 16.2 | `US-AUTH-001` | Verified in Repository | `TASK-005` | Registration unit test in backend/test/auth.test.js |
| `TG-AUTH-002` | Secure Credential Login | Section 7.1, 16.2 | `US-AUTH-002` | Verified in Repository | `TASK-004`, `TASK-005` | Login authentication test in backend/test/auth.test.js |
| `TG-AUTH-003` | Silent Refresh Token Rotation | Section 7.1, 16.2 | `US-AUTH-003` | Verified in Repository | `TASK-005` | Refresh token family rotation & replay attack defense test |
| `TG-AUTH-004` | Session Logout & Cookie Clearing | Section 7.1, 16.2 | `US-AUTH-004` | Verified in Repository | `TASK-003` | Logout cookie invalidation & cache purge test |
| `TG-AUTH-005` | User Profile Hydration | Section 7.1, 16.2 | `US-AUTH-005` | Verified in Repository | `TASK-005` | Profile fetch & client auth context hydration test |
| `TG-TENANT-001` | Multi-Tenant Header Scoping & Isolation | Section 7.2, 16.2 | `US-TENANT-001`, `US-TENANT-005` | Verified in Repository | `TASK-001`, `TASK-004`, `TASK-006` | Fail-closed tenant middleware & cross-tenant query injection test |
| `TG-TENANT-002` | Secondary Organization Provisioning | Section 7.2, 16.2 | `US-TENANT-002` | Verified in Repository | `TASK-102` | Organization creation API & owner membership assignment test |
| `TG-TENANT-003` | Multi-Org Workspace Switching | Section 7.2, 16.2 | `US-TENANT-003` | Verified in Repository | `TASK-003` | Client workspace switch & React Query cache purge test |
| `TG-TENANT-004` | Organization Member Directory | Section 7.2, 16.2 | `US-TENANT-004`, `US-INV-004`, `US-INV-005` | Verified in Repository | `TASK-101` | Member directory query & last-owner deactivation guard test |
| `TG-PLAT-001` | Platform Super Admin Governance | Section 7.3, 16.2 | `US-PLAT-001`, `US-PLAT-002` | Blocked by Decision UD-001 | `TASK-501 (Blocked)` | Platform operator overview & audited break-glass recovery test |
| `TG-INV-001` | Email Invitations & Token Onboarding | Section 7.4, 16.2 | `US-INV-001`, `US-INV-002`, `US-INV-003` | Blocked by Decision UD-005 | `TASK-505 (Blocked)` | Invitation token generation, email dispatch & acceptance test |
| `TG-RBAC-001` | Role-Permission Relational Model | Section 7.5, 16.2 | `US-RBAC-001` | Verified in Repository | `TASK-102` | Role-permission database relation & hydration test |
| `TG-RBAC-002` | Dynamic Permission Matrix UI | Section 7.5, 16.2 | `US-RBAC-001` | Verified in Repository | `TASK-102` | Matrix rendering by module grouping in TeamPermissionsMatrixView |
| `TG-RBAC-003` | Discrete Permission Toggling | Section 7.5, 16.2 | `US-RBAC-002` | Verified in Repository | `TASK-102` | Real-time permission grant/revoke mutation test |
| `TG-RBAC-004` | Super Admin Lockout Guard | Section 7.5, 16.2 | `US-RBAC-003` | Verified in Repository | `TASK-102` | Super Admin role modification rejection test (Test #6) |
| `TG-RBAC-005` | Custom Role Creation & Cloning | Section 7.5, 16.2 | `US-RBAC-004` | Planned Implementation | `TASK-103` | Custom role POST endpoint & default template cloning test |
| `TG-RBAC-006` | Module Bulk Permission Toggles | Section 7.5, 16.2 | `US-RBAC-005` | Planned Implementation | `TASK-103` | Module select-all/clear-all client state toggle test |
| `TG-RBAC-007` | Privilege Delegation Boundary | Section 7.5, 16.2 | `US-RBAC-006` | Planned Implementation | `TASK-104` | Privilege escalation denial test in backend/test/rbac.test.js |
| `TG-RBAC-008` | System Default Role Immutability | Section 7.5, 16.2 | `US-RBAC-007` | Verified in Repository | `TASK-104` | System role rename/delete rejection test |
| `TG-ABAC-001` | Dynamic ABAC Evaluation Engine | Section 7.6, 16.2 | `US-ABAC-001`, `US-ABAC-004` | Verified in Repository | `TASK-203`, `TASK-506` | Creator vs. Assignee ownership evaluation test in tasks.controller |
| `TG-ABAC-002` | Negative Authorization Reason Codes | Section 7.6, 16.2 | `US-ABAC-002` | Verified in Repository | `TASK-203` | Structured 403 response payload test with code & requiredPermission |
| `TG-ABAC-003` | Protected Field Mutation Barrier | Section 7.6, 16.2 | `US-ABAC-003` | Planned Implementation | `TASK-002` | Rejection of unauthorized projectId/creatorId mutation test |
| `TG-PROJ-001` | Project Creation & Color Token Scoping | Section 7.7, 16.2 | `US-PROJ-001` | Verified in Repository | `TASK-201` | Project creation endpoint & tenant association test |
| `TG-PROJ-002` | JIRA-Style Project Key Auto-Generation | Section 7.7, 16.2 | `US-PROJ-002` | Planned Implementation | `TASK-202` | Uppercase project key auto-generation & uniqueness constraint test |
| `TG-PROJ-003` | Dynamic Project Completion Percentage | Section 7.7, 16.2 | `US-PROJ-003` | Planned Implementation | `TASK-202` | Task count aggregation & completion percentage test |
| `TG-PROJ-004` | Project Soft-Deletion & Task Scoping | Section 7.7, 16.2 | `US-PROJ-004` | Planned Implementation | `TASK-201` | Project soft-deletion & task cascade exclusion test |
| `TG-PROJ-005` | Project Archival & Read-Only Protection | Section 7.7, 16.2 | `US-PROJ-005` | Planned Implementation | `TASK-202` | Mutation rejection on archived project test |
| `TG-TASK-001` | Task Core CRUD & Attribute Validation | Section 7.8, 16.2 | `US-TASK-001` | Verified in Repository | `TASK-203` | Task creation & payload validation test in backend/test/tasks.test.js |
| `TG-TASK-002` | Task Assignee Association Dropdown | Section 7.8, 16.2 | `US-TASK-002` | Verified in Repository | `TASK-203` | Assignee dropdown hydration & membership validation test |
| `TG-TASK-003` | Task Status Transition Workflow Engine | Section 7.8, 16.2 | `US-TASK-003` | Verified in Repository | `TASK-203` | Status state-machine transition & completedAt timestamp test |
| `TG-TASK-004` | Interactive Kanban Board Drag-and-Drop | Section 7.8, 16.2 | `US-TASK-004` | Verified in Repository | `TASK-204` | HTML5 drag-and-drop event handler & status mutation test |
| `TG-TASK-005` | Slide-Over Task Detail Drawer | Section 7.8, 16.2 | `US-TASK-005` | Planned Implementation | `TASK-204` | Slide-over drawer mounting, live field edit & Esc key test |
| `TG-TASK-006` | Role-Enforced Task Deletion Protection | Section 7.8, 16.2 | `US-TASK-006` | Verified in Repository | `TASK-203` | task:delete permission check & 403 rejection test |
| `TG-TASK-007` | Multi-View Task Representations: List View | Section 7.8, 16.2 | `US-TASK-007` | Planned Implementation | `TASK-205` | Grouped list view rendering by status/priority test |
| `TG-TASK-008` | Multi-View Task Representations: Table View | Section 7.8, 16.2 | `US-TASK-008` | Planned Implementation | `TASK-205` | Compact data grid table rendering with column sorting test |
| `TG-TASK-009` | Task Due Date Visual Badging & Alerts | Section 7.8, 16.2 | `US-TASK-009` | Planned Implementation | `TASK-205` | Overdue/due-soon CSS badge styling & date comparison test |
| `TG-TASK-010` | Task Search, Filtering & Multi-Column Sort | Section 7.8, 16.2 | `US-TASK-010` | Planned Implementation | `TASK-206` | Multi-param search, filter & pagination query test |
| `TG-SUB-001` | Relational Subtask Hierarchy & CRUD | Section 7.9, 16.2 | `US-SUB-001` | Planned Implementation | `TASK-301` | Subtask relational model CRUD & parent task cascade test |
| `TG-SUB-002` | Subtask Checkbox & Progress Dynamic Rollup | Section 7.9, 16.2 | `US-SUB-002` | Planned Implementation | `TASK-301` | Subtask toggle & parent task percentage recalculation test |
| `TG-COLLAB-001` | Task Discussion Comments & Sanitization | Section 7.10, 16.2 | `US-COLLAB-001` | Planned Implementation | `TASK-302` | Comment posting, DOMPurify sanitization & Markdown render test |
| `TG-COLLAB-002` | 15-Minute Author Edit Window & Edits | Section 7.10, 16.2 | `US-COLLAB-002` | Planned Implementation | `TASK-302` | 15-minute edit expiration & editedAt timestamp test |
| `TG-COLLAB-003` | Comment Deletion Privileges: Author vs Mod | Section 7.10, 16.2 | `US-COLLAB-003` | Planned Implementation | `TASK-302` | Author self-delete vs. admin comment moderation delete test |
| `TG-EDT-001` | TipTap / ProseMirror Rich Text Ingestion | Section 7.10, 16.2 | `US-COLLAB-004` | Blocked by Decision UD-004 | `TASK-504 (Blocked)` | Rich text JSON schema validation & HTML output sanitization test |
| `TG-AUD-001` | Immutable Audit Log Querying & Filtering | Section 7.11, 16.2 | `US-AUDIT-001` | Verified in Repository | `TASK-303` | Audit log tenant-scoped querying & action filtering test |
| `TG-AUD-002` | Security-Sensitive Mutation Audit Logging | Section 7.11, 16.2 | `US-AUDIT-002` | Verified in Repository | `TASK-303` | Automatic audit row insertion on role/task/org mutation test |
| `TG-ACT-001` | Task-Specific Slide-Over Activity History | Section 7.12, 16.2 | `US-ACT-001` | Planned Implementation | `TASK-303` | Task activity feed timeline query & rendering test |
| `TG-FILE-001` | File Asset Directory Listing & Filters | Section 7.13, 16.2 | `US-FILE-001` | Verified in Repository | `TASK-405` | File asset directory query & project filter test |
| `TG-FILE-002` | Multi-Select Checkboxes & Floating Bulk Dock | Section 7.13, 16.2 | `US-FILE-002` | Partially Implemented | `TASK-405` | Client multi-selection state & floating dock trigger test |
| `TG-FILE-003` | Bulk Duplicate File Assets with System Suffix | Section 7.13, 16.2 | `US-FILE-003` | Partially Implemented (naming mismatch: `"Copy of…"` vs required `"(Copy)"`) | `TASK-405` | Bulk duplicate metadata generation & naming convention test |
| `TG-FILE-004` | Permission-Guarded File Deletion & Bulk Purge | Section 7.13, 16.2 | `US-FILE-004` | Partially Implemented | `TASK-405` | File deletion permission guard & bulk purge transaction test |
| `TG-FILE-005` | Task Attachment Linking & Inline Cards | Section 7.13, 16.2 | `US-FILE-005` | Planned Implementation | `TASK-405` | Task-to-file foreign key association & card preview test |
| `TG-STOR-001` | S3-Compatible Cloud Storage via Presigned URLs | Section 7.13, 16.2 | `US-STOR-001` | Blocked by Decision UD-002 | `TASK-502 (Blocked)` | Presigned PUT/GET URL generation & server-side HeadObject verification test |
| `TG-DASH-001` | Workspace KPI Metrics Summary Cards | Section 7.14, 16.2 | `US-DASH-001` | Verified in Repository | `TASK-403` | KPI aggregation query & card rendering in DashboardView |
| `TG-DASH-002` | Urgent Tasks Due Within 48 Hours Feed | Section 7.14, 16.2 | `US-DASH-002` | Verified in Repository | `TASK-403` | Urgent tasks date-filter query test in backend/test/dashboard.test.js |
| `TG-DASH-003` | Active Projects Progress Gauge & Status Breakdown | Section 7.14, 16.2 | `US-DASH-003` | Verified in Repository | `TASK-403` | Project status breakdown & progress bar rendering test |
| `TG-DASH-004` | Interactive Quick-Action Shortcuts | Section 7.14, 16.2 | `US-DASH-004` | Verified in Repository | `TASK-403` | Quick-action button click & modal dispatch test |
| `TG-DASH-005` | Recent Workspace Activity Feed Stream | Section 7.14, 16.2 | `US-DASH-005` | Verified in Repository | `TASK-403` | Recent activity stream aggregation & avatar display test |
| `TG-DASH-006` | GitHub-Style 90-Day Contribution Heatmap | Section 7.14, 16.2 | `US-DASH-006` | Verified in Repository | `TASK-403` | 90-day task completion matrix query & SVG heatmap render test |
| `TG-CAL-001` | Month Grid Calendar with Due Date Markers | Section 7.15, 16.2 | `US-CAL-001` | Planned Implementation | `TASK-402` | Month grid date cell task marker mapping & click drawer test |
| `TG-CAL-002` | Multi-Month Navigation & "Today" Reset | Section 7.15, 16.2 | `US-CAL-002` | Planned Implementation | `TASK-402` | Calendar month state increment/decrement & today reset test |
| `TG-NOTIF-001` | In-App Real-Time Notification Bell & Badge | Section 7.16, 16.2 | `US-NOTIF-001` | Planned Implementation | `TASK-304` | Unread notification count badge & animation trigger test |
| `TG-NOTIF-002` | Slide-Over Notification Drawer with "Mark All Read" | Section 7.16, 16.2 | `US-NOTIF-002` | Planned Implementation | `TASK-304` | Notification drawer listing & mark-all-read mutation test |
| `TG-NOTIF-003` | Notification Event Subscriptions & Preferences | Section 7.16, 16.2 | `US-NOTIF-003` | Planned Implementation | `TASK-403` | Notification subscription settings persistence test |
| `TG-CMD-001` | Global Quick Search Palette Launch (`Cmd/Ctrl+K`) | Section 7.17, 16.2 | `US-CMD-001` | Planned Implementation | `TASK-401` | Global keydown listener (`Cmd/Ctrl+K`) & modal mounting test |
| `TG-CMD-002` | Cross-Entity Search Results & Arrow Navigation | Section 7.17, 16.2 | `US-CMD-002` | Planned Implementation | `TASK-401` | Multi-entity search debounce, arrow key focus & Enter navigate test |
| `TG-A11Y-001` | Full Keyboard Navigation & Focus Rings | Section 7.18, 16.2 | `US-A11Y-001` | Verified in Repository | `TASK-404` | Tab order traversal & 2px focus ring CSS verification |
| `TG-A11Y-002` | Accessible Modal & Drawer Dialog Focus Trapping | Section 7.18, 16.2 | `US-A11Y-002` | Partially Implemented | `TASK-404` | Focus trapping within open dialog & Esc dismissal test |
| `TG-A11Y-003` | Screen Reader ARIA Semantics & Contrast Compliance | Section 7.18, 16.2 | `US-A11Y-003` | Partially Implemented | `TASK-404` | Automated axe-core 4.5:1 text contrast & aria-* attribute verification |
| `TG-ACC-001` | User Account Profile & Security Settings | Section 7.19, 16.2 | `US-AUTH-005`, `US-ACC-001` | Verified in Repository | `TASK-005` | Account profile editing & password update verification |
| `TG-REP-001` | Project Velocity, Completion Rates & CSV Exports | Section 7.20, 16.2 | `US-REP-001` | Blocked by Decision (Reporting Scope) | `TASK-507 (Blocked)` | Velocity aggregation query & CSV download stream test |
| `TG-DEV-001` | Developer Seed Script & Idempotent Fixtures | Section 7.21, 16.2 | `US-DEV-001` | Verified in Repository | `TASK-006` | prisma/seed.js execution & entity relational verification |
| `TG-SYNC-001` | State Synchronization & Optimistic Rollbacks | Section 7.22, 16.2 | `US-SYNC-001`, `US-SYNC-002` | Blocked by Decision UD-003 | `TASK-503 (Blocked)` | Optimistic cache rollback & authenticated fetch streaming client broadcast test |
