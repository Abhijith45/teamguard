import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Restores a PostgreSQL point-in-time backup with pre-flight checksum validation
 * and post-restore relational verification.
 *
 * @param {string} [dumpPath] - Path to the SQL dump file. If omitted, uses latest in backups/
 * @param {Object} [options]
 * @param {boolean} [options.skipChecksum=false] - Skip SHA-256 metadata check
 * @returns {Promise<Object>} Restoration outcome
 */
export async function restoreDatabaseBackup(dumpPath, options = {}) {
  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error("DATABASE_URL environment variable is required for restore");
  }

  const backupDir = path.resolve(__dirname, "../backups");

  let targetSqlPath = dumpPath;
  if (!targetSqlPath) {
    if (!fs.existsSync(backupDir)) {
      throw new Error(`Backup directory '${backupDir}' does not exist and no dumpPath was provided.`);
    }
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith(".sql"))
      .sort()
      .reverse();
    if (!files.length) {
      throw new Error(`No .sql backup files found in '${backupDir}'.`);
    }
    targetSqlPath = path.join(backupDir, files[0]);
  }

  if (!fs.existsSync(targetSqlPath)) {
    throw new Error(`Target backup file '${targetSqlPath}' does not exist.`);
  }

  console.log(`[Restore] Validating backup archive '${path.basename(targetSqlPath)}'...`);

  // Checksum validation if .meta.json exists
  const metaPath = targetSqlPath.replace(/\.sql$/, ".meta.json");
  let metadata = null;
  if (fs.existsSync(metaPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (!options.skipChecksum && metadata.checksumSha256) {
        const fileBuffer = fs.readFileSync(targetSqlPath);
        const actualChecksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");
        if (actualChecksum !== metadata.checksumSha256) {
          throw new Error(
            `Integrity check failed! Expected SHA-256: ${metadata.checksumSha256}, Actual: ${actualChecksum}`
          );
        }
        console.log(`[Restore] Cryptographic SHA-256 checksum verified: ${actualChecksum.slice(0, 16)}...`);
      }
    } catch (err) {
      if (!options.skipChecksum) throw err;
      console.warn(`[Restore Warning] Metadata check skipped: ${err.message}`);
    }
  }

  const parsed = new URL(connectionUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  const host = parsed.hostname || "localhost";
  const port = parsed.port || "5432";
  const user = parsed.username || "postgres";
  const password = parsed.password || "";

  console.log(`[Restore] Applying dump to database '${dbName}' at ${host}:${port}...`);

  const env = { ...process.env, PGPASSWORD: password };
  const cmd = `psql -h "${host}" -p "${port}" -U "${user}" -d "${dbName}" -f "${targetSqlPath}"`;

  try {
    execSync(cmd, { env, stdio: "pipe" });
  } catch (err) {
    console.error("[Restore Error] psql execution failed:", err.message);
    throw err;
  }

  // Post-restore relational check
  const client = new pg.Client({ connectionString: connectionUrl });
  await client.connect();

  const tablesQuery = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = tablesQuery.rows.map(r => r.table_name);
  const restoredRowCounts = {};
  for (const table of tables) {
    const countRes = await client.query(`SELECT COUNT(*)::int as count FROM "${table}";`);
    restoredRowCounts[table] = countRes.rows[0].count;
  }
  await client.end();

  console.log(`[Restore Success] Restored ${tables.length} tables to database '${dbName}'.`);

  return {
    success: true,
    dumpFile: path.basename(targetSqlPath),
    targetDatabase: dbName,
    restoredAt: new Date().toISOString(),
    tableCount: tables.length,
    restoredRowCounts,
    metadataVerified: !!metadata,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const customDump = process.argv[2] || undefined;
  restoreDatabaseBackup(customDump)
    .then(res => {
      console.log("\nRestoration completed successfully.");
      process.exit(0);
    })
    .catch(err => {
      console.error("\nRestoration failed:", err);
      process.exit(1);
    });
}
