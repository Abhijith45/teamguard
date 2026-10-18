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
 * Creates a point-in-time PostgreSQL backup with cryptographic SHA-256 integrity verification.
 *
 * @param {Object} options
 * @param {string} [options.outputDir] - Target backup directory
 * @param {string} [options.prefix="teamguard-backup"] - Backup filename prefix
 * @returns {Promise<Object>} Backup metadata
 */
export async function createDatabaseBackup(options = {}) {
  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error("DATABASE_URL environment variable is required for backup");
  }

  const parsed = new URL(connectionUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  const host = parsed.hostname || "localhost";
  const port = parsed.port || "5432";
  const user = parsed.username || "postgres";
  const password = parsed.password || "";

  const backupDir = options.outputDir || path.resolve(__dirname, "../backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = options.prefix || "teamguard-backup";
  const dumpFilename = `${prefix}-${dbName}-${timestamp}.sql`;
  const dumpFilePath = path.join(backupDir, dumpFilename);
  const metaFilePath = path.join(backupDir, `${prefix}-${dbName}-${timestamp}.meta.json`);

  console.log(`[Backup] Initiating point-in-time dump for database '${dbName}' at ${host}:${port}...`);

  // Count current rows across core models before dump for verification
  const client = new pg.Client({ connectionString: connectionUrl });
  await client.connect();

  const tablesQuery = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = tablesQuery.rows.map(r => r.table_name);
  const rowCounts = {};
  for (const table of tables) {
    const countRes = await client.query(`SELECT COUNT(*)::int as count FROM "${table}";`);
    rowCounts[table] = countRes.rows[0].count;
  }
  await client.end();

  // Execute pg_dump
  const env = { ...process.env, PGPASSWORD: password };
  const cmd = `pg_dump -h "${host}" -p "${port}" -U "${user}" -d "${dbName}" --clean --if-exists --no-owner --no-privileges -f "${dumpFilePath}"`;

  try {
    execSync(cmd, { env, stdio: "pipe" });
  } catch (err) {
    console.error("[Backup Error] pg_dump failed:", err.message);
    throw err;
  }

  const stats = fs.statSync(dumpFilePath);
  const fileBuffer = fs.readFileSync(dumpFilePath);
  const checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  const metadata = {
    database: dbName,
    host,
    port,
    dumpFile: dumpFilename,
    dumpPath: dumpFilePath,
    sizeBytes: stats.size,
    checksumSha256: checksum,
    createdAt: new Date().toISOString(),
    tableCount: tables.length,
    rowCounts,
    format: "plain-sql",
  };

  fs.writeFileSync(metaFilePath, JSON.stringify(metadata, null, 2), "utf-8");
  console.log(`[Backup Success] Point-in-time snapshot created at: ${dumpFilePath}`);
  console.log(`[Backup Details] Size: ${(stats.size / 1024).toFixed(2)} KB | SHA-256: ${checksum.slice(0, 16)}...`);

  return metadata;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createDatabaseBackup()
    .then(meta => {
      console.log("\nBackup process completed successfully.");
      process.exit(0);
    })
    .catch(err => {
      console.error("\nBackup process failed:", err);
      process.exit(1);
    });
}
