export function errorHandler(error, _req, res, _next) {
  if (error.name === "ZodError") {
    return res.status(400).json({ error: "Invalid request", details: error.issues });
  }

  if (error.code === "P2002") {
    return res.status(409).json({ error: "A record with those details already exists" });
  }

  if (error.code === "P2025") {
    return res.status(404).json({ error: "Record not found" });
  }

  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 500) {
    console.error(
      JSON.stringify({
        level: "error",
        message: error.message,
        code: error.code,
        stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })
    );
  }

  const payload = {
    error: statusCode >= 500 ? "Internal server error" : error.message,
  };
  // Only surface safe application-level error codes (never ORM or internal database codes)
  if (
    error.code &&
    typeof error.code === "string" &&
    !error.code.startsWith("P") &&
    !error.code.startsWith("DB_")
  ) {
    payload.code = error.code;
  }
  if (error.field) {
    payload.field = error.field;
  }

  return res.status(statusCode).json(payload);
}
