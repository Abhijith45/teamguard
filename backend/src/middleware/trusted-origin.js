export function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();

  const rawOrigins = process.env.FRONTEND_ORIGIN || process.env.CLIENT_URL || "http://localhost:5173";
  const allowedOrigins = rawOrigins
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (!allowedOrigins.includes(origin) || origin === "*") {
    return res.status(403).json({ error: "Request origin is not allowed" });
  }

  return next();
}
