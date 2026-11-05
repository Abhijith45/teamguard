# TeamGuard 🛡️
### Enterprise Multi-Tenant RBAC & ABAC Access Management Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-v5.3-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-v19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-v8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-v7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Netlify](https://img.shields.io/badge/Netlify-Ready-00C7B7?logo=netlify&logoColor=white)](https://www.netlify.com/)
[![Render](https://img.shields.io/badge/Render-Ready-46E3B7?logo=render&logoColor=white)](https://render.com/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

**TeamGuard** is an enterprise-grade multi-tenant workspace, task orchestration, and authorization platform. It demonstrates and enforces **Role-Based Access Control (RBAC)**, **Attribute-Based Access Control (ABAC)**, **Relationship-Based Access Control (ReBAC)**, and **tamper-evident security audit logging**.

Every organization maintains its own members, custom roles, permissions, spaces, projects, tasks, and files. Authorization decisions are resolved dynamically on the server from relational join tables and resource attributes—never trusting client-side visibility flags or static JWT role claims.

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

### 📁 ReBAC Spaces & Container Hierarchy
- **Hierarchical Scoping**: `Organization → Space → Project → Task → Subtask`.
- **Sidebar Space Tree**: Collapsible workspace navigation with live badge counts summing active work (`Todo + In-Progress`).
- **Granular Space Privacy**: Support for `PUBLIC`, `PRIVATE`, and `INVITE_ONLY` spaces with inheritance for contained projects.

### 📅 Interactive High-Visibility Calendar
- **Multi-View Modes**: Seamless switching between Month, Week, Day, and Agenda views.
- **Date Box Tasks Modal**: Clicking any date cell opens a dedicated day modal displaying all tasks or an interactive empty state.
- **One-Click Quick Add `[+]`**: Hovering on future date cells surfaces a `[+]` button to prefill and open the task scheduling modal.
- **Past-Date Immutability**: Historical dates display subtle lock indicators with task creation, editing, and drag-and-drop operations disabled.

### 📊 Compliance & Velocity Analytics
- **Executive KPI Cards**: Real-time metrics for total tasks, completion rates, overdue alerts, and team headcount.
- **30-Day Task Velocity Trend**: Planned vs. completed workload trajectories.
- **Team Workload Breakdown**: Interactive member workload distribution and backlog balance.
- **One-Click CSV Compliance Exports**: Instant audit-ready exports for Task Velocity and Security Compliance Logs.

### ⚡ Smart In-Memory Query Caching & ETags
- **Client Cache**: 15-second in-memory query cache in `api-client.js` with LRU eviction.
- **Conditional HTTP 304 Validation**: API endpoints return `ETag` hashes; unchanged queries return 304 with zero payload re-transmission.
- **Smart Tenant Mutation Invalidation**: Mutating tasks, projects, roles, or members automatically invalidates related tenant cache keys.
- **Cross-Tenant Purge**: Switching active organization immediately purges cached memory.

### 👥 Interactive Persona Switcher (Live Demo Mode)
- Test and verify permission enforcement in real time with a built-in persona switcher:
  - 👑 **Super Admin / Owner**: Full governance, role configuration, member invites, and audit log access.
  - 💼 **Project Manager**: Project lifecycle and scoped task management.
  - 🛠️ **Team Member**: Task progress updates on assigned items (`task:update:own`).
  - 👁️ **Stakeholder / Viewer**: Read-only oversight with write operations strictly denied (`403 Forbidden`).

### 🎨 Accessible High-Opacity Theme System
- Dual theme support: High-Contrast Dark (`#0B0E14` base, `#141824` cards, `#283142` borders) and High-Contrast Light (`#F4F6F9` base, `#FFFFFF` cards, `#D3DCE6` borders).
- Eliminates low-contrast translucent overlays (`rgba`) in favor of solid surfaces with WCAG AAA compliant text contrast.

---

## 🏗️ Architecture & Tech Stack

```mermaid
flowchart TD
    Client["React 19 + Vite Frontend<br/>(Netlify Free Tier)"] -->|Bearer JWT + x-organization-id| API["Express 5 REST API<br/>(Render Free Tier)"]
    API --> Auth["Authentication Middleware"]
    Auth --> Tenant["Tenant & Membership Resolver"]
    Tenant --> RBAC["Dynamic RBAC Middleware"]
    RBAC --> ABAC["Resource ABAC Policies"]
    ABAC --> Audit["Audit Logging Interceptor"]
    Audit --> Prisma["Prisma ORM Client"]
    Prisma --> DB[("PostgreSQL 14+ Database<br/>(Render / Supabase / Neon)")]
```

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite 8, Lucide React, High-Opacity Design System |
| **Backend** | Node.js (ESM), Express 5, Zod Schema Validation, Helmet, Cookie-Parser, CORS |
| **Database & ORM** | PostgreSQL 14+, Prisma ORM 7 (`@prisma/client`, `@prisma/adapter-pg`) |
| **Auth & Security** | JSON Web Tokens (`jsonwebtoken`), Bcrypt.js ($\ge 10$ rounds), SHA-256 Session Hashes |
| **Testing** | Node.js Test Runner (`node --test`), Playwright Component & E2E Suites |
| **Deployment** | Netlify (Frontend SPA), Render (Backend Web Service & PostgreSQL) |

---

## 📁 Repository Structure

```text
rbac/
├── backend/
│   ├── config/              # Prisma database connection & seed logic
│   ├── prisma/              # Prisma schema & database migrations
│   ├── src/
│   │   ├── controllers/     # Express route controllers (Auth, Tasks, Spaces, Reports)
│   │   ├── lib/             # JWT tokens, refresh sessions & cache engine
│   │   ├── middleware/      # Auth, tenant resolver, RBAC, ETags & rate limiters
│   │   ├── routes/          # REST route declarations
│   │   ├── services/        # Business logic, permissions & audit logging
│   │   ├── utils/           # Validation schemas & data masking helpers
│   │   └── app.js           # Express app setup, CORS & Helmet security
│   ├── test/                # Automated RBAC & tenant isolation test suite
│   ├── package.json
│   └── server.js            # Server entrypoint & graceful shutdown handlers
├── frontend/
│   ├── public/              # Static brand assets, favicons & _redirects (Netlify)
│   ├── src/
│   │   ├── components/      # UI primitives, Brand, Persona Switcher & Theme Toggle
│   │   ├── features/        # Auth, Dashboard, Kanban, Calendar, Reports, Spaces
│   │   ├── layout/          # AppShell & responsive SidebarSpaceTree
│   │   ├── services/        # Fetch API client with tenant headers & caching
│   │   └── main.jsx         # React application entrypoint
│   ├── netlify.toml         # Netlify subdirectory deployment config
│   ├── package.json
│   └── vite.config.js
├── PRD.md                   # Canonical Product Requirements Document
├── netlify.toml             # Netlify root build & SPA redirect configuration
├── render.yaml              # Render backend Blueprint specification
└── .gitignore               # Strict exclusion rules for secrets & builds
```

---

## 🚀 Live Cloud Deployment Guide

TeamGuard is designed for modern cloud architectures, supporting:
- **Database**: [Supabase Managed PostgreSQL](https://supabase.com/) (or Render / Neon)
- **Backend API**: [Render Free Tier](https://render.com/) (Node.js ESM)
- **Frontend SPA**: [Netlify Free Tier](https://www.netlify.com/) (Vite Static Hosting)

---

### 1. Database Provisioning & Initialization (Supabase)

#### Step 1: Create a Supabase Project
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard) and click **New project**.
2. Select an organization, name your project (e.g. `teamguard-prod`), and assign a strong database password.
3. In **Project Settings** → **Database**, locate your connection strings:
   - **Connection Pooler (Port 6543, Transaction mode)**: Recommended for application queries (`DATABASE_URL`).
   - **Direct Connection (Port 5432, Session mode)**: Required for running schema migrations (`DIRECT_URL`).

#### Step 2: Initialize Tables with Zero Test Data
TeamGuard includes an automated production database initialization script that applies all 27 tables, creates relational foreign keys, catalogs the canonical RBAC permissions matrix, and guarantees **zero mock/test data**:

```bash
cd backend

# Configure your Supabase connection strings in .env:
# DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
# DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require"

# Run the production initialization script
npm run db:init:prod
```

The script will:
- Validate SSL connectivity against Supabase.
- Apply production schema migrations (`npx prisma migrate deploy`).
- Sync all 36 canonical system permissions.
- Audit table counts to ensure **0 test users, 0 demo organizations, and 0 dummy tasks**.
- Optionally provision a clean Administrator account if `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are provided in the environment.

---

### 2. Deploy Backend to Render (Free Tier)

#### Option A: One-Click Render Blueprint (Recommended)
1. Fork or push this repository to your GitHub account.
2. Sign in to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** → **Blueprint**.
4. Connect your GitHub repository. Render will automatically read `render.yaml`.
5. Enter the required environment parameters:
   - `DATABASE_URL`: Your Render PostgreSQL database connection string (or external connection string from Supabase/Neon).
   - `FRONTEND_ORIGIN`: Your Netlify frontend URL (e.g. `https://your-teamguard.netlify.app`).
   - `BOOTSTRAP_ADMIN_PASSWORD`: A secure admin password for initial seeding.
6. Click **Apply**. Render will build and deploy the web service at `https://<your-service>.onrender.com`.

#### Option B: Manual Web Service Setup
1. On Render, click **New +** → **Web Service**.
2. Select your repository and specify:
   - **Name**: `teamguard-api`
   - **Runtime**: `Node`
   - **Region**: Choose closest to you (e.g. `Oregon (US West)`)
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
3. Add the following **Environment Variables**:
   | Variable | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables production security & cookies |
   | `PORT` | `10000` | Render default web service port |
   | `DATABASE_URL` | `postgresql://...` | Connection string with SSL enabled |
   | `JWT_ACCESS_SECRET` | *32+ character random string* | Used to sign JWTs |
   | `ACCESS_TOKEN_TTL` | `15m` | Short-lived access token expiry |
   | `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh token lifespan |
   | `FRONTEND_ORIGIN` | `https://your-app.netlify.app` | Whitelisted Netlify origin |
   | `COOKIE_SAME_SITE` | `none` | Required for cross-site Netlify cookies |
   | `COOKIE_SECURE` | `true` | Required with `sameSite=none` |
   | `BOOTSTRAP_ADMIN_EMAIL` | `admin@teamguard.local` | Initial admin account |
   | `BOOTSTRAP_ADMIN_PASSWORD` | *Your secure password* | Initial admin password |
4. Set **Health Check Path** to `/health`.
5. Click **Deploy Web Service**.

---

### 3. Deploy Frontend to Netlify (Free Tier)

1. Sign in to your [Netlify Dashboard](https://app.netlify.com/).
2. Click **Add new site** → **Import an existing project** → **GitHub**.
3. Select your repository.
4. Configure the **Build Settings**:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist` (or `frontend/dist` if base directory is blank)
5. Configure **Environment Variables**:
   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://your-teamguard-api.onrender.com/api` |
6. Click **Deploy Site**.
7. Netlify will build the SPA. The bundled `public/_redirects` rule (`/* /index.html 200`) ensures that deep links like `/calendar` or `/reports` route properly without 404 errors.

---

## 💻 Local Development Setup

### Prerequisites
- **Node.js** (v18.0.0 or higher)
- **PostgreSQL 14+** running locally or a cloud database connection URL
- **npm** (v9+)

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your local PostgreSQL credentials:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/teamguard"

# Generate Prisma Client & apply migrations
npm run db:generate
npm run db:migrate

# Seed demo personas & organization data
npm run db:seed

# Start dev server with hot reload
npm run dev
```
The API starts at `http://localhost:5000` (Health check: `http://localhost:5000/health`).

### 2. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
The UI starts at `http://localhost:5173`.

---

## 🧪 Automated Testing

### Backend Authorization & Security Tests
TeamGuard includes automated security tests verifying negative permissions, cross-tenant isolation, and privilege escalation prevention:

```bash
cd backend
npm test
```

Verified test coverage includes:
- 🚫 **Negative RBAC**: Viewers attempting `POST /api/projects` receive `403 Forbidden`.
- 🚫 **Cross-Tenant Attack**: Users in Org 1 attempting to access resources in Org 2 receive `404 Not Found`.
- 🚫 **Attribute Restrictions**: Members cannot edit unassigned tasks (`task:update:own` vs. `task:update:any`).
- 🚫 **Privilege Escalation**: Non-admins cannot assign administrative roles or grant unheld permissions.
- 🛡️ **Session Revocation**: Rotated or logged-out refresh tokens are rejected instantly.

### Frontend Unit & Component Tests
```bash
cd frontend
npm test
```

---

## 🔄 CI/CD Automation Pipeline

The repository includes a production-grade GitHub Actions workflow (`.github/workflows/ci.yml`) enforcing multi-stage quality gates on every push and pull request to `main`:

```mermaid
flowchart LR
    A["Push / PR to main"] --> B["Backend Tests & DB Init Check"]
    A --> C["Frontend Unit Tests & Vite Build"]
    A --> D["Docker Packaging Validation"]
    B & C --> E["Playwright End-to-End Regression"]
    E & D --> F["Production Release Gate Check"]
```

1. **Backend Verification**: Boots a PostgreSQL service container, executes Prisma migrations, verifies the production database initialization script with zero test records, and executes the automated test suite.
2. **Frontend Verification**: Runs all 113 unit/component tests, compiles the Vite production bundle, and validates `dist/index.html` and Netlify `dist/_redirects`.
3. **Docker Packaging**: Validates container configurations and builds hardened production Docker images.
4. **Playwright E2E**: Boots both servers in CI and runs user journey regression tests with browser automation.
5. **Production Release Gate**: Enforces that all jobs pass with 100% success before green-lighting release.

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
| `/api/spaces` | `GET` / `POST` | List spaces or create new space | `project:read` / `project:create` |
| `/api/projects` | `GET` / `POST` | List projects or create a new project | `project:read` / `project:create` |
| `/api/tasks` | `GET` / `POST` | Retrieve tasks or create a new task | `task:read` / `task:create` |
| `/api/tasks/:id` | `PATCH` / `DELETE` | Update task or delete task | `task:update:own` or `task:update:any` |
| `/api/reports/summary` | `GET` | Executive dashboard KPI metrics | `reports:read` / `project:read` |
| `/api/reports/tasks/csv` | `GET` | Download tasks velocity CSV export | `reports:read` / `project:read` |
| `/api/reports/audit/csv` | `GET` | Download security compliance CSV audit | `audit:read` |
| `/api/files` | `GET` / `POST` | File asset registry & secure uploads | `file:read` / `file:upload` |
| `/api/permissions-matrix` | `GET` | Visual role-permission matrix mapping | `role:read` |

---

## 📖 Product Documentation

- [PRD.md](PRD.md): Canonical Product Requirements Document covering multi-tenant architecture, the 6-layer authorization pipeline, and enterprise RBAC/ABAC specifications.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
