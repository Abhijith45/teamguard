# TeamGuard --- RBAC Learning Application

## 1. Project Overview

**TeamGuard** is a multi-tenant team workspace and project-management
application designed to teach and demonstrate Role-Based Access Control
(RBAC), resource-level authorization, Attribute-Based Access Control
(ABAC), tenant isolation, and audit logging.

Each organization has its own members, roles, permissions, projects, and
tasks. A user may have different roles in different organizations---for
example, an Admin in Organization A and a Viewer in Organization B.

### Primary learning objective

Build an application where authorization decisions are based on:

-   The authenticated user
-   The active organization (tenant)
-   The user's membership in that organization
-   Roles assigned to that membership
-   Permissions granted through those roles
-   Resource attributes such as ownership, assignment, and project
    membership

Do not rely only on frontend visibility or a role name embedded in a JWT
to authorize actions.

## 2. Goals and Scope

### Core goals

1.  Understand authentication versus authorization.
2.  Implement a flexible RBAC model using roles and granular
    permissions.
3.  Understand many-to-many relationships through join tables.
4.  Apply resource-level and attribute-based policies.
5.  Enforce strict organization/tenant isolation.
6.  Implement secure role and permission administration.
7.  Record security-sensitive actions in audit logs.
8.  Test allowed and denied actions through the API.

### Out of scope for the first version

-   Billing and subscriptions
-   Real-time chat
-   File storage
-   Complex workflow automation
-   External enterprise identity providers
-   Microservices

Keep the first version small enough to understand end-to-end.

## 3. Recommended Technology Stack

  -----------------------------------------------------------------------
  Layer                               Technology
  ----------------------------------- -----------------------------------
  Frontend                            React + Vite

  UI                                  Material UI (MUI)

  Client routing                      React Router

  HTTP client                         Axios

  Backend                             Node.js + Express.js

  Database                            PostgreSQL

  ORM                                 Prisma

  Authentication                      JWT with secure cookie-based
                                      sessions, or a correctly
                                      implemented access/refresh-token
                                      flow

  Authorization                       Custom RBAC middleware and
                                      resource-level ABAC policies

  Validation                          Zod

  Testing                             Vitest or Jest + Supertest

  Frontend hosting                    Vercel

  Backend hosting                     Render

  Database hosting                    Neon PostgreSQL
  -----------------------------------------------------------------------

Use JavaScript and JSX unless the project requirements later change.
Keep backend business logic separate from Express controllers.

## 4. Application Modules

### 4.1 Authentication

-   Register
-   Log in
-   Log out
-   Password hashing with bcrypt
-   Session creation and expiration
-   Access-token validation
-   Refresh-token rotation and revocation
-   Public-user serialization that never returns password hashes

### 4.2 Organizations and memberships

-   Create an organization
-   Add or invite members
-   List members
-   Remove members
-   Switch active organization
-   Assign roles to a membership
-   Allow one user to belong to multiple organizations

A user's effective permissions must be evaluated within the active
organization.

### 4.3 Projects

-   List projects visible to the current user
-   Create projects
-   View project details
-   Edit projects according to permissions and scope
-   Assign project members or teams if required
-   Delete projects according to policy

Every project must belong to an organization.

### 4.4 Tasks

-   Create tasks within a project
-   Assign tasks to members
-   View tasks
-   Update task details
-   Allow members to edit their own assigned tasks when policy permits
-   Restrict cross-organization task access
-   Delete tasks only when permitted

Every task must be associated with a project, and its organization
boundary must be enforced through that project.

### 4.5 Role and permission administration

-   List roles
-   Create organization-specific custom roles
-   Edit role names and descriptions
-   Grant or revoke permissions for a role
-   Assign roles to memberships
-   Prevent unauthorized privilege escalation
-   Protect sensitive roles and operations

Only appropriately authorized users should manage roles and permissions.

### 4.6 Audit logs

Record security-sensitive events, such as:

-   Membership created or removed
-   Role assigned or removed
-   Permission changed
-   Project created, updated, or deleted
-   Task created, updated, or deleted
-   Authorization failures where useful

Recommended audit fields:

-   Actor user ID
-   Organization ID
-   Action
-   Resource type
-   Resource ID
-   Outcome
-   Timestamp
-   Optional request/correlation ID

Avoid recording passwords, access tokens, refresh tokens, or other
secrets.

## 5. Example Roles and Permissions

Start with these roles:

-   **Owner**
-   **Admin**
-   **Manager**
-   **Member**
-   **Viewer**

Example policy matrix:

  Permission              Owner   Admin   Manager   Member   Viewer
  --------------------- ------- ------- --------- -------- --------
  View projects             Yes     Yes       Yes      Yes      Yes
  Create projects           Yes     Yes       Yes       No       No
  Edit any project          Yes     Yes    Scoped       No       No
  Create tasks              Yes     Yes       Yes      Yes       No
  Edit own tasks            Yes     Yes       Yes      Yes       No
  Manage members            Yes     Yes        No       No       No
  Manage roles              Yes     Yes        No       No       No
  View audit logs           Yes     Yes        No       No       No
  Delete organization       Yes      No        No       No       No

`Scoped` means the Manager can edit only resources inside their
permitted team or project scope.

These are example learning policies, not universal definitions. The
implementation should resolve permissions from database relationships
instead of hardcoding this table into route handlers.

## 6. RBAC, ABAC, and Tenant Isolation

### 6.1 RBAC: Can the user perform this action?

Example permission identifiers:

-   `project:read`
-   `project:create`
-   `project:update`
-   `project:delete`
-   `task:read`
-   `task:create`
-   `task:update:own`
-   `task:update:any`
-   `member:read`
-   `member:manage`
-   `role:manage`
-   `audit:read`
-   `organization:delete`

A role grants a collection of permissions. A user receives permissions
through the roles assigned to their organization membership.

### 6.2 ABAC: Can the user act on this particular resource?

A user may have `task:update` but should not necessarily be able to
update every task.

Policy attributes can include:

-   Task assignee
-   Task creator
-   Project membership
-   Organization ID
-   Resource status
-   User's team
-   Action being attempted

For example, permit a Member to update a task only when the task is
assigned to that user, while allowing an appropriately privileged user
to update any task within the authorized scope.

### 6.3 Tenant isolation

Every request involving an organization-owned resource must enforce the
active organization boundary.

Do not fetch a task solely by task ID and assume that knowing the ID
grants access. Scope database queries to the organization and verify
membership and permissions.

A user in Organization A must not access Organization B's projects or
tasks by changing an ID in a URL or request body.

## 7. Suggested Data Model

Use PostgreSQL with Prisma. A starting model inventory is:

  -----------------------------------------------------------------------
  Model                               Responsibility
  ----------------------------------- -----------------------------------
  `User`                              Identity, name, normalized email,
                                      normalized username, password hash

  `Organization`                      Tenant/workspace

  `Membership`                        Connects a user to an organization

  `Role`                              Role definition, preferably scoped
                                      to an organization where custom
                                      roles are supported

  `Permission`                        Granular action identifier

  `MembershipRole`                    Connects a membership to a role

  `RolePermission`                    Connects a role to a permission

  `Project`                           Organization-owned project

  `Task`                              Project-owned task with optional
                                      assignee/creator

  `RefreshSession`                    Hashed refresh token, expiry,
                                      revocation/session metadata

  `AuditLog`                          Security-sensitive action history
  -----------------------------------------------------------------------

### Core authorization relationship

`User → Membership → MembershipRole → Role → RolePermission → Permission`

This design is important because a user's role belongs to an
organization membership, not globally to the user. The same user can
have different roles in different organizations.

### Recommended constraints and indexes

-   Unique normalized email, according to the chosen account policy
-   Unique normalized username, if usernames are required
-   Unique organization membership for each `(userId, organizationId)`
    pair
-   Unique membership-role pair
-   Unique role-permission pair
-   Unique permission identifier where appropriate
-   Foreign keys for all relationships
-   Index organization IDs and commonly queried foreign keys
-   Index refresh-session user IDs and expiry
-   Index audit-log organization, timestamp, and resource identifiers

Use database constraints as the final defense against duplicates and
invalid relationships.

## 8. Authorization Middleware Concept

An Express middleware can require a permission:

``` javascript
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
          message: "Forbidden",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
```

`hasPermission()` is an application service to implement. It must verify
the user's active organization membership and resolve the roles and
permissions for that membership. It must fail closed if membership or
authorization data cannot be verified.

Example route:

``` javascript
router.post(
  "/organizations/:organizationId/projects",
  authenticate,
  resolveOrganization,
  requirePermission("project:create"),
  createProjectController
);
```

The example illustrates the intended order. The organization resolver
must verify that the authenticated user belongs to the requested
organization before accepting it as the active organization.

### Resource-level policy

A permission check alone may not be enough:

``` javascript
if (
  task.assigneeId !== req.user.id &&
  !permissions.includes("task:update:any")
) {
  return res.status(403).json({
    message: "Cannot update this task",
  });
}
```

This is illustrative. In production, first ensure that the task belongs
to the active organization, and ensure the permission set was resolved
for the correct membership.

### Status codes

-   `401 Unauthorized`: the request is not authenticated or its
    credentials are invalid.
-   `403 Forbidden`: the authenticated user lacks the required
    permission.
-   `404 Not Found`: can be used for inaccessible resources when the
    policy intentionally hides their existence.
-   `409 Conflict`: useful for duplicate registration or uniqueness
    conflicts.
-   `400 Bad Request`: invalid request input.

Frontend checks are for user experience only. All security-critical
authorization must be enforced on the backend.

## 9. Authentication and Session Design

A possible session flow:

1.  Validate registration input.
2.  Normalize identifiers such as email and username.
3.  Hash the password using bcrypt with a suitable cost factor.
4.  Create the user and initial organization membership/role assignment
    in a transaction where appropriate.
5.  Create a refresh session.
6.  Store only the refresh-token hash in the database.
7.  Return a safe public user representation and issue the
    access/refresh credentials using the chosen delivery mechanism.
8.  Rotate refresh tokens and revoke sessions on logout or suspected
    reuse.

If using cookies, configure `HttpOnly`, `Secure` in production, and an
appropriate `SameSite` policy. Evaluate CSRF protection based on the
cookie and request design. Never log credentials or tokens.

If creating a user and session are separate transactions, plan for
session-creation failure after user creation. Use a deliberate
transaction boundary or a recovery strategy so the client does not
receive an unexplained failure while the account has already been
created.

## 10. Development Plan

### Sprint 1 --- Authentication

-   Registration and login
-   Password hashing
-   Session management
-   Logout
-   Authentication middleware
-   Input validation

### Sprint 2 --- Organizations

-   Organization creation
-   Membership creation and listing
-   Organization switching
-   Membership checks
-   Organization ownership rules

### Sprint 3 --- RBAC engine

-   Permission catalog
-   Role definitions
-   Membership-role assignments
-   Role-permission assignments
-   Permission-resolution service
-   Authorization middleware
-   Unit tests for permission resolution

### Sprint 4 --- Protected resources

-   Project CRUD
-   Task CRUD
-   Ownership and assignment policies
-   Organization-scoped database queries
-   Resource-level authorization

### Sprint 5 --- Administration UI

-   Member management
-   Role management
-   Permission assignment interface
-   Guarded admin routes
-   Protection against privilege escalation

### Sprint 6 --- Audit and security

-   Audit logging
-   Authorization failure handling
-   Tenant-isolation tests
-   Negative permission tests
-   Session revocation and refresh-token tests
-   Deployment and environment configuration review

## 11. Required Authorization Tests

Test through the actual API, not only through the frontend.

-   A Viewer cannot create a project, even by sending a direct HTTP
    request.
-   A Manager cannot edit a project outside their permitted scope.
-   A user in Organization A cannot access Organization B's tasks by
    changing a URL or resource ID.
-   A user with different roles in two organizations receives different
    effective permissions in each.
-   Removing a permission prevents subsequent protected operations once
    the updated authorization state is expected to apply.
-   A non-admin cannot grant themselves an Admin role.
-   Failed authorization requests do not modify database records.
-   A user without `audit:read` cannot retrieve audit logs.
-   Invalid or expired credentials are rejected.
-   Refresh tokens are rotated and revoked according to policy.
-   Concurrent duplicate registrations cannot create duplicate
    normalized email or username values.
-   Failed role assignment rolls back user creation when both operations
    are in the same transaction.
-   Invalid input is rejected before unsafe database operations.
-   No API response exposes password hashes or refresh-token hashes.

## 12. Security and Implementation Checklist

-   [ ] Validate all request bodies, route parameters, and query
    parameters with Zod.
-   [ ] Enforce unique constraints in PostgreSQL.
-   [ ] Normalize email and username consistently.
-   [ ] Never store plaintext passwords.
-   [ ] Never expose password hashes in API responses.
-   [ ] Keep role assignment server-controlled during public
    registration.
-   [ ] Verify membership in the active organization on every protected
    organization-scoped request.
-   [ ] Scope resource queries by organization.
-   [ ] Keep authorization logic centralized and testable.
-   [ ] Fail closed when permission evaluation fails.
-   [ ] Prevent users from granting permissions they are not allowed to
    delegate.
-   [ ] Use transactions for related database writes.
-   [ ] Protect refresh tokens and implement expiration, rotation, and
    revocation.
-   [ ] Configure secure cookies and assess CSRF risks if cookie-based
    authentication is used.
-   [ ] Add rate limiting to authentication endpoints.
-   [ ] Avoid returning internal errors or stack traces to clients.
-   [ ] Log security events without logging secrets.
-   [ ] Test negative cases and cross-tenant access explicitly.
-   [ ] Treat frontend permission checks as presentation logic, not
    security enforcement.

## 13. Definition of Done

TeamGuard's first complete learning version is done when:

1.  Users can authenticate and belong to multiple organizations.
2.  Each membership can have one or more roles.
3.  Roles grant granular permissions through database relationships.
4.  Administrators can manage permitted roles and permissions.
5.  Protected routes enforce authorization on the server.
6.  Resource-level rules distinguish actions such as editing one's own
    task versus any task.
7.  Organization boundaries prevent cross-tenant access.
8.  Audit logs capture key administrative and security events.
9.  Automated tests prove both allowed and denied behavior.
10. The application is deployed with secrets stored in environment
    configuration.

## 14. Core Mental Model

Keep these concepts separate:

-   **Authentication:** Who is making the request?
-   **Organization membership:** Which tenant is the user acting within?
-   **RBAC:** Which actions are allowed by the user's assigned roles?
-   **ABAC/resource policy:** Is this action allowed on this specific
    resource under its attributes?
-   **Tenant isolation:** Does the resource belong to the active
    organization?
-   **Audit logging:** What security-relevant action occurred, by whom,
    and with what outcome?

The central learning objective is to make authorization decisions from
the authenticated user, active organization, membership, roles,
permissions, and resource attributes---not from a frontend button or a
role string alone.
