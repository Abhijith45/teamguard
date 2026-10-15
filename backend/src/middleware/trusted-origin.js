export function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");
  const allowedOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

  if (origin && origin !== allowedOrigin) {
    return res.status(403).json({ error: "Request origin is not allowed" });
  }

  return next();
}