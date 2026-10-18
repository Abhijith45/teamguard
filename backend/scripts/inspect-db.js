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

  const tablesRes = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log("Current Tables in rbacdb:", tablesRes.rows.map(r => r.table_name));

  try {
    const migRes = await client.query("SELECT id, migration_name, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at");
    console.log("Prisma Migrations Applied in DB:", migRes.rows);
  } catch (err) {
    console.log("Error querying _prisma_migrations:", err.message);
  }

  await client.end();
}

run().catch(console.error);
