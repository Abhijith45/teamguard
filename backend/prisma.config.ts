import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node config/seed.js",
  },
  datasource: {
    url: env("DIRECT_URL") || env("DATABASE_URL"),
  },
});
