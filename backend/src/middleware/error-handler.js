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
    console.error(error);
  }

  return res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal server error" : error.message,
  });
}