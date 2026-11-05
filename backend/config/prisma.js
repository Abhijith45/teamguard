import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { validateDatabaseUrl } from "./database-url.js";

const globalForPrisma = globalThis;
const connectionString = validateDatabaseUrl(process.env.DATABASE_URL);

// Automatically detect Supabase / production SSL requirements
const isProduction = process.env.NODE_ENV === "production";
const isSupabase =
  connectionString.includes("supabase.co") ||
  connectionString.includes("supabase.com") ||
  connectionString.includes("pooler.supabase.com");
const requiresSsl =
  isSupabase || isProduction || connectionString.includes("sslmode=require");

const adapter = new PrismaPg({
  connectionString,
  ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
