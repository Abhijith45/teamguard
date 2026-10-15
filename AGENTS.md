# TeamGuard — Architecture, Security Specifications & Agent Guidelines

This document provides canonical technical specifications, architectural contracts, security constraints, and operational guidance for developers and AI agents working on **TeamGuard**.

---

## 1. Core Mental Model & Principles

When designing, implementing, or testing features in TeamGuard, always maintain a strict separation between these six authorization layers:

| Layer | Question Answered | Implementation Detail |
|---|---|---|
| **1. Authentication** | *Who is making the request?* | Verified via JWT access tokens or secure session cookies. Returns authenticated `User` identity. |
| **2. Organization Context** | *Which tenant is the user acting within?* | Explicitly resolved via `x-organization-id` header or URL route parameter. Enforces strict membership. |
| **3. Membership Validation** | *Is the user an active member of this organization?* | Fails closed if no active `Membership` record exists for `(userId, organizationId)`. |
| **4. RBAC (Role-Based)** | *What actions can the user perform by role?* | Evaluates granular `Permission` records (`resource:action`) aggregated from all roles assigned to the membership. |
| **5. ABAC (Attribute-Based)** | *Can the user act on this specific resource instance?* | Checks contextual attributes: resource ownership (`creatorId`), assignment (`assigneeId`), project scope, status. |
| **6. Audit Logging** | *What occurred, by whom, and what was the outcome?* | Records immutable audit events with actor ID, organization ID, action, resource, timestamp, and result. |

> [!IMPORTANT]
> **Never trust frontend checks or JWT payload claims for authorization.**
> Client-side UI toggles and disabled buttons are strictly user-experience affordances. Every backend endpoint must independently authenticate the user, resolve the tenant, verify organization membership, evaluate active permissions, and enforce resource-level policies against the database.

---

## 2. Canonical Data Architecture

### Core Authorization Chain

$$\text{User} \longrightarrow \text{Membership} \longrightarrow \text{MembershipRole} \longrightarrow \text{Role} \longrightarrow \text{RolePermission} \longrightarrow \text{Permission}$$

Because a user's roles are attached to their **organization membership** (and not globally to their user identity), a single user can safely hold distinct roles across multiple organizations (e.g., **Admin** in Organization A and **Viewer** in Organization B).

### Database Model Inventory (Prisma & PostgreSQL)

| Model | Purpose | Key Fields & Constraints |
|---|---|---|
| `User` | User identity & authentication credentials | `id`, `name`, `username` (unique), `email` (unique), `passwordHash`, `isActive` |
| `Organization` | Tenant / workspace boundary | `id`, `name`, `slug` (unique), timestamps |
| `Membership` | Association between a User and an Organization | `userId`, `organizationId`, `department`, `status`, unique `[userId, organizationId]` |
| `Role` | Role definition (system default or custom tenant-scoped) | `id`, `organizationId` (nullable for system roles), `name`, `slug`, `isSystem` |
| `Permission` | Atomic authorization privilege | `id`, `resource`, `action`, `description`, unique `[resource, action]` |
| `MembershipRole` | Many-to-many join between Membership and Role | `membershipId`, `roleId`, composite primary key `[membershipId, roleId]` |
| `RolePermission` | Many-to-many join between Role and Permission | `roleId`, `permissionId`, composite primary key `[roleId, permissionId]` |
| `Project` | Workspace project owned by an organization | `id`, `organizationId`, `name`, `status`, `progress`, `priority` |
| `Task` | Work unit owned by a project and organization | `id`, `organizationId`, `projectId`, `title`, `status`, `assigneeId`, `creatorId` |
| `FileAsset` | Workspace document or file attachment | `id`, `organizationId`, `projectId` (optional), `name`, `sizeBytes`, `uploadedById` |
| `AuditLog` | Append-only security audit trail | `id`, `organizationId`, `actorId`, `action`, `resourceType`, `resourceId`, `outcome` |
| `RefreshSession` | Revocable session state & token hash | `id` (CUID), `userId`, `tokenHash` (unique), `expiresAt`, `revokedAt`, `rotatedAt` |

### Database Constraints & Indexing Rules

- **Unique Constraints**:
  - `User.email` and `User.username` must be normalized (lowercased) before storage.
  - `Membership`: unique composite index on `[userId, organizationId]`.
  - `Role`: unique composite index on `[organizationId, name]` to support custom tenant roles.
  - `Permission`: unique composite index on `[resource, action]` (e.g. `project:create`).
  - `MembershipRole`: composite primary key on `[membershipId, roleId]`.
  - `RolePermission`: composite primary key on `[roleId, permissionId]`.
- **Query Indexes**:
  - All foreign keys (`organizationId`, `projectId`, `userId`, `assigneeId`) must be indexed.
  - `AuditLog`: composite index on `[organizationId, createdAt]`.
  - `RefreshSession`: composite index on `[userId, expiresAt]`.

---

## 3. Backend Authorization & Middleware Contracts

### Tenant Resolution & Header Enforcement

Protected tenant-scoped endpoints require the `x-organization-id` header (or a validated URL parameter):
1. Extract `organizationId` from headers/params.
2. Verify that the authenticated `req.user.id` has an `ACTIVE` `Membership` in that organization.
3. Attach `req.organizationId` and `req.membership` to the request object.
4. **Fail closed**: If header is missing, malformed, or user is not an active member, return `403 Forbidden` (or `401 Unauthorized` if unauthenticated). Never silently fall back to an arbitrary organization.

### Permission Middleware (`requirePermission`)

```javascript
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const allowed = await hasPermission({
        userId: req.user.id,
        organizationId: req.organizationId,
        permission,
      });

      if (!allowed) {
        return res.status(403).json({
          error: "Forbidden",
          message: `Missing required permission: ${permission}`,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
```

### Route Pipeline Order

Every protected route handler must follow this strict middleware pipeline:

```javascript
router.post(
  "/projects",
  authenticateToken,       // 1. Identify user (req.user)
  resolveOrganization,     // 2. Validate tenant & membership (req.organizationId)
  requirePermission("project:create"), // 3. Verify RBAC permissions
  createProjectController  // 4. Execute business logic & ABAC checks
);
```

### Resource-Level Policies (ABAC)

Even if a user possesses a general permission like `task:update:own`, update access must be conditioned on ownership attributes:

```javascript
// Example: ABAC check inside service/controller
if (task.organizationId !== req.organizationId) {
  return res.status(404).json({ error: "Task not found" }); // Prevent ID probing across tenants
}

const canUpdateAny = userPermissions.includes("task:update:any");
const isAssignee = task.assigneeId === req.user.id;
const isCreator = task.creatorId === req.user.id;

if (!canUpdateAny && !((isAssignee || isCreator) && userPermissions.includes("task:update:own"))) {
  return res.status(403).json({ error: "Forbidden: You cannot modify tasks assigned to other members" });
}
```

### HTTP Status Code Conventions

| Status | Use Case |
|---|---|
| `400 Bad Request` | Zod validation failure, malformed payload, missing required parameters. |
| `401 Unauthorized` | Missing, expired, or invalid authentication credentials (JWT/session). |
| `403 Forbidden` | Authenticated user lacks organization membership or required permissions. |
| `404 Not Found` | Resource does not exist, or exists in another tenant (hides resource existence to prevent enumeration). |
| `409 Conflict` | Uniqueness violation (e.g. duplicate username, email, or role name). |
| `500 Internal Error` | Unhandled server error (stack traces must NEVER be exposed to clients). |

---

## 4. Default Role-Permission Policy Matrix

| Permission | Resource / Action | Owner | Admin | Manager | Member | Viewer |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `project:read` | View projects | Yes | Yes | Yes | Yes | Yes |
| `project:create` | Create projects | Yes | Yes | Yes | No | No |
| `project:update` | Edit projects | Yes | Yes | Scoped | No | No |
| `project:delete` | Delete projects | Yes | Yes | No | No | No |
| `task:read` | View tasks | Yes | Yes | Yes | Yes | Yes |
| `task:create` | Create tasks | Yes | Yes | Yes | Yes | No |
| `task:update:own` | Update assigned tasks | Yes | Yes | Yes | Yes | No |
| `task:update:any` | Update any task | Yes | Yes | Yes | No | No |
| `task:delete` | Delete tasks | Yes | Yes | Scoped | No | No |
| `file:read` | View files | Yes | Yes | Yes | Yes | Yes |
| `file:upload` | Upload files | Yes | Yes | Yes | Yes | No |
| `file:delete` | Delete files | Yes | Yes | No | No | No |
| `member:read` | View member directory | Yes | Yes | Yes | Yes | Yes |
| `member:manage` | Invite/remove members | Yes | Yes | No | No | No |
| `role:read` | View roles & permissions | Yes | Yes | Yes | No | No |
| `role:manage` | Create/edit custom roles | Yes | Yes | No | No | No |
| `audit:read` | View audit log events | Yes | Yes | No | No | No |
| `org:delete` | Delete organization | Yes | No | No | No | No |

---

## 5. Security & Session Lifecycle Rules

1. **Password Hashing**:
   - Use `bcryptjs` with salt rounds $\ge 10$.
   - Never store or log plaintext passwords.
   - Strip `passwordHash` in serialization layers before sending responses.
2. **Session & Refresh Token Security**:
   - Access tokens: Short lifespan (`15m`), stateless signed JWT.
   - Refresh tokens: Stored in database as cryptographic SHA-256 hashes only.
   - Token Rotation: Every refresh request generates a new access/refresh pair and invalidates the previous refresh token.
   - Reuse Detection: If an already-rotated token is presented, revoke all sessions for that user immediately.
3. **Audit Logging Hygiene**:
   - Log actor, organization, action, target resource type/ID, outcome, and timestamp.
   - **Strict exclusion**: Never write passwords, tokens, API keys, or raw request authorization headers into audit details.
4. **Tenant Query Scoping**:
   - Every database query for `Project`, `Task`, `FileAsset`, `Role`, `Membership`, or `AuditLog` **must** include `where: { organizationId }`.

---

## 6. Sprint Implementation Milestones

- **Sprint 1 — Authentication & Identity**:
  - Registration, login, logout, password hashing with bcrypt, JWT verification, refresh session rotation.
- **Sprint 2 — Organizations & Multi-Tenancy**:
  - Tenant provisioning, membership management, tenant header enforcement, active context resolution.
- **Sprint 3 — Dynamic RBAC Engine**:
  - Permissions catalog, role definitions, membership-role bindings, `requirePermission` middleware, fail-closed permission resolution.
- **Sprint 4 — Scoped Domain Resources (Projects & Tasks)**:
  - Multi-tenant Project CRUD, Kanban Task CRUD, ABAC assignment ownership checks (`task:update:own` vs `task:update:any`).
- **Sprint 5 — Administration Console & UI**:
  - Visual Role-Permission Matrix, Member management, Custom role builder, Persona Switcher for live verification.
- **Sprint 6 — Audit Trail & Hardening**:
  - Structured audit logging, negative test suite, cross-tenant penetration tests, security headers, rate limiting.

---

## 7. Mandatory Authorization Test Scenarios

Automated tests in `backend/test/` must continuously validate the following boundary conditions:

- [x] **Negative RBAC**: A `Viewer` attempting to `POST /api/projects` receives `403 Forbidden`.
- [x] **Tenant Boundary**: A user in Organization 1 attempting to access `/api/tasks/:id` belonging to Organization 2 receives `404 Not Found` (or `403 Forbidden`).
- [x] **Scope Enforcement**: A `Member` can update tasks assigned to them (`task:update:own`), but receives `403 Forbidden` when attempting to edit unassigned tasks.
- [x] **Privilege Escalation Prevention**: A non-admin user cannot grant themselves an `Admin` or `Owner` role.
- [x] **Context Switching**: A user belonging to multiple organizations receives distinct permission sets upon changing the `x-organization-id` header.
- [x] **Audit Integrity**: Failed and successful administrative actions are recorded in `AuditLog` without exposing sensitive credentials.
- [x] **Session Invalidation**: Logging out revokes the refresh session and invalidates subsequent token refresh requests.

---

## 8. Definition of Done (DoD)

A task or feature in TeamGuard is considered **Complete** only when:
1. Server-side validation (Zod schema) is implemented for all inputs.
2. Tenant boundary (`organizationId`) is enforced in all Prisma queries.
3. RBAC/ABAC permissions are checked via server middleware.
4. Security-sensitive operations emit an `AuditLog` entry.
5. Automated test cases cover both positive (allowed) and negative (denied) authorization paths.
6. Frontend views reflect permissions dynamically while relying entirely on backend enforcement.
