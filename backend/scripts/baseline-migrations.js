import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function baseline() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("Checking and initializing _prisma_migrations table...");

  // 1. Create _prisma_migrations table if not exists (Prisma standard schema)
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum"              VARCHAR(64) NOT NULL,
      "finished_at"           TIMESTAMPTZ,
      "migration_name"        VARCHAR(255) NOT NULL,
      "logs"                  TEXT,
      "rolled_back_at"        TIMESTAMPTZ,
      "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
    );
  `);

  // 2. Discover migrations in prisma/migrations
  const migrationsDir = path.resolve(__dirname, "../prisma/migrations");
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const migrationDirs = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();

  console.log(`Found ${migrationDirs.length} migrations in directory.`);

  // 3. Check existing applied migrations
  const existingRes = await client.query("SELECT migration_name FROM _prisma_migrations");
  const appliedNames = new Set(existingRes.rows.map(r => r.migration_name));

  for (const name of migrationDirs) {
    if (appliedNames.has(name)) {
      console.log(`  [OK] Already recorded: ${name}`);
      continue;
    }

    const sqlFile = path.join(migrationsDir, name, "migration.sql");
    const sqlContent = fs.existsSync(sqlFile) ? fs.readFileSync(sqlFile, "utf-8") : "";
    const checksum = crypto.createHash("sha256").update(sqlContent).digest("hex");
    const id = crypto.randomUUID();

    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, applied_steps_count)
       VALUES ($1, $2, now(), $3, $4, 1)`,
      [id, checksum, name, `Baselined via baseline-migrations.js`]
    );

    console.log(`  [+] Marked as applied: ${name} (id: ${id.slice(0, 8)}...)`);
  }

  const finalCheck = await client.query("SELECT COUNT(*) FROM _prisma_migrations");
  console.log(`\nSuccessfully baselined migrations. Total recorded: ${finalCheck.rows[0].count}`);

  await client.end();
}

baseline().catch(err => {
  console.error("Baseline error:", err);
  process.exit(1);
});
