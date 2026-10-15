# TeamGuard Architecture, RBAC & Engineering Rules

## 1. Core Authorization Invariants
- **Multi-Tenant Scoping**: All organizational resources (Projects, Tasks, Roles, Memberships, FileAssets, AuditLogs) must belong to an `organizationId`. Every database query, update, or deletion MUST filter by `organizationId` to prevent cross-tenant data leakage. Never fetch or mutate an entity by ID alone.
- **Fail-Closed Authorization**: All authorization middleware and evaluation services (`hasPermission`, ABAC checks) must fail closed (deny access) if the user, tenant membership, or permission cannot be definitively verified.
- **Pure Role-Based RBAC**: Permissions are assigned solely through Roles attached to an Organization Membership (`User -> Membership -> MembershipRole -> Role -> RolePermission -> Permission`). Do not assign direct permissions to individual users.
- **ABAC & Resource Ownership**: Where policies dictate resource-level restrictions (e.g. `task:update:own` vs `task:update:any`), evaluate resource attributes (such as `task.assigneeId === user.id` or project team membership) in addition to the coarse permission check.
- **Server-Authoritative Enforcement**: Frontend permissions and disabled UI controls are strictly for user experience. All security-sensitive decisions must be verified on the backend.

## 2. Data Integrity & Security Standards
- **Input Validation**: Validate 100% of incoming request payloads, URL parameters, and query parameters using Zod schemas before running business logic or database queries.
- **Transaction Safety**: Multi-record operations (such as user registration + default organization creation + owner role assignment, or member role reassignment) must run within a Prisma transaction (`prisma.$transaction`).
- **Credential & Secret Protection**: Passwords must be hashed using bcrypt. Password hashes and refresh token hashes must never appear in API responses. Secrets must never be logged.
- **Audit Logging**: Maintain an immutable audit log (`AuditLog`) for all security-relevant mutations (membership additions/removals, role modifications, permission grants/revocations, project/task lifecycle events).

## 3. Technology & Code Conventions
- **Backend**: Node.js with Express.js (ES Modules) and Prisma ORM with PostgreSQL. Keep Express controllers slim; isolate business logic into dedicated service layers (`services/`).
- **Frontend**: React 19 + Vite with modular custom CSS and Lucide React icons matching the Taskora/TeamGuard visual design system.
- **Status Codes**:
  - `401 Unauthorized`: Unauthenticated or expired session.
  - `403 Forbidden`: Authenticated, but lacks required permission or cross-tenant access.
  - `404 Not Found`: Used when resource does not exist or when hiding resource existence across tenants.
  - `400 Bad Request`: Validation failure.
  - `409 Conflict`: Uniqueness or state collision.
