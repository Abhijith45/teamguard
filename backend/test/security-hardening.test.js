import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken, verifyAccessToken } from "../src/lib/tokens.js";
import { isStrongPassword } from "../src/controllers/auth.controller.js";
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

test("SEC-01: Demo persona switcher is blocked when DEMO_MODE_ENABLED=false", async () => {
  const prevVal = process.env.DEMO_MODE_ENABLED;
  try {
    process.env.DEMO_MODE_ENABLED = "false";
    const res = await api("/api/demo/switch-persona", {
      method: "POST",
      body: { persona: "super-admin" },
    });
    assert.equal(res.status, 403);
    assert.match(res.data.error, /Demo mode is disabled/i);
  } finally {
    process.env.DEMO_MODE_ENABLED = prevVal ?? "true";
  }
});

test("SEC-02: Demo persona switcher checks IP allowlist when configured", async () => {
  const prevIps = process.env.DEMO_ALLOWED_IPS;
  const prevMode = process.env.DEMO_MODE_ENABLED;
  try {
    process.env.DEMO_MODE_ENABLED = "true";
    process.env.DEMO_ALLOWED_IPS = "192.168.1.100, 10.0.0.1";
    const res = await api("/api/demo/switch-persona", {
      method: "POST",
      body: { persona: "super-admin" },
    });
    assert.equal(res.status, 403);
    assert.match(res.data.error, /Demo access is restricted/i);
  } finally {
    process.env.DEMO_ALLOWED_IPS = prevIps ?? "";
    process.env.DEMO_MODE_ENABLED = prevMode ?? "true";
  }
});

test("SEC-03: JWT verification enforces HS256 algorithm pinning (rejects alg:none forgery)", async () => {
  // 1. Normal token signed by signAccessToken works
  const normalToken = signAccessToken(1);
  const claims = verifyAccessToken(normalToken);
  assert.equal(claims.sub, "1");

  // 2. Token crafted with alg:none must be rejected
  const fakeToken = jwt.sign({ sub: "999" }, "", { algorithm: "none" });
  assert.throws(
    () => verifyAccessToken(fakeToken),
    /invalid algorithm|jwt/i,
    "verifyAccessToken must reject alg:none unsigned tokens"
  );
});

test("SEC-04: /api/platform/cache-stats requires authentication and platform-admin privileges", async () => {
  // 1. Unauthenticated request -> 401
  const unauthRes = await api("/api/platform/cache-stats");
  assert.equal(unauthRes.status, 401);

  // 2. Regular user (non-platform admin) -> 403
  const normalUser = await prisma.user.findFirst({
    where: { isPlatformAdmin: false, isActive: true },
  });
  if (normalUser) {
    const userToken = signAccessToken(normalUser.id);
    const forbiddenRes = await api("/api/platform/cache-stats", {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert.equal(forbiddenRes.status, 403);
    assert.match(forbiddenRes.data.error, /Platform admin access required/i);
  }
});

test("SEC-05: Global search query length is capped at 100 characters and sanitized", async () => {
  const testUser = await prisma.user.findFirst({ where: { isActive: true } });
  if (!testUser) return;

  const membership = await prisma.membership.findFirst({
    where: { userId: testUser.id, status: "ACTIVE" },
  });
  if (!membership) return;

  const token = signAccessToken(testUser.id);
  const headers = {
    authorization: `Bearer ${token}`,
    "x-organization-id": String(membership.organizationId),
  };

  // 1. Oversized search query (> 100 chars) -> 400 Bad Request
  const oversizedQuery = "a".repeat(101);
  const badRes = await api(`/api/search?q=${oversizedQuery}`, { headers });
  assert.equal(badRes.status, 400);
  assert.match(badRes.data.error, /Search query too long/i);

  // 2. Valid query with HTML characters -> successfully sanitized and processed (HTTP 200)
  const xssQuery = "%3Cscript%3Ealert(1)%3C/script%3E";
  const okRes = await api(`/api/search?q=${xssQuery}`, { headers });
  assert.equal(okRes.status, 200);
  assert.equal(typeof okRes.data.total, "number");
});

test("SEC-06: Password strength validator enforces uppercase, lowercase, digit, and special character", () => {
  assert.equal(isStrongPassword("short"), false, "All lowercase must fail");
  assert.equal(isStrongPassword("NOLOWERCASE123!"), false, "Missing lowercase must fail");
  assert.equal(isStrongPassword("NoNumbersHere!"), false, "Missing digit must fail");
  assert.equal(isStrongPassword("NoSpecialChars123"), false, "Missing special char must fail");
  assert.equal(isStrongPassword("StrongPassword123!"), true, "Compliant password must pass");
  assert.equal(isStrongPassword("P@ssw0rd!#$"), true, "Compliant password must pass");
});

test("SEC-07: Registration rejects passwords that do not meet complexity requirements", async () => {
  const weakPasswordPayload = {
    name: "Weak Pass User",
    username: `weak_${Date.now().toString().slice(-6)}`,
    email: `weak_${Date.now().toString().slice(-6)}@example.com`,
    password: "weakpassword123", // Missing uppercase & special char
  };

  const res = await api("/api/auth/register", {
    method: "POST",
    body: weakPasswordPayload,
  });

  assert.equal(res.status, 400);
  assert.match(JSON.stringify(res.data), /Password must contain uppercase/i);
});

test("SEC-08: Profile update rejects untrusted / malicious avatar URLs", async () => {
  const testUser = await prisma.user.findFirst({ where: { isActive: true } });
  if (!testUser) return;

  const token = signAccessToken(testUser.id);
  const headers = { authorization: `Bearer ${token}` };

  // 1. Untrusted third-party host -> 400
  const badHostRes = await api("/api/auth/profile", {
    method: "PATCH",
    headers,
    body: { avatarUrl: "https://evil-phishing-host.com/trojan.png" },
  });
  assert.equal(badHostRes.status, 400);

  // 2. JavaScript pseudo-protocol -> 400
  const jsProtoRes = await api("/api/auth/profile", {
    method: "PATCH",
    headers,
    body: { avatarUrl: "javascript:alert(document.cookie)" },
  });
  assert.equal(jsProtoRes.status, 400);

  // 3. Trusted host (images.unsplash.com) -> 200
  const goodHostRes = await api("/api/auth/profile", {
    method: "PATCH",
    headers,
    body: { avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120" },
  });
  assert.equal(goodHostRes.status, 200);
});

test("SEC-09: RequireTrustedOrigin enforces multi-origin whitelist", async () => {
  // 1. Untrusted origin is blocked with HTTP 403 on refresh
  const untrustedRes = await api("/api/auth/refresh", {
    method: "POST",
    headers: { origin: "http://malicious-site.org" },
  });
  assert.equal(untrustedRes.status, 403);
  assert.match(untrustedRes.data.error, /Request origin is not allowed/i);

  // 2. Trusted origin is allowed past origin check (returns 401 due to missing refresh cookie, NOT 403)
  const trustedRes = await api("/api/auth/refresh", {
    method: "POST",
    headers: { origin: "http://localhost:5173" },
  });
  assert.equal(trustedRes.status, 401);
  assert.match(trustedRes.data.error, /Refresh session is required/i);
});
