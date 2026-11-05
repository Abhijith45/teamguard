import "dotenv/config";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { prisma } from "../config/prisma.js";
import { validateDatabaseUrl } from "../config/database-url.js";
import { hashPassword } from "../src/utils/password.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

/**
 * Canonical System Permissions Catalog
 * Static RBAC metadata definitions required for server-side policy evaluation.
 */
const CANONICAL_PERMISSIONS = [
  // Dashboard
  { resource: "dashboard", action: "view", description: "View workspace dashboard" },
  { resource: "dashboard", action: "export", description: "Export dashboard statistics" },
  // Projects
  { resource: "project", action: "view", description: "View projects" },
  { resource: "project", action: "create", description: "Create projects" },
  { resource: "project", action: "update", description: "Update projects" },
  { resource: "project", action: "delete", description: "Delete projects" },
  // Tasks
  { resource: "task", action: "view", description: "View tasks" },
  { resource: "task", action: "create", description: "Create tasks" },
  { resource: "task", action: "update:own", description: "Update tasks created by you" },
  { resource: "task", action: "update:assigned", description: "Update tasks assigned to you" },
  { resource: "task", action: "update:any", description: "Update any task" },
  { resource: "task", action: "assign", description: "Assign tasks to members" },
  { resource: "task", action: "delete", description: "Delete tasks" },
  { resource: "task", action: "export", description: "Export tasks data" },
  { resource: "task", action: "delete:own", description: "Delete tasks created by yourself" },
  { resource: "task", action: "delete:any", description: "Delete any task across workspace" },
  // Files
  { resource: "files", action: "view", description: "View and browse files" },
  { resource: "files", action: "upload", description: "Upload new files" },
  { resource: "files", action: "update", description: "Edit/duplicate files" },
  { resource: "files", action: "delete", description: "Delete files" },
  { resource: "files", action: "download", description: "Download files" },
  // Administration, Auth & Roles
  { resource: "members", action: "manage", description: "Manage organization members" },
  { resource: "roles", action: "manage", description: "Manage roles and permissions" },
  { resource: "audit", action: "read", description: "Read security audit logs" },
  { resource: "profile", action: "read", description: "Read user profile" },
  { resource: "users", action: "read", description: "Read platform user records" },
  { resource: "users", action: "manage", description: "Manage user activations and global state" },
  { resource: "permissions", action: "manage", description: "Manage permission grants and matrix" },
  // Reports & Analytics
  { resource: "report", action: "export", description: "Export workspace compliance and velocity reports" },
  // ReBAC Spaces
  { resource: "space", action: "view", description: "View workspace spaces" },
  { resource: "space", action: "create", description: "Create spaces" },
  { resource: "space", action: "update", description: "Update spaces" },
  { resource: "space", action: "delete", description: "Delete spaces" },
  { resource: "space", action: "manage", description: "Manage space settings and private members" },
  // Access Requests
  { resource: "access_request", action: "create", description: "Submit access requests for private resources" },
  { resource: "access_request", action: "review", description: "Review and approve/reject access requests" },
];

async function main() {
  console.log("==================================================================");
  console.log("  TeamGuard Production Database Initialization (Supabase / Postgres)");
  console.log("==================================================================");

  // 1. Connection Validation & Diagnosis
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error("FATAL: DATABASE_URL environment variable is missing.");
    process.exit(1);
  }

  const connectionString = validateDatabaseUrl(rawUrl);
  const isSupabase =
    connectionString.includes("supabase.co") ||
    connectionString.includes("supabase.com") ||
    connectionString.includes("pooler.supabase.com");

  console.log(`\n[1/5] Validating database connectivity...`);
  console.log(`  Engine: ${isSupabase ? "Supabase Managed PostgreSQL" : "Standard PostgreSQL"}`);

  const ssl = isSupabase || connectionString.includes("sslmode=require") || process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined;

  const client = new pg.Client({ connectionString, ssl });
  try {
    await client.connect();
    const probe = await client.query(`
      SELECT
        version() as pg_version,
        current_database() as db_name,
        current_schema() as schema_name,
        current_user as db_user
    `);
    const info = probe.rows[0];
    console.log(`  Connected successfully!`);
    console.log(`  Database : ${info.db_name}`);
    console.log(`  User     : ${info.db_user}`);
    console.log(`  Schema   : ${info.schema_name}`);
    console.log(`  Version  : ${info.pg_version.split(",")[0]}`);

    // Check for previous failed migrations or partial schema state
    let shouldResetSchema = process.argv.includes("--clean-reset") || process.argv.includes("--force");
    try {
      const failedCheck = await client.query(`
        SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
      `);
      if (failedCheck.rows.length > 0) {
        console.warn(`\n  [RECOVERY] Detected ${failedCheck.rows.length} failed migration(s) from earlier attempt:`);
        for (const row of failedCheck.rows) {
          console.warn(`    - ${row.migration_name}`);
        }
        console.warn(`  [RECOVERY] Automatically resetting partial public schema to apply consolidated schema...`);
        shouldResetSchema = true;
      }
    } catch {
      // _prisma_migrations doesn't exist yet (fresh database)
    }

    if (shouldResetSchema) {
      await client.query(`
        DROP SCHEMA IF EXISTS public CASCADE;
        CREATE SCHEMA public;
        GRANT ALL ON SCHEMA public TO postgres;
        GRANT ALL ON SCHEMA public TO public;
      `);
      console.log(`  [RECOVERY] Public schema reset successfully.`);
    }

    await client.end();
  } catch (err) {
    console.error(`  Connection Probe Failed: ${err.message}`);
    process.exit(1);
  }

  // 2. Initialize Database Tables (Prisma Schema Push)
  console.log(`\n[2/5] Initializing tables and schema constraints via Prisma...`);
  try {
    console.log(`  Applying production migrations to ${isSupabase ? "Supabase" : "database"}...`);
    execSync("npx prisma migrate deploy", {
      cwd: backendRoot,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: connectionString },
    });
    console.log(`  Generating Prisma Client...`);
    execSync("npx prisma generate", {
      cwd: backendRoot,
      stdio: "inherit",
    });
    console.log(`  All tables and foreign key constraints successfully applied.`);
  } catch (err) {
    console.error(`  Schema Initialization Failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Seed Canonical Permissions Catalog (Metadata Only)
  console.log(`\n[3/5] Seeding canonical RBAC permissions catalog...`);
  let createdPerms = 0;
  let updatedPerms = 0;
  for (const perm of CANONICAL_PERMISSIONS) {
    const existing = await prisma.permission.findUnique({
      where: { resource_action: { resource: perm.resource, action: perm.action } },
    });
    if (existing) {
      if (existing.description !== perm.description) {
        await prisma.permission.update({
          where: { id: existing.id },
          data: { description: perm.description },
        });
        updatedPerms++;
      }
    } else {
      await prisma.permission.create({ data: perm });
      createdPerms++;
    }
  }
  const totalPerms = await prisma.permission.count();
  console.log(`  Permissions synced: ${totalPerms} total (+${createdPerms} added, ~${updatedPerms} updated).`);

  // 4. Verify ZERO Test Data Invariant
  console.log(`\n[4/5] Auditing database state (Zero Test Records Invariant)...`);
  const counts = {
    users: await prisma.user.count(),
    organizations: await prisma.organization.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    subtasks: await prisma.subtask.count(),
    comments: await prisma.comment.count(),
    files: await prisma.fileAsset.count(),
    spaces: await prisma.space.count(),
    auditLogs: await prisma.auditLog.count(),
    accessRequests: await prisma.accessRequest.count(),
  };

  // Check for test/demo organizations or users
  const demoOrgs = await prisma.organization.findMany({
    where: { slug: { in: ["acme-corp", "nova-labs", "test-org"] } },
  });
  const demoUsers = await prisma.user.findMany({
    where: { username: { in: ["alex.chen", "maria.santos", "liam.davies", "sophia.patel", "marcus.vance"] } },
  });

  const hasDemoData = demoOrgs.length > 0 || demoUsers.length > 0;
  if (hasDemoData) {
    console.warn(`  WARNING: Found ${demoOrgs.length} demo organizations and ${demoUsers.length} demo users.`);
    if (process.argv.includes("--purge-test-data")) {
      console.log(`  --purge-test-data flag detected. Purging demo records...`);
      for (const org of demoOrgs) {
        await prisma.organization.delete({ where: { id: org.id } });
      }
      for (const u of demoUsers) {
        await prisma.user.delete({ where: { id: u.id } });
      }
      console.log(`  Demo data purged successfully.`);
    } else {
      console.log(`  Tip: Pass --purge-test-data to automatically wipe demo records.`);
    }
  }

  // 5. Optional Bootstrap Administrator (Only if configured and database has 0 users)
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const bootstrapUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || "admin";
  const bootstrapName = process.env.BOOTSTRAP_ADMIN_NAME || "System Administrator";

  if (counts.users === 0 && bootstrapEmail && bootstrapPassword) {
    console.log(`\n[5/5] Provisioning clean production administrator...`);
    const defaultOrgName = process.env.DEFAULT_ORG_NAME || `${bootstrapName}'s Workspace`;
    const defaultOrgSlug = defaultOrgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const org = await prisma.organization.create({
      data: {
        name: defaultOrgName,
        slug: defaultOrgSlug,
      },
    });

    const superAdminRole = await prisma.role.create({
      data: {
        organizationId: org.id,
        name: "Super Admin",
        slug: "super-admin",
        description: "Full administrative access to the organization",
        isSystem: true,
      },
    });

    const allPerms = await prisma.permission.findMany();
    for (const p of allPerms) {
      await prisma.rolePermission.create({
        data: { roleId: superAdminRole.id, permissionId: p.id },
      });
    }

    const passwordHash = await hashPassword(bootstrapPassword);
    const user = await prisma.user.create({
      data: {
        name: bootstrapName,
        username: bootstrapUsername.toLowerCase(),
        email: bootstrapEmail.toLowerCase(),
        passwordHash,
        isPlatformAdmin: true,
      },
    });

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        department: "Executive",
      },
    });

    await prisma.membershipRole.create({
      data: {
        membershipId: membership.id,
        roleId: superAdminRole.id,
      },
    });

    console.log(`  Created production workspace : "${org.name}" (ID: ${org.id})`);
    console.log(`  Created administrator account: ${user.email} (Username: ${user.username})`);
    console.log(`  Assigned Super Admin role with ${allPerms.length} privileges.`);
  } else {
    console.log(`\n[5/5] Clean state verification:`);
    if (counts.users === 0) {
      console.log(`  Database is 100% clean with 0 users. The first user to register via /register will become Super Admin.`);
    } else {
      console.log(`  Database contains ${counts.users} existing user account(s).`);
    }
  }

  // Final Summary Table
  const finalCounts = {
    "Total Permissions (System Metadata)": await prisma.permission.count(),
    "Users (Accounts)": await prisma.user.count(),
    "Organizations (Tenants)": await prisma.organization.count(),
    "Memberships": await prisma.membership.count(),
    "Spaces (Containers)": await prisma.space.count(),
    "Projects": await prisma.project.count(),
    "Tasks": await prisma.task.count(),
    "Subtasks": await prisma.subtask.count(),
    "Comments": await prisma.comment.count(),
    "File Assets": await prisma.fileAsset.count(),
    "Audit Logs": await prisma.auditLog.count(),
  };

  console.log("\n==================================================================");
  console.log("  PRODUCTION DATABASE AUDIT & INITIALIZATION VERDICT");
  console.log("==================================================================");
  for (const [table, count] of Object.entries(finalCounts)) {
    const isDomainTable = !table.includes("Permissions");
    const indicator = isDomainTable && count > 0 ? "[ACTIVE]" : "[OK]";
    console.log(`  ${indicator.padEnd(8)} ${table.padEnd(38)} : ${count}`);
  }
  console.log("==================================================================");
  console.log("  Status: READY FOR PRODUCTION USE");
  console.log("==================================================================\n");
}

main()
  .catch((e) => {
    console.error("Initialization Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
