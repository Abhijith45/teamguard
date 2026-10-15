# TeamGuard Decision Register & Architectural Blocker Catalog

---

## Section 1 — Document Control

| Metadata Field | Value |
| :--- | :--- |
| **Document Title** | TeamGuard Decision Register & Architectural Blocker Catalog |
| **Document Identifier** | `TG-DEC-v1.1.0` |
| **Target Path** | [docs/planning/teamguard-decision-register.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-decision-register.md) |
| **Document Version** | `1.1.0-draft` |
| **Document Status** | Engineering Planning Draft — Pending Requirements and Decision Ratification |
| **Last Updated** | 2026-10-14 |
| **Requirements Source** | [.agents/rules/teamguard-product-specs.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-product-specs.md) (`v1.1.0-draft`) |
| **Security Standards** | [.agents/rules/teamguard-rbac.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/.agents/rules/teamguard-rbac.md) |
| **User Stories Baseline** | [docs/product/teamguard-user-stories.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md) (`TG-USC-v1.0.1-revised`) |
| **Master Development Plan** | [docs/planning/teamguard-development-plan.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-development-plan.md) |
| **Story Traceability Matrix** | [docs/planning/teamguard-story-traceability.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-story-traceability.md) |
| **Release Checklist** | [docs/planning/teamguard-release-checklist.md](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-release-checklist.md) |
| **Author / Custodians** | Principal Software Architect, Security Engineer, Senior Technical Project Manager |

---

## Section 2 — Executive Summary & Governance Policy

### 2.1 Governance Standard & Non-Approval Principle
In strict adherence to TeamGuard document governance:
1. **Separation of Proposal from Ratification**: Inclusion of an architectural recommendation in this register does **not** constitute stakeholder approval. All 7 decisions remain in state `PROPOSED_RECOMMENDATION` until formally signed off.
2. **Preservation of Blockers**: Features and user stories that depend on pending decisions are formally classified as **`Blocked by Product Decision`**. Engineering teams must not write production code, deploy API endpoints, or execute database schema migrations for blocked capabilities until stakeholder ratification is formally recorded.
3. **Provisional Design Fallback & Rejection Rule**:
   > [!IMPORTANT]
   > **Provisional designs do NOT silently become implementation requirements.**
   > If a proposed recommendation is rejected or deferred by stakeholders, the associated feature is **formally excluded from the release** under the following routing contract:
   >
   > **Routing Contract for Excluded Features**:
   > - Excluded API path prefixes (e.g. `/api/v1/platform/*`, `/api/v1/invitations/*`) **must not be left truly unmounted** (which would fall through to the default 404 handler and produce an ambiguous response). Instead, they **must be explicitly intercepted** by a dedicated `featureExclusionHandler` middleware registered for each excluded prefix.
   > - The `featureExclusionHandler` returns a standardized **`HTTP 501 Not Implemented`** response (RFC 7807 JSON body: `{ "type": "urn:teamguard:error:not-implemented", "title": "Not Implemented", "status": 501, "detail": "This feature is not enabled in the current release." }`).
   > - The handler **must not execute any application logic, query the database, or produce any side effect** — it is a pure static response.
   > - **Verified absence of accidental mounting**: A dedicated integration test (`backend/test/feature-exclusion.test.js`) must assert `HTTP 501` for every excluded route prefix and must verify that no sub-route under an excluded prefix is accidentally mounted (e.g., by enumerating all registered Express routes and asserting none match the excluded prefix pattern).
   > - Frontend navigation items, sidebar links, and controls for excluded features must be completely absent from the compiled bundle (verified by a bundle analysis check that no excluded component is imported in the production entry point).
4. **Two-Track Release Decoupling**: Core release development (Track A: Phases 0–4 and Phase 6) proceeds completely in parallel without taking dependencies on unresolved choices. Blocked capabilities are quarantined under Track B (Phase 5).

### 2.2 Comprehensive Decision Blocker Inventory

| Decision ID | Decision Scope & Title | Governance State | Decision Owner | Designated Approver | Blocked Stories | Affected Features | Recommended Option | Operational Assumptions |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **UD-001** | Platform Administration & Break-Glass Recovery | `PROPOSED_RECOMMENDATION` | Principal Architect | Product Steering & Security Lead | `US-PLAT-001`, `US-PLAT-002` | `TG-PLAT-001` | Option B: Unified App with Operator Context & MFA Step-Up | Internal admin flag; TOTP MFA step-up; ITSM ticket validation; 60m session limit. |
| **UD-002** | Cloud Binary Object Storage Provider | `PROPOSED_RECOMMENDATION` | Principal Architect | Product Steering & Security Lead | `US-STOR-001` | `TG-FILE-005`, `TG-STOR-001` | Option A: S3-Compatible Storage via Presigned URLs | Cloudflare R2 ($0 egress) or AWS S3; server-side `HeadObject` check; tenant-prefix isolation. |
| **UD-003** | Real-Time Transport & State Synchronization | `PROPOSED_RECOMMENDATION` | Principal Architect | Product Steering & Lead Frontend | `US-SYNC-001`, `US-SYNC-002` | `TG-SYNC-001` | Option B: SSE via Authenticated Fetch Streaming Client | `@microsoft/fetch-event-source` client with headers; `AbortController` cancellation; smart polling fallback. |
| **UD-004** | Rich Text Description & Comment Editor | `PROPOSED_RECOMMENDATION` | Principal Architect | Product Steering & UX Lead | `US-COLLAB-004` | `TG-EDT-001` | Option A: TipTap / ProseMirror with DOMPurify | JSON ProseMirror document schema; server-side DOMPurify HTML sanitization; CSP compliance. |
| **UD-005** | Member Invitation Delivery Mechanism | `PROPOSED_RECOMMENDATION` | Principal Architect | Product Steering & Security Lead | `US-INV-001`, `US-INV-002`, `US-INV-003` | `TG-INV-001` | Option B: Resend Transactional Email API + Token Fallback | Resend transactional email API; 7-day token expiration; strict recipient email matching. |
| **DP-TASK-001** | Task Creator vs. Assignee Policy Bifurcation | `PROPOSED_RECOMMENDATION` | Principal Architect | Product Steering Committee | `US-ABAC-004` | `TG-ABAC-001` | Option B: Discrete Bifurcation (`task:update:own` vs. `assigned`) | Discrete permissions; ABAC ownership check evaluates creator vs assignee status. |
| **DP-REP-001** | Reporting Scope, Metrics & Export Formats | `PROPOSED_RECOMMENDATION` | Principal Architect | Product Steering Committee | `US-REP-001` | `TG-REP-001` | Option A: Streaming CSV Export of Task Velocity & Audit History | Direct database streaming of CSV format (`text/csv`); zero heavy binary PDF dependencies. |

---

## Section 3 — Detailed Decision Dossiers

---

### Decision UD-001: Platform Administration Architecture & Break-Glass Recovery

#### 1. Context & Problem Statement
TeamGuard is a multi-tenant platform. While customer data is segregated by `organizationId`, platform operators require a mechanism to monitor global tenant health, provision organizations, suspend malicious tenants, and execute audited emergency break-glass recovery when a customer organization's sole Super Admin loses access or leaves the company.

#### 2. Affected User Stories & PRD Features
- **User Stories**: [`US-PLAT-001`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L457), [`US-PLAT-002`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L890)
- **PRD Feature**: `TG-PLAT-001` (Section 7.3, Section 16.2)
- **Blocked Engineering Task**: `TASK-501 (Blocked)`

#### 3. Options Under Consideration

##### Option A: Standalone Platform Administration Micro-Service & Portal
- Separate Express service and separate React application deployed to a restricted internal domain (e.g., `admin.teamguard.io`).
- Requires maintaining two frontend codebases, two deployment pipelines, and custom cross-service authentication.
- *Pros*: Complete physical code and deployment segregation from customer-facing application.
- *Cons*: High maintenance overhead; duplicated UI components; complex deployment topology for early-stage SaaS.

##### Option B: Unified Application with Operator Context & MFA Step-Up (Recommended)
- Platform administration routes (`/api/v1/platform/*`) integrated into the primary backend but guarded by strict platform middleware (`requirePlatformAdmin`).
- UI delivered as a dedicated, route-level `PlatformAdminView.jsx` accessible only when caller account has `isPlatformAdmin = true`.
- Break-glass emergency tenant access requires rigorous server-enforced controls detailed below.
- *Pros*: Leverages existing authentication, database connection pools, design system, and deployment pipeline; rapid time-to-market.
- *Cons*: Requires rigorous server-side middleware defense to guarantee platform operators cannot inadvertently cross into tenant business data without audited authorization.

#### 4. Architecture & Security Evaluation: Break-Glass Enforcement Model
Break-glass recovery cannot be a client-only safeguard. The backend must enforce:
1. **MFA Step-Up Token Issuance & Binding**:
   - The operator must submit a valid TOTP code to `POST /api/v1/platform/mfa/verify`.
   - The server issues a cryptographically signed, ephemeral JWT step-up token (`x-mfa-token`) with a maximum validity window of **5 minutes**.
   - The token contains a single-use cryptographically random nonce stored in Redis/PostgreSQL to prevent token replay.
   - The token is strictly bound to the `operatorId`, the `targetOrganizationId`, and the permitted emergency action.
2. **ITSM Ticket Validation**:
   - Every emergency request requires a validated external ITSM ticket ID matching the regex `/^TG-[0-9]{4,8}$/`.
3. **Action Scope Restriction**:
   - Break-glass privileges are strictly confined to emergency administrative repair: designating a new Organization Owner, un-suspending a tenant, or resetting an orphaned admin account.
   - Operators **cannot** browse customer task descriptions, read project comments, or download customer binary files.
4. **Tamper-Resistant Audit Trail**:
   - Break-glass mutations append an immutable record to `PlatformAuditLog` containing: `operatorId`, `targetOrganizationId`, `ticketId`, `action`, `ipAddress`, `timestamp`, and a cryptographic SHA-256 hash chaining to the previous audit log row (`prevLogHash`) to guarantee tamper-resistance.
5. **Alert Delivery — Durable Outbox Pattern (Fail-Observable, Not Fail-Blocking)**:
   - Immediately before committing the break-glass audit record, the system writes a corresponding `BreakGlassAlertOutbox` row (containing recipient list, event payload, and `pendingDispatch` flag) inside the **same database transaction** as the `PlatformAuditLog` insertion. This guarantees the alert obligation is durably recorded before any commit.
   - After the database transaction commits successfully, a background worker (or async job) reads the outbox, dispatches email and webhook notifications to all registered administrators of the target organization and the central Security Operations webhook, and marks the outbox row `dispatched` on success.
   - If dispatch fails (email API timeout, webhook unreachable), the outbox row is retried with exponential back-off (3 attempts, 30 s / 2 m / 10 m delay). Persistent dispatch failures after all retries are logged to an immutable `BreakGlassAlertFailureLog` and surface a `CRITICAL` alert to the on-call monitoring channel.
   - **The break-glass operation is NOT rolled back on alert dispatch failure.** The audit record and Owner designation change are permanent. Delivery failure is observable and remediable; silent stealth access is prevented because the outbox commitment is atomic with the audit write.
6. **Mandatory Post-Incident Review**:
   - Requires dual-authorization sign-off: Security Lead must review and formally close the break-glass incident within 24 hours.

#### 5. Independent vs. Blocked Tasks
- **Independent**: All tenant-level role management (`US-RBAC-*`), project management (`US-PROJ-*`), and task management (`US-TASK-*`).
- **Blocked**: Building `/api/v1/platform/*` endpoints, platform operator UI views, and break-glass execution workflows (`TASK-501`).

#### 6. Required Stakeholder Action
> [!IMPORTANT]
> **Action Required**: Stakeholder sign-off approving **Option B** (Unified Application with Operator Context, MFA step-up, and restricted break-glass scope). If deferred or rejected, platform administration remains excluded from the codebase.

---

### Decision UD-002: Cloud Binary Object Storage Provider & Presigned URL Strategy

#### 1. Context & Problem Statement
The current repository stores file asset metadata in PostgreSQL (`FileAsset` model) but does not persist actual file binaries. Real-world workspace operation requires reliable binary ingestion for PDFs, images, spreadsheets, and design assets without passing multi-megabyte payloads through the Node.js application process.

#### 2. Affected User Stories & PRD Features
- **User Stories**: [`US-STOR-001`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L2254)
- **PRD Features**: `TG-FILE-005`, `TG-STOR-001` (Section 7.11, Section 16.2)
- **Blocked Engineering Task**: `TASK-502 (Blocked)`

#### 3. Options Under Consideration

##### Option A: S3-Compatible Cloud Storage with Client Presigned Direct Uploads (Recommended)
- Client requests presigned upload URL from `POST /api/v1/files/upload-url` with filename, size, and MIME type.
- Server verifies tenant permissions and quotas, generates AWS S3 / Cloudflare R2 presigned PUT URL (expiring in 15 minutes) with tenant-partitioned key: `tenants/{orgId}/projects/{projId}/files/{uuid}-{safe_filename}`.
- Client uploads directly to cloud storage via `PUT`. Upon completion, client notifies server `POST /api/v1/files/confirm` to persist metadata in `FileAsset`.
- In local development, self-hosted MinIO or local mock storage server is used via `@aws-sdk/client-s3`.
- *Pros*: Zero Node.js memory pressure; scalable to gigabytes; strict tenant path isolation; cloud vendor agnostic (works with AWS S3, Cloudflare R2, MinIO, or GCP Cloud Storage).
- *Cons*: Requires client two-phase commit (upload + confirmation); requires cloud bucket provisioning.

##### Option B: Multipart Direct Stream Through API Server to Local Filesystem
- Client uploads file via `multipart/form-data` (Multer) directly to Node.js backend; backend writes file to local `/uploads` directory on server disk.
- *Pros*: Simple single-step upload; no external cloud credentials needed.
- *Cons*: Ephemeral server containers (Docker/K8s) lose files on pod restart; severely bottlenecks server memory and CPU; unviable for production multi-tenant SaaS.

#### 4. Architecture & Security Evaluation: Upload Verification & Integrity Rules
To prevent unverified metadata commits or quota circumvention:
1. **Server-Side `HeadObjectCommand` Verification Gate**:
   - The confirmation endpoint `POST /api/v1/files/confirm` **never** blindly trusts client payload declarations.
   - The backend issues a server-side AWS S3 `HeadObjectCommand` via `@aws-sdk/client-s3` to verify:
     1. The object actually exists in the S3 bucket.
     2. The actual `ContentLength` matches the declared size and does not exceed remaining organization quota.
     3. The `ContentType` returned by S3 matches the permitted MIME whitelist (`image/png`, `image/jpeg`, `application/pdf`, `application/vnd.openxmlformats-officedocument.*`). Executable binaries (`.exe`, `.sh`, `.bat`, HTML/SVG containing scripts) are strictly rejected.
     4. The storage key prefix strictly matches `tenants/{orgId}/projects/{projId}/files/`.
2. **Safe Filename Handling**:
   - The client filename is sanitized via RFC 5987 rules, stripping directory traversal characters (`../`), null bytes, and non-ASCII characters. The S3 key is synthesized with a cryptographic UUID prefix: `{uuid}-{sanitized_filename}`.
3. **Checksum & Integrity Validation**:
   - Where supported by the client and S3 upload mode, SHA-256 integrity checksums (`ChecksumSHA256`) are validated. ETags are treated as MD5 checksums only for single-part uploads.
4. **Quota Concurrency Locking**:
   - Organization storage quota is validated and decremented inside a PostgreSQL database transaction utilizing row-level locking (`SELECT remainingStorageBytes FROM Organization WHERE id = :orgId FOR UPDATE`).
5. **Incomplete & Orphaned Upload Cleanup**:
   - S3 bucket lifecycle rules automatically abort incomplete multipart uploads after **24 hours**.
   - A daily background worker deletes unconfirmed S3 objects whose age exceeds 24 hours without an associated `FileAsset` database record.

#### 5. Independent vs. Blocked Tasks
- **Independent**: File asset directory listing, project tagging, multi-select checkboxes, floating bulk dock, bulk duplicate, and bulk delete metadata operations (`US-FILE-001..005` in `TASK-405`).
- **Blocked**: Binary file drag-and-drop upload handler, presigned URL generator, and actual file download streaming (`US-STOR-001` in `TASK-502`).

#### 6. Required Stakeholder Action
> [!IMPORTANT]
> **Action Required**: Stakeholder ratification of **Option A** (S3-compatible presigned direct upload architecture with server-side `HeadObjectCommand` verification) and selection of initial cloud provider (Cloudflare R2 recommended for zero egress costs, or AWS S3). If deferred, binary upload endpoints remain disabled.

---

### Decision UD-003: Real-Time Transport & State Synchronization Architecture

#### 1. Context & Problem Statement
In multi-user collaborative environments, team members moving cards on Kanban boards or updating tasks benefit from near-real-time updates without manual browser reloads. However, full bi-directional WebSockets introduce persistent stateful connections that complicate horizontal auto-scaling and serverless deployment.

#### 2. Affected User Stories & PRD Features
- **User Stories**: [`US-SYNC-001`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L2809), [`US-SYNC-002`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L2830)
- **PRD Feature**: `TG-SYNC-001` (Section 7.17, Section 16.2)
- **Blocked Engineering Task**: `TASK-503 (Blocked)`

#### 3. Options Under Consideration

##### Option A: Full Bi-Directional WebSockets (Socket.io / ws)
- Persistent WebSocket connection established per active browser tab.
- Subscribes to room channels: `org:{orgId}:proj:{projId}`.
- *Pros*: True bi-directional communication; lowest latency (<100ms).
- *Cons*: Requires Redis Pub/Sub adapter for multi-instance backend clusters; sticky sessions required on load balancers; higher idle memory overhead.

##### Option B: Server-Sent Events (SSE) via Authenticated Fetch Streaming Client + Smart Polling Fallback (Recommended)
- Unidirectional HTTP stream (`GET /api/v1/events/stream`) emitting lightweight event notifications (e.g. `{ "event": "task:updated", "taskId": 45, "version": 3 }`).
- **Authenticated Transport Client Specification**:
  - Native browser `EventSource` does **not** allow custom request headers. To preserve TeamGuard's strict tenant isolation and authentication standards without passing bearer tokens in URLs (which leak into proxy logs and browser history), the frontend **must** utilize a fetch-based streaming client (such as `@microsoft/fetch-event-source` or native `fetch` with `ReadableStream` reader).
  - Client capabilities verified:
    1. Passes standard `Authorization: Bearer <accessToken>` and `x-organization-id` directly in HTTP request headers.
    2. Automatic reconnect with exponential backoff and `Last-Event-ID` cursor tracking for missed event replay.
    3. Clean stream cancellation via `AbortController` upon component unmount, tab close, or workspace switch.
    4. Seamless dynamic tenant-context re-binding: when switching organizations, the client aborts the active stream and re-establishes a fresh connection with the new tenant header.
    5. Server-side per-connection authorization: protected by existing `authenticateToken` and `requireTenant` middleware.
- Client invalidates React Query cache and refetches fresh data upon receiving event.
- If SSE connection drops or is unsupported, client falls back to conditional HTTP polling (every 15–30 seconds with `If-None-Match` ETag headers).
- *Pros*: Standard HTTP/2 protocol; completely firewall-friendly; works natively through standard reverse proxies without WebSocket upgrade negotiation; preserves header-based authorization.
- *Cons*: Server-to-client only (mutations still flow over standard REST `POST`/`PATCH`, which is already TeamGuard's established design).

#### 4. Architecture & Security Evaluation
- **Security Impact**: Under Option B, the SSE connection requires standard JWT authentication and explicit `x-organization-id` header validation during handshake via the fetch streaming client. Channels are strictly isolated by organization and project.

#### 5. Independent vs. Blocked Tasks
- **Independent**: Optimistic local UI updates and automatic error rollback on HTTP 403/500 (`US-SYNC-001`) are handled locally in frontend React state.
- **Blocked**: Multi-user real-time room subscriptions and cross-client event broadcasting (`US-SYNC-002` in `TASK-503`).

#### 6. Required Stakeholder Action
> [!IMPORTANT]
> **Action Required**: Stakeholder approval of **Option B** (Server-Sent Events via authenticated fetch streaming client for server-to-client broadcast + optimistic REST mutations). If deferred, multi-client real-time synchronization remains disabled; client relies on standard manual refresh.

---

### Decision UD-004: Rich Text Description & Comment Editor Integration

#### 1. Context & Problem Statement
Task descriptions and comment feeds require structured text formatting (bold, italic, lists, code blocks, tables). Integrating a WYSIWYG editor introduces client bundle weight and creates XSS vulnerabilities if HTML input is not sanitized server-side.

#### 2. Affected User Stories & PRD Features
- **User Stories**: [`US-COLLAB-004`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L2043)
- **PRD Feature**: `TG-EDT-001` (Section 7.10, Section 16.2)
- **Blocked Engineering Task**: `TASK-504 (Blocked)`

#### 3. Options Under Consideration
- **Option A (Recommended)**: TipTap / ProseMirror with strict DOMPurify HTML sanitization. Ingests structured JSON ProseMirror document schema; persists sanitized HTML; enforces strict Content Security Policy.
- **Option B**: Lightweight Markdown-only textarea with client-side preview.

#### 4. Required Stakeholder Action
> [!IMPORTANT]
> **Action Required**: Stakeholder ratification of **Option A** (TipTap / ProseMirror) or **Option B** (Markdown-only). If deferred, comments and descriptions remain standard plaintext/markdown.

---

### Decision UD-005: Member Invitation Delivery Mechanism

#### 1. Context & Problem Statement
Inviting new team members into an organization requires generating cryptographically secure invitations and delivering them via email or shareable links without opening unauthorized registration vectors.

#### 2. Affected User Stories & PRD Features
- **User Stories**: [`US-INV-001`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L931), [`US-INV-002`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L975), [`US-INV-003`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L1015)
- **PRD Feature**: `TG-INV-001` (Section 7.4, Section 16.2)
- **Blocked Engineering Task**: `TASK-505 (Blocked)`

#### 3. Options Under Consideration
- **Option A**: Manual Shareable Token Link Only (In-App Copy Link).
- **Option B (Recommended)**: Resend Transactional Email API + Shareable Token Link Fallback. Server dispatches email with unique 7-day token link; acceptance validates that authenticated account email matches invitation recipient.

#### 4. Required Stakeholder Action
> [!IMPORTANT]
> **Action Required**: Stakeholder ratification of **Option B** (Resend Transactional Email API) and provisioning of email sending domain. If deferred, invitation endpoints remain unmounted.

---

### Decision DP-TASK-001: Task Creator vs. Assignee Policy Bifurcation

#### 1. Context & Problem Statement
Currently, `task:update:own` conflates the task creator and the task assignee. Organizations require fine-grained separation: allowing assignees to update status/priority while restricting title/scope edits to the creator.

#### 2. Affected User Stories & PRD Features
- **User Stories**: [`US-ABAC-004`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L1506)
- **PRD Feature**: `TG-ABAC-001` (Section 7.6, Section 16.2)
- **Blocked Engineering Task**: `TASK-506 (Blocked)`

#### 3. Options Under Consideration
- **Option A**: Coarse-Grained Task Ownership (Current single `task:update:own` covering both creator and assignee).
- **Option B (Recommended)**: Fine-Grained Discrete Bifurcation (`task:update:own` strictly for creator; `task:update:assigned` strictly for assignee).

#### 4. Required Stakeholder Action
> [!IMPORTANT]
> **Action Required**: Stakeholder approval of **Option B** (Permission Bifurcation) and confirmation of default role matrix assignments.

---

### Decision DP-REP-001: Reporting Scope, Metrics & Export Formats

#### 1. Context & Problem Statement
Stakeholders require visibility into workspace velocity, completion rates, and audit history. Export formats must balance executive utility against container size and rendering dependencies.

#### 2. Affected User Stories & PRD Features
- **User Stories**: [`US-REP-001`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md#L2704)
- **PRD Feature**: `TG-REP-001` (Section 7.20, Section 16.2)
- **Blocked Engineering Task**: `TASK-507 (Blocked)`

#### 3. Options Under Consideration
- **Option A (Recommended)**: Streaming CSV Export of Task Velocity & Audit History (`text/csv`). Zero binary rendering dependencies; lightweight; instant export downloads.
- **Option B**: Full Graphical Multi-Page PDF Generation via Headless Chromium.

#### 4. Required Stakeholder Action
> [!IMPORTANT]
> **Action Required**: Stakeholder approval of **Option A** (Phase 1 CSV task & audit report exports).

---

## Section 4 — Decision Unblocking & Change Management Protocol

```
┌────────────────────────────────┐
│   Stakeholder Review Meeting   │
└───────────────┬────────────────┘
                │
                v
┌────────────────────────────────┐
│ Formal Decision Recorded in    │
│ docs/planning/                 │
│ teamguard-decision-register.md │
│ (State: RATIFIED_OPTION_X)     │
└───────────────┬────────────────┘
                │
                v
┌────────────────────────────────┐
│ Affected Stories in Catalogue  │
│ transition from 'Blocked' to   │
│ 'Approved Requirement'         │
└───────────────┬────────────────┘
                │
                v
┌────────────────────────────────┐
│ Engineering Work Package       │
│ Unblocked in Phased Roadmap    │
│ (Track B / Phase 5 Execution)  │
└────────────────────────────────┘
```

When a decision is ratified:
1. The decision status in Section 2 & Section 3 is updated from `PROPOSED_RECOMMENDATION` to `RATIFIED: [Option Selected]` with formal sign-off metadata (Approver, Date).
2. The affected user stories in [`docs/product/teamguard-user-stories.md`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/product/teamguard-user-stories.md) are transitioned from `Decision blocker status: Blocked by [Decision ID]` to `Unblocked`, and requirement status becomes `Approved Requirement`.
3. The corresponding Phase 5 implementation task in [`docs/planning/teamguard-development-plan.md`](file:///c:/Users/Abhijeet%20Rawat/Desktop/rbac/docs/planning/teamguard-development-plan.md) is scheduled for immediate engineering execution.
