import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const tables = ["PlatformAuditLog", "BreakGlassAlertOutbox", "PlatformMfaNonce"];
  for (const table of tables) {
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = $1 ORDER BY ordinal_position
    `, [table]);
    console.log(`Table: ${table}`);
    console.table(cols.rows);

    const fkeys = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = $1
    `, [table]);
    console.log(`Constraints for ${table}:`, fkeys.rows);
  }

  // Check columns on Organization, User, FileAsset
  const orgCols = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'Organization' AND column_name IN ('isSuspended', 'suspendedAt', 'suspensionReason', 'storageQuotaBytes', 'usedStorageBytes')
  `);
  console.log("Organization Phase 5 columns:", orgCols.rows);

  const userCols = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'User' AND column_name = 'isPlatformAdmin'
  `);
  console.log("User Phase 5 columns:", userCols.rows);

  const fileCols = await client.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'FileAsset' AND column_name IN ('fileType', 'storageKey', 'mimeType', 'status', 'etag', 'checksumSha256', 'confirmedAt')
  `);
  console.log("FileAsset Phase 5 columns:", fileCols.rows);

  await client.end();
}

run().catch(console.error);
