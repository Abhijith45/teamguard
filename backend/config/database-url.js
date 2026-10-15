export function validateDatabaseUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env and set your PostgreSQL connection string.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
  }
  if (!parsedUrl.hostname || !parsedUrl.username || !parsedUrl.password || parsedUrl.pathname.length < 2) {
    throw new Error("DATABASE_URL must include a host, username, password, and database name.");
  }

  return value;
}