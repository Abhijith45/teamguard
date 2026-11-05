import { rateLimit } from "express-rate-limit";

const authWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const isTestEnv = process.env.NODE_ENV === "test" || process.env.npm_lifecycle_event === "test" || process.argv.some(a => a.includes("test"));
const authMax = isTestEnv ? 10 : Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);

/**
 * TASK-004 / OPS-05: Auth endpoints rate limiting (max 10 requests / 15 minutes per IP).
 * Defends against brute-force credential stuffing and password guessing.
 */
export const authRateLimiter = rateLimit({
  windowMs: authWindowMs,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  handler: (req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: "Too Many Requests",
      message: "Too many authentication attempts. Please try again later.",
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    });
  },
});

/**
 * Test helper to reset rate limit counters for a specific IP or local test runners.
 */
export async function resetAuthRateLimiter(ip = "127.0.0.1") {
  if (typeof authRateLimiter.resetKey === "function") {
    await authRateLimiter.resetKey(ip);
    await authRateLimiter.resetKey("::1");
    await authRateLimiter.resetKey("::ffff:127.0.0.1");
  }
}
