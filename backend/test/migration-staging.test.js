import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../config/prisma.js";
import { createDatabaseBackup } from "../scripts/backup-db.js";
import { restoreDatabaseBackup } from "../scripts/restore-backup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("TASK-601: Database Migration Staging, Forward Verification & Point-in-Time Restore", () => {
  const uniqueSuffix = Date.now();
  let testUser;
  let testOrg;
  let testRole;
  let testMembership;
  let testProject;
  let testTask;
  let testSubtask;
  let testComment;
  let testFile;
  let testInvitation;
  let backupFile;

  before(async () => {
    // 1. Create a dedicated test user
    testUser = await prisma.user.create({
      data: {
        name: `Staging Operator ${uniqueSuffix}`,
        username: `staging_op_${uniqueSuffix}`,
        email: `staging_op_${uniqueSuffix}@teamguard.io`,
        passwordHash: "$2a$10$hashedPasswordPlaceholderForStagingTests123",
      },
    });

    // 2. Create a dedicated test organization
    testOrg = await prisma.organization.create({
      data: {
        name: `Staging Tenant ${uniqueSuffix}`,
        slug: `staging-tenant-${uniqueSuffix}`,
        storageQuotaBytes: BigInt(5368709120), // 5 GB
        usedStorageBytes: BigInt(0),
      },
    });

    // 3. Create test role
    testRole = await prisma.role.create({
      data: {
        organizationId: testOrg.id,
        name: `Staging Lead ${uniqueSuffix}`,
        slug: `staging-lead-${uniqueSuffix}`,
        description: "Test role for cascade verification",
      },
    });

    // 4. Create membership and join to role
    testMembership = await prisma.membership.create({
      data: {
        userId: testUser.id,
        organizationId: testOrg.id,
        department: "Quality Assurance",
        status: "ACTIVE",
      },
    });

    await prisma.membershipRole.create({
      data: {
        membershipId: testMembership.id,
        roleId: testRole.id,
      },
    });

    // 5. Create project
    testProject = await prisma.project.create({
      data: {
        organizationId: testOrg.id,
        name: `Staging Flight Project ${uniqueSuffix}`,
        key: `STG-${uniqueSuffix.toString().slice(-4)}`,
        status: "ACTIVE",
      },
    });

    // 6. Create task with subtask and comment
    testTask = await prisma.task.create({
      data: {
        organizationId: testOrg.id,
        projectId: testProject.id,
        creatorId: testUser.id,
        assigneeId: testUser.id,
        title: "Verify staging database roll-forward and cascade",
        status: "IN_PROGRESS",
        priority: "HIGH",
      },
    });

    testSubtask = await prisma.subtask.create({
      data: {
        organizationId: testOrg.id,
        taskId: testTask.id,
        title: "Test cascade cleanup",
        isCompleted: true,
      },
    });

    testComment = await prisma.comment.create({
      data: {
        organizationId: testOrg.id,
        taskId: testTask.id,
        authorId: testUser.id,
        content: "Validating migration integrity in staging container",
      },
    });

    // 7. Create file asset
    testFile = await prisma.fileAsset.create({
      data: {
        organizationId: testOrg.id,
        projectId: testProject.id,
        name: "migration-spec.pdf",
        sizeBytes: 1048576,
        uploadedById: testUser.id,
        storageKey: `org-${testOrg.id}/test-file-${uniqueSuffix}.pdf`,
        status: "READY",
      },
    });

    // 8. Create membership invitation
    testInvitation = await prisma.membershipInvitation.create({
      data: {
        organizationId: testOrg.id,
        inviterId: testUser.id,
        roleId: testRole.id,
        email: `invitee_${uniqueSuffix}@example.com`,
        tokenHash: `hash_${uniqueSuffix}`,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      },
    });

    // 9. Create audit log
    await prisma.auditLog.create({
      data: {
        organizationId: testOrg.id,
        actorId: testUser.id,
        action: "organization:test_provision",
        resourceType: "Organization",
        resourceId: String(testOrg.id),
        outcome: "SUCCESS",
      },
    });
  });

  after(async () => {
    // Cleanup any backup artifacts created during tests
    if (backupFile && fs.existsSync(backupFile)) {
      try {
        fs.unlinkSync(backupFile);
        const metaFile = backupFile.replace(/\.sql$/, ".meta.json");
        if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
      } catch {
        // Ignore file cleanup errors
      }
    }

    // Cleanup remaining test user if still exists
    if (testUser) {
      await prisma.user.deleteMany({ where: { id: testUser.id } }).catch(() => {});
    }
  });

  it("REQ 1 [Prisma Migration Catalog]: All 10 migrations exist and are recorded in database", async () => {
    const migrationsDir = path.resolve(__dirname, "../prisma/migrations");
    const migrationDirs = fs.readdirSync(migrationsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();

    assert.equal(migrationDirs.length, 10, "Expected exactly 10 migration folders in prisma/migrations");
    assert.ok(migrationDirs.includes("20261013000000_rbac_init"));
    assert.ok(migrationDirs.includes("20261018000000_add_phase5_governance_and_storage"));

    // Check _prisma_migrations table
    const applied = await prisma.$queryRaw`
      SELECT migration_name FROM "_prisma_migrations" ORDER BY started_at ASC;
    `;

    assert.ok(Array.isArray(applied), "Expected array of applied migrations");
    assert.equal(applied.length, 10, "Expected all 10 migrations recorded in _prisma_migrations");
    const appliedNames = applied.map(m => m.migration_name);
    for (const name of migrationDirs) {
      assert.ok(appliedNames.includes(name), `Expected migration '${name}' to be marked applied`);
    }
  });

  it("REQ 2 [Foreign Key Cascades / TG-TENANT-001]: Tenant deletion cleanly cascades all child records", async () => {
    const orgId = testOrg.id;

    // Confirm existence before deletion
    const taskCountBefore = await prisma.task.count({ where: { organizationId: orgId } });
    const subtaskCountBefore = await prisma.subtask.count({ where: { organizationId: orgId } });
    const commentCountBefore = await prisma.comment.count({ where: { organizationId: orgId } });
    const fileCountBefore = await prisma.fileAsset.count({ where: { organizationId: orgId } });
    const inviteCountBefore = await prisma.membershipInvitation.count({ where: { organizationId: orgId } });
    const memberCountBefore = await prisma.membership.count({ where: { organizationId: orgId } });

    assert.ok(taskCountBefore > 0, "Task should exist prior to tenant delete");
    assert.ok(subtaskCountBefore > 0, "Subtask should exist prior to tenant delete");
    assert.ok(commentCountBefore > 0, "Comment should exist prior to tenant delete");
    assert.ok(fileCountBefore > 0, "File should exist prior to tenant delete");
    assert.ok(inviteCountBefore > 0, "Invitation should exist prior to tenant delete");
    assert.ok(memberCountBefore > 0, "Membership should exist prior to tenant delete");

    // Execute atomic tenant deletion
    await prisma.organization.delete({
      where: { id: orgId },
    });

    // Verify all child tables cascade deleted with zero orphans
    const [tasks, subtasks, comments, files, invites, members, projects, roles, audits] = await Promise.all([
      prisma.task.count({ where: { organizationId: orgId } }),
      prisma.subtask.count({ where: { organizationId: orgId } }),
      prisma.comment.count({ where: { organizationId: orgId } }),
      prisma.fileAsset.count({ where: { organizationId: orgId } }),
      prisma.membershipInvitation.count({ where: { organizationId: orgId } }),
      prisma.membership.count({ where: { organizationId: orgId } }),
      prisma.project.count({ where: { organizationId: orgId } }),
      prisma.role.count({ where: { organizationId: orgId } }),
      prisma.auditLog.count({ where: { organizationId: orgId } }),
    ]);

    assert.equal(tasks, 0, "All tasks must be cascade deleted");
    assert.equal(subtasks, 0, "All subtasks must be cascade deleted");
    assert.equal(comments, 0, "All comments must be cascade deleted");
    assert.equal(files, 0, "All files must be cascade deleted");
    assert.equal(invites, 0, "All invitations must be cascade deleted");
    assert.equal(members, 0, "All memberships must be cascade deleted");
    assert.equal(projects, 0, "All projects must be cascade deleted");
    assert.equal(roles, 0, "All custom roles must be cascade deleted");
    assert.equal(audits, 0, "All audit logs must be cascade deleted");

    // Verify User identity was NOT deleted (preserved independently)
    const userStillExists = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    assert.ok(userStillExists, "User account must be preserved after tenant deletion");
  });

  it("REQ 3 [Point-in-Time Backup Creation]: Generates valid snapshot with SHA-256 metadata", async () => {
    const tempBackupDir = path.resolve(__dirname, "../backups/test-run");
    const meta = await createDatabaseBackup({
      outputDir: tempBackupDir,
      prefix: `test-backup-${uniqueSuffix}`,
    });

    assert.ok(meta, "Backup metadata must be returned");
    assert.ok(fs.existsSync(meta.dumpPath), "Dump SQL file must exist on filesystem");
    assert.ok(meta.sizeBytes > 1000, "Dump SQL file must be non-empty");
    assert.equal(typeof meta.checksumSha256, "string");
    assert.equal(meta.checksumSha256.length, 64, "Expected valid 64-character SHA-256 hex digest");
    assert.ok(meta.tableCount >= 20, "Expected at least 20 tables in metadata snapshot");

    backupFile = meta.dumpPath;
  });

  it("REQ 4 [Point-in-Time Restoration]: Successfully restores database and verifies row integrity", async () => {
    assert.ok(backupFile && fs.existsSync(backupFile), "Backup file from REQ 3 must be available");

    const result = await restoreDatabaseBackup(backupFile);

    assert.equal(result.success, true, "Restore execution must succeed");
    assert.ok(result.tableCount >= 20, "Restored database must contain full table catalog");
    assert.equal(result.metadataVerified, true, "Pre-flight SHA-256 checksum check must pass");
  });

  it("REQ 5 [Schema Parity & Drift Invariant]: Active database exhibits zero schema drift", async () => {
    // Query information_schema for core Phase 5 tables
    const requiredTables = [
      "Organization", "User", "Membership", "Role", "Permission",
      "MembershipRole", "RolePermission", "Project", "Task", "Subtask",
      "Comment", "FileAsset", "AuditLog", "RefreshSession", "Notification",
      "NotificationPreference", "PlatformAuditLog", "BreakGlassAlertOutbox",
      "PlatformMfaNonce", "MembershipInvitation", "_prisma_migrations",
    ];

    const foundRows = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `;
    const foundTableNames = new Set(foundRows.map(r => r.table_name));

    for (const table of requiredTables) {
      assert.ok(
        foundTableNames.has(table),
        `Required table '${table}' must exist in public schema`
      );
    }
  });
});
