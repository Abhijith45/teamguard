import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import http from "node:http";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async () => {
  await resetAuthRateLimiter("127.0.0.1");
});

test.afterEach(async () => {
  await resetAuthRateLimiter("127.0.0.1");
});

async function api(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "content-type": "application/json",
    ...options.headers,
  };
  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

test("TASK-004 [REQ 1 / OPS-04]: Helmet security headers are enforced across all endpoints", async () => {
  const res = await api("/api/health");

  // 1. Frameguard (Clickjacking prevention)
  assert.equal(
    res.headers.get("x-frame-options"),
    "SAMEORIGIN",
    "X-Frame-Options must be set to SAMEORIGIN"
  );

  // 2. Content Security Policy (XSS prevention)
  const csp = res.headers.get("content-security-policy");
  assert.ok(csp, "Content-Security-Policy header must be present");
  assert.match(csp, /default-src 'self'/, "CSP must restrict default sources to 'self'");
  assert.match(csp, /frame-ancestors 'self'/, "CSP must restrict frame ancestors to 'self'");

  // 3. MIME Sniffing protection
  assert.equal(
    res.headers.get("x-content-type-options"),
    "nosniff",
    "X-Content-Type-Options must be set to nosniff"
  );

  // 4. Referrer Policy
  assert.equal(
    res.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
    "Referrer-Policy must be strict-origin-when-cross-origin"
  );

  // 5. HSTS (Strict-Transport-Security)
  const hsts = res.headers.get("strict-transport-security");
  assert.ok(hsts, "Strict-Transport-Security header must be present");
  assert.match(hsts, /max-age=31536000/, "HSTS max-age must be at least 1 year");

  // 6. X-Powered-By header must be disabled
  assert.equal(
    res.headers.get("x-powered-by"),
    null,
    "X-Powered-By header must be absent to prevent fingerprinting"
  );
});

test("TASK-004 [REQ 2 / OPS-02]: Strict CORS origin whitelisting with credentials enabled", async () => {
  // 1. Request with allowed origin
  const allowedRes = await api("/api/health", {
    headers: {
      origin: "http://localhost:5173",
    },
  });
  assert.equal(
    allowedRes.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
    "Allowed origin must be reflected in Access-Control-Allow-Origin"
  );
  assert.equal(
    allowedRes.headers.get("access-control-allow-credentials"),
    "true",
    "Credentials must be allowed for trusted origin"
  );

  // 2. Request with unauthorized origin must NOT be granted CORS access
  const disallowedRes = await api("/api/health", {
    headers: {
      origin: "http://malicious-attacker.com",
    },
  });
  assert.equal(
    disallowedRes.headers.get("access-control-allow-origin"),
    null,
    "Unauthorized origin must NOT receive Access-Control-Allow-Origin"
  );

  // 3. Preflight OPTIONS request for trusted origin
  const preflightRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:5173",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-organization-id",
    },
  });
  assert.equal(preflightRes.status, 204, "Preflight must return 204 No Content");
  assert.equal(
    preflightRes.headers.get("access-control-allow-origin"),
    "http://localhost:5173"
  );
  assert.equal(
    preflightRes.headers.get("access-control-allow-credentials"),
    "true"
  );
});

test("TASK-004 [REQ 3 / OPS-06]: GET /api/health verifies database connectivity without leaking credentials", async () => {
  const res = await api("/api/health");
  assert.equal(res.status, 200, "Health check must return HTTP 200");
  assert.equal(res.data.status, "healthy", "Status must be 'healthy'");
  assert.equal(res.data.database, "connected", "Database connectivity must be verified");
  assert.equal(res.data.service, "TeamGuard Backend API");

  // Verify that sensitive credentials are never exposed
  const stringified = JSON.stringify(res.data).toLowerCase();
  assert.ok(!stringified.includes("password"), "Must not leak password");
  assert.ok(!stringified.includes("postgres://"), "Must not leak connection URL");
  assert.ok(!stringified.includes("secret"), "Must not leak secret keys");
});

test("TASK-004 [REQ 4 / OPS-05]: Rate limiter blocks brute force attempts with HTTP 429 after 10 requests", async () => {
  // Ensure starting with clean rate limiter
  await resetAuthRateLimiter("127.0.0.1");

  // Send 10 consecutive login attempts (which fail validation, e.g. empty body)
  for (let i = 1; i <= 10; i++) {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: { email: `attacker${i}@test.com`, password: "wrong" },
    });
    // Requests 1-10 should NOT be rate-limited (they return 400 or 401)
    assert.notEqual(
      res.status,
      429,
      `Request #${i} should not be rate limited yet (got ${res.status})`
    );
  }

  // The 11th request must be blocked with HTTP 429 Too Many Requests
  const blockedRes = await api("/api/auth/login", {
    method: "POST",
    body: { email: "attacker11@test.com", password: "wrong" },
  });

  assert.equal(
    blockedRes.status,
    429,
    "The 11th request must be rejected with HTTP 429 Too Many Requests"
  );
  assert.equal(blockedRes.data.error, "Too Many Requests");
  assert.match(blockedRes.data.message, /too many.*attempts/i);
  assert.ok(
    blockedRes.data.retryAfterSeconds > 0,
    "Should provide retryAfterSeconds"
  );

  // Rate limit headers must be present
  assert.ok(
    blockedRes.headers.get("ratelimit-limit"),
    "RateLimit-Limit header must be present"
  );
  assert.equal(
    blockedRes.headers.get("ratelimit-remaining"),
    "0",
    "RateLimit-Remaining header must be 0"
  );
});

test("TASK-004 [REQ 5 / OPS-05]: Rate limiter is also enforced on /api/v1/auth path alias", async () => {
  await resetAuthRateLimiter("127.0.0.1");

  for (let i = 1; i <= 10; i++) {
    await api("/api/v1/auth/login", {
      method: "POST",
      body: { email: "v1-test@test.com", password: "wrong" },
    });
  }

  const blockedV1Res = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email: "v1-test@test.com", password: "wrong" },
  });

  assert.equal(
    blockedV1Res.status,
    429,
    "/api/v1/auth/login must enforce rate limiting at 10 requests"
  );
});
