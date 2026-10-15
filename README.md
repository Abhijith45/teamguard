# TeamGuard 🛡️
### Enterprise Multi-Tenant RBAC & ABAC Access Management Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-v5.3-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-v8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-v7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

**TeamGuard** is a full-stack, enterprise-grade multi-tenant workspace and authorization engine designed to demonstrate and enforce **Role-Based Access Control (RBAC)**, **Attribute-Based Access Control (ABAC)**, **strict tenant boundary isolation**, and **immutable security audit logging**.

Every organization maintains its own members, custom roles, permissions, projects, tasks, and files. Authorization decisions are resolved dynamically on the server from relational join tables and resource attributes—never trusting client-side visibility flags or static JWT role claims.

---

## 🌟 Key Features

### 🏢 Multi-Tenant Isolation
- **Fail-Closed Header Enforcement**: Protected routes require explicit `x-organization-id` header context and verify active membership before granting access.
- **Cross-Tenant Leak Prevention**: Database queries strictly scope resources by `organizationId`. Attempting to access an ID from another tenant returns `404 Not Found` to prevent resource enumeration.
- **Multi-Organization Membership**: A single user can belong to multiple organizations with distinct roles in each (e.g., **Admin** in Org A and **Viewer** in Org B).

### 🔑 Dynamic RBAC & Fine-Grained ABAC
- **Relational Permissions Chain**: `User → Membership → MembershipRole → Role → RolePermission → Permission`.
- **Custom Tenant Roles**: Organizations can define custom roles with granular permission sets (`project:create`, `task:update:own`, `member:manage`, etc.).
- **Attribute-Based Policies (ABAC)**: Resource operations verify ownership and contextual attributes (e.g. team members can only edit tasks assigned to them, while managers can edit all tasks in their scope).

### 👥 Interactive Persona Switcher (Live Demo Mode)
- Test and verify permission enforcement in real time with a built-in persona switcher:
  - 👑 **Super Admin / Owner**: Full governance, role configuration, member invites, and audit log access.
  - 💼 **Project Manager**: Project lifecycle and scoped task management.
  - 🛠️ **Team Member**: Task progress updates on assigned items (`task:update:own`).
  - 👁️ **Stakeholder / Viewer**: Read-only oversight with write operations strictly denied.

### 📊 Modern Management Consoles
- **Visual Permissions Matrix**: Interactive matrix grid displaying effective privileges for all roles.
- **Interactive Kanban Board**: Organization-scoped project board with task assignment, status updates, and priority tagging.
- **Bulk File Operations**: Asset management interface with tenant-isolated upload and delete actions.
- **Security Audit Log Explorer**: Searchable, tamper-evident audit trail capturing actor, action, resource, timestamp, and outcome.

### 🔒 Hardened Authentication & Session Lifecycle
- Password hashing with **Bcrypt** ($\ge 10$ salt rounds).
- Short-lived stateless **JWT Access Tokens** (`15m`).
- Database-backed **Refresh Sessions** storing cryptographic SHA-256 hashes only.
- Strict token rotation and instant multi-session revocation upon suspected token reuse or logout.
- Safe serialization layers guaranteeing credentials and secret hashes are never sent in API responses.

---

## 🏗️ Architecture & Tech Stack

```mermaid
graph TD
    Client[React 19 + Vite Frontend] -->|Bearer JWT + x-organization-id| API[Express 5 REST API]
    API --> Auth[Authentication Middleware]
    Auth --> Tenant[Tenant & Membership Resolver]
    Tenant --> RBAC[Dynamic RBAC Middleware]
    RBAC --> ABAC[Resource ABAC Policies]
    ABAC --> Audit[Audit Logging Interceptor]
    Audit --> Prisma[Prisma ORM Client]
    Prisma --> DB[(PostgreSQL Database)]
```

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite 8, Lucide React, Custom CSS Design System |
| **Backend** | Node.js (ESM), Express 5, Zod Schema Validation, Cookie-Parser, CORS |
| **Database & ORM** | PostgreSQL, Prisma ORM 7 (`@prisma/client`, `@prisma/adapter-pg`) |
| **Auth & Security** | JSON Web Tokens (`jsonwebtoken`), Bcrypt.js, SHA-256 Session Hashes |
| **Testing** | Node.js Test Runner (`node --test`), Custom Assertion Suites |

---

## 📁 Repository Structure

```text
rbac/
├── backend/
│   ├── config/              # Prisma database connection & client setup
│   ├── prisma/              # Prisma schema, migrations & seed scripts
│   ├── src/
│   │   ├── controllers/     # Express route controllers
│   │   ├── lib/             # JWT token helpers & cookie utilities
│   │   ├── middleware/      # Auth, tenant resolver, RBAC & error handlers
│   │   ├── routes/          # REST route declarations
│   │   ├── services/        # Business logic, permission resolution & audit logging
│   │   ├── utils/           # Validation schemas & response helpers
│   │   └── app.js           # Express app setup & route registry
│   ├── test/                # Automated RBAC & tenant isolation test suite
│   ├── package.json
│   └── server.js            # Server entrypoint & graceful shutdown handlers
├── frontend/
│   ├── src/
│   │   ├── components/      # UI primitives, Brand & Persona Switcher
│   │   ├── features/        # Auth, Dashboard, Kanban, Roles, Members, Files
│   │   ├── hooks/           # useSession, useAdminWorkspace hooks
│   │   ├── services/        # Axios / Fetch API client with tenant headers
│   │   ├── layout/          # AppShell & responsive navigation
│   │   └── main.jsx         # React application entrypoint
│   └── vite.config.js
├── docs/                    # Architectural decisions & product planning records
├── AGENTS.md                # In-depth technical specifications & agent guide
├── README.md                # GitHub project documentation
└── .gitignore               # Strict exclusion rules for secrets, builds & caches
```

---

## 🚀 Quickstart Guide

### Prerequisites
- **Node.js** (v18.0.0 or higher)
- **PostgreSQL** instance running locally or hosted (e.g. Neon, Supabase, Render)
- **npm** or **pnpm**

---

### 1. Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file from the provided example:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your PostgreSQL connection string and secrets:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/teamguard"
   PORT=5000
   FRONTEND_ORIGIN="http://localhost:5173"
   JWT_ACCESS_SECRET="your-super-secret-jwt-key-min-32-chars"
   ACCESS_TOKEN_TTL="15m"
   REFRESH_TOKEN_TTL_DAYS=30
   ```

4. **Run database migrations & seed initial data**:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Start the backend development server**:
   ```bash
   npm run dev
   ```
   The backend API will run at `http://localhost:5000` (Health check: `http://localhost:5000/health`).

---

### 2. Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd ../frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the Vite development server**:
   ```bash
   npm run dev
   ```
   The application console will be accessible at `http://localhost:5173`.

---

## 🧪 Testing Authorization & Tenant Isolation

TeamGuard includes a dedicated backend test suite to prove that permission rules and tenant boundaries cannot be bypassed via direct API calls:

```bash
cd backend
npm test
```

### Verified Test Cases
- 🚫 **Denied Write**: A `Viewer` attempting `POST /api/projects` receives `403 Forbidden`.
- 🚫 **Cross-Tenant Attack**: A user authenticated in Organization A attempting to read or modify resources belonging to Organization B receives `404 Not Found` or `403 Forbidden`.
- 🚫 **Privilege Escalation**: Non-administrative users cannot grant roles or assign unheld permissions.
- 🚫 **Attribute Restrictions**: A `Member` without `task:update:any` cannot edit tasks assigned to other colleagues.
- 🛡️ **Session Revocation**: Logged out or rotated refresh tokens are immediately rejected.

---

## 📡 API Overview

All protected requests require:
- `Authorization: Bearer <access_token>`
- `x-organization-id: <organization_id>`

| Route | Method | Description | Required Permission |
|---|:---:|---|---|
| `/api/auth/register` | `POST` | Register a new user account | Public |
| `/api/auth/login` | `POST` | Authenticate and obtain JWT access token | Public |
| `/api/auth/refresh` | `POST` | Rotate and refresh access token | Refresh Cookie |
| `/api/auth/logout` | `POST` | Revoke active refresh session | Authenticated |
| `/api/demo/switch-persona` | `POST` | Quick-switch active demo persona | Public / Demo |
| `/api/organizations` | `GET` | List organizations for authenticated user | Authenticated |
| `/api/projects` | `GET` / `POST` | List projects or create a new project | `project:read` / `project:create` |
| `/api/tasks` | `GET` / `POST` | Retrieve Kanban tasks or create task | `task:read` / `task:create` |
| `/api/tasks/:id` | `PATCH` / `DELETE` | Update task status or delete task | `task:update:own` or `task:update:any` |
| `/api/files` | `GET` / `POST` | Workspace file asset registry & bulk uploads | `file:read` / `file:upload` |
| `/api/permissions-matrix` | `GET` | Visual role-permission matrix mapping | `role:read` |
| `/api/dashboard` | `GET` | Aggregated analytics & audit summary | `member:read` |

---

## 📖 Deep Architectural Guidance & Specifications

For comprehensive documentation on:
- Formal authorization contracts & fail-closed error handling
- Complete PostgreSQL Prisma entity relationships
- Security audit compliance and token lifecycle policies
- AI Agent rules and sprint planning roadmaps

Please refer directly to [AGENTS.md](AGENTS.md).

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
