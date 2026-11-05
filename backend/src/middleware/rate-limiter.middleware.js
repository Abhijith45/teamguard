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
 * Global rate limiter across all public/tenant API routes (300 req / 5 min).
 * Defends against API flooding, DoS, and scraping.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isTestEnv ? 10000 : Number(process.env.GLOBAL_RATE_LIMIT_MAX ?? 300),
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  skip: (req) => isTestEnv || req.path === "/health" || req.path === "/api/health",
  handler: (req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: "Too Many Requests",
      message: "Request rate limit exceeded. Please slow down.",
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    });
  },
});

/**
 * Mutation rate limiter for state-modifying requests (POST/PUT/PATCH/DELETE) (150 req / 10 min).
 * Defends against write-amplification and automated spamming.
 */
export const mutationRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isTestEnv ? 5000 : Number(process.env.MUTATION_RATE_LIMIT_MAX ?? 150),
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  skip: (req) => isTestEnv || ["GET", "HEAD", "OPTIONS"].includes(req.method),
  handler: (req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: "Too Many Requests",
      message: "Too many write operations. Please slow down.",
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
