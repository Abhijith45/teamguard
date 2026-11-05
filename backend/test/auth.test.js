import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcryptjs";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { resetAuthRateLimiter } from "../src/middleware/rate-limiter.middleware.js";
import { cleanupExpiredSessions } from "../src/services/auth.service.js";
import { hashRefreshToken } from "../src/lib/tokens.js";

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

function parseCookie(cookieHeader, name = "refreshToken") {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

test("TASK-005 [REQ 1 / US-AUTH-001]: User registration, workspace provisioning & duplicate prevention", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const regPayload = {
    name: "Alex Vance",
    username: `alex_${uniqueSuffix}`,
    email: `alex_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };

  // 1. Successful registration
  const res = await api("/api/auth/register", {
    method: "POST",
    body: regPayload,
  });

  assert.equal(res.status, 201, "Registration should succeed with 201 Created");
  assert.ok(res.data.accessToken, "Should return an access token");
  assert.equal(res.data.user.email, regPayload.email);
  assert.equal(res.data.user.username, regPayload.username);
  assert.equal(typeof res.data.user.passwordHash, "undefined", "Password hash must NEVER be leaked");
  assert.ok(res.data.user.organizations?.length > 0, "Default workspace should be provisioned");

  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "Refresh token cookie must be set");
  assert.ok(setCookie.includes("HttpOnly"), "Refresh token cookie must be HttpOnly");

  // 2. Duplicate registration attempt returns 409 Conflict
  const dupRes = await api("/api/auth/register", {
    method: "POST",
    body: regPayload,
  });
  assert.equal(dupRes.status, 409, "Duplicate username or email should return 409 Conflict");
});

test("TASK-005 [REQ 2 / US-AUTH-002]: Secure credential login & generic authentication failure", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userPayload = {
    name: "Gordon Freeman",
    username: `gordon_${uniqueSuffix}`,
    email: `gordon_${uniqueSuffix}@example.com`,
    password: "CorrectPassword123!",
  };

  await api("/api/auth/register", { method: "POST", body: userPayload });

  // 1. Valid login via username
  const loginUserRes = await api("/api/auth/login", {
    method: "POST",
    body: { identifier: userPayload.username, password: userPayload.password },
  });
  assert.equal(loginUserRes.status, 200);
  assert.ok(loginUserRes.data.accessToken);
  assert.equal(loginUserRes.data.user.email, userPayload.email);

  // 2. Valid login via email
  const loginEmailRes = await api("/api/auth/login", {
    method: "POST",
    body: { identifier: userPayload.email, password: userPayload.password },
  });
  assert.equal(loginEmailRes.status, 200);
  assert.ok(loginEmailRes.data.accessToken);

  // 3. Invalid password returns 401 with generic message
  const badPassRes = await api("/api/auth/login", {
    method: "POST",
    body: { identifier: userPayload.username, password: "WrongPassword999!" },
  });
  assert.equal(badPassRes.status, 401);
  assert.equal(badPassRes.data.error, "Invalid username/email or password");

  // 4. Non-existent identifier returns identical 401 (defense against user enumeration)
  const noUserRes = await api("/api/auth/login", {
    method: "POST",
    body: { identifier: "nonexistent_user_999", password: "SomePassword123!" },
  });
  assert.equal(noUserRes.status, 401);
  assert.equal(noUserRes.data.error, "Invalid username/email or password");
});

test("TASK-005 [REQ 3 / US-AUTH-003]: Silent refresh token rotation maintains family chain and replaces previous session", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userPayload = {
    name: "Alyx Vance",
    username: `alyx_${uniqueSuffix}`,
    email: `alyx_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };

  const regRes = await api("/api/auth/register", { method: "POST", body: userPayload });
  const rawCookie1 = regRes.headers.get("set-cookie");
  const refreshToken1 = parseCookie(rawCookie1);
  assert.ok(refreshToken1, "Must have valid initial refresh token");

  // Verify initial session in database
  const session1 = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken1) },
  });
  assert.ok(session1, "Session 1 must exist in DB");
  assert.ok(session1.familyId, "Session 1 must have familyId");
  assert.equal(session1.revokedAt, null, "Session 1 must be active initially");

  // Call /api/auth/refresh to rotate
  const refreshRes = await api("/api/auth/refresh", {
    method: "POST",
    headers: {
      cookie: `refreshToken=${refreshToken1}`,
    },
  });

  assert.equal(refreshRes.status, 200, "Token rotation must succeed with HTTP 200");
  assert.ok(refreshRes.data.accessToken, "Must issue new access token");

  const rawCookie2 = refreshRes.headers.get("set-cookie");
  const refreshToken2 = parseCookie(rawCookie2);
  assert.ok(refreshToken2, "Must set new refresh token cookie");
  assert.notEqual(refreshToken1, refreshToken2, "Rotated refresh token must differ from original");

  // Verify session 1 was marked as rotated and revoked
  const updatedSession1 = await prisma.refreshSession.findUnique({
    where: { id: session1.id },
  });
  assert.ok(updatedSession1.revokedAt, "Old session must have revokedAt set");
  assert.ok(updatedSession1.rotatedAt, "Old session must have rotatedAt set");
  assert.ok(updatedSession1.replacedBySessionId, "Old session must record replacedBySessionId");

  // Verify new session has same familyId and points to new token
  const session2 = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken2) },
  });
  assert.ok(session2, "New session 2 must exist in DB");
  assert.equal(session2.familyId, session1.familyId, "New session must preserve the token familyId");
  assert.equal(updatedSession1.replacedBySessionId, session2.id, "Session 1 must point to Session 2");
  assert.equal(session2.revokedAt, null, "Session 2 must be active");
});

test("TASK-005 [REQ 4 / US-AUTH-003 / SEC-09]: Replay of already-used refresh token triggers family invalidation", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userPayload = {
    name: "Barney Calhoun",
    username: `barney_${uniqueSuffix}`,
    email: `barney_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };

  const regRes = await api("/api/auth/register", { method: "POST", body: userPayload });
  const token1 = parseCookie(regRes.headers.get("set-cookie"));

  // 1. Legitimate user rotates token1 -> obtains token2
  const rot1Res = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${token1}` },
  });
  assert.equal(rot1Res.status, 200);
  const token2 = parseCookie(rot1Res.headers.get("set-cookie"));

  // 2. Legitimate user rotates token2 -> obtains token3
  const rot2Res = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${token2}` },
  });
  assert.equal(rot2Res.status, 200);
  const token3 = parseCookie(rot2Res.headers.get("set-cookie"));

  // Verify token3 is currently active in DB
  const session3Before = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(token3) },
  });
  assert.equal(session3Before.revokedAt, null, "Token 3 should be valid before attack");

  // 3. Attacker replays compromised token1 (stolen token replay attack)
  const replayRes = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${token1}` },
  });

  assert.equal(replayRes.status, 401, "Replayed token must be rejected with HTTP 401");
  assert.ok(
    replayRes.data.error.includes("reuse detected"),
    "Error message must specify token reuse detection"
  );

  // 4. Verify that the entire family (including token3) has been invalidated in DB
  const session3After = await prisma.refreshSession.findUnique({
    where: { id: session3Before.id },
  });
  assert.ok(session3After.revokedAt, "Legitimate latest token in family must be revoked due to replay");

  // 5. Subsequent attempt to use token3 also fails
  const token3Attempt = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${token3}` },
  });
  assert.equal(token3Attempt.status, 401, "Revoked family token must be rejected");
});

test("TASK-005 [REQ 5 / US-AUTH-003]: Multi-device session isolation across distinct token families", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userPayload = {
    name: "Eli Vance",
    username: `eli_${uniqueSuffix}`,
    email: `eli_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };

  await api("/api/auth/register", { method: "POST", body: userPayload });

  // Device A logs in
  const loginDeviceA = await api("/api/auth/login", {
    method: "POST",
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" },
    body: { identifier: userPayload.username, password: userPayload.password },
  });
  assert.equal(loginDeviceA.status, 200);
  const deviceAToken1 = parseCookie(loginDeviceA.headers.get("set-cookie"));

  // Device B logs in
  const loginDeviceB = await api("/api/auth/login", {
    method: "POST",
    headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" },
    body: { identifier: userPayload.username, password: userPayload.password },
  });
  assert.equal(loginDeviceB.status, 200);
  const deviceBToken1 = parseCookie(loginDeviceB.headers.get("set-cookie"));

  // Verify they belong to different families
  const sessionA = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(deviceAToken1) },
  });
  const sessionB = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(deviceBToken1) },
  });
  assert.notEqual(sessionA.familyId, sessionB.familyId, "Distinct devices must have distinct family IDs");

  // Device A rotates token
  const rotA = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${deviceAToken1}` },
  });
  assert.equal(rotA.status, 200);
  const deviceAToken2 = parseCookie(rotA.headers.get("set-cookie"));

  // Device B remains valid and can rotate independently
  const rotB = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${deviceBToken1}` },
  });
  assert.equal(rotB.status, 200, "Device B must remain valid after Device A rotated");
  const deviceBToken2 = parseCookie(rotB.headers.get("set-cookie"));

  // Attacker replays Device A's old token
  const replayA = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${deviceAToken1}` },
  });
  assert.equal(replayA.status, 401, "Device A replay must fail");

  // Device A family is revoked
  const deviceAAttempt = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${deviceAToken2}` },
  });
  assert.equal(deviceAAttempt.status, 401, "Device A newest token is revoked");

  // Device B remains unaffected by Device A's family compromise
  const rotB2 = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${deviceBToken2}` },
  });
  assert.equal(rotB2.status, 200, "Device B session remains fully intact");
});

test("TASK-005 [REQ 6 / TG-AUTH-003]: Session cleanup service & endpoint purge expired sessions", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userPayload = {
    name: "Isaac Kleiner",
    username: `kleiner_${uniqueSuffix}`,
    email: `kleiner_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };

  const regRes = await api("/api/auth/register", { method: "POST", body: userPayload });
  const activeToken = parseCookie(regRes.headers.get("set-cookie"));
  const accessToken = regRes.data.accessToken;

  // Create an expired session and an old revoked session directly in DB
  const pastDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
  await prisma.refreshSession.createMany({
    data: [
      {
        id: `expired_session_${uniqueSuffix}`,
        familyId: `expired_fam_${uniqueSuffix}`,
        userId: regRes.data.user.id,
        tokenHash: `hash_expired_${uniqueSuffix}`,
        expiresAt: pastDate, // expired
      },
      {
        id: `revoked_session_${uniqueSuffix}`,
        familyId: `revoked_fam_${uniqueSuffix}`,
        userId: regRes.data.user.id,
        tokenHash: `hash_revoked_${uniqueSuffix}`,
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        revokedAt: pastDate, // revoked 40 days ago
      },
    ],
  });

  // Call cleanup endpoint
  const cleanupRes = await api("/api/auth/sessions/cleanup", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: { olderThanDays: 30 },
  });

  assert.equal(cleanupRes.status, 200, "Cleanup endpoint must return HTTP 200");
  assert.ok(cleanupRes.data.deletedCount >= 2, "Must report at least 2 purged sessions");

  // Assert expired and old revoked sessions were deleted
  const deletedExpired = await prisma.refreshSession.findUnique({
    where: { id: `expired_session_${uniqueSuffix}` },
  });
  assert.equal(deletedExpired, null, "Expired session must be deleted");

  // Assert current active session was preserved
  const activeSession = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(activeToken) },
  });
  assert.ok(activeSession, "Active unexpired session must not be purged");
});

test("TASK-005 [REQ 7 / US-ACC-001 / TG-ACC-001]: Secure profile update & email conflict prevention", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const user1 = {
    name: "User One",
    username: `u1_${uniqueSuffix}`,
    email: `u1_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };
  const user2 = {
    name: "User Two",
    username: `u2_${uniqueSuffix}`,
    email: `u2_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };

  const reg1 = await api("/api/auth/register", { method: "POST", body: user1 });
  await api("/api/auth/register", { method: "POST", body: user2 });

  // 1. Update display name & avatar URL
  const updateRes = await api("/api/auth/profile", {
    method: "PATCH",
    headers: { authorization: `Bearer ${reg1.data.accessToken}` },
    body: {
      name: "User One Updated",
      avatarUrl: "https://example.com/avatar.png",
    },
  });

  assert.equal(updateRes.status, 200, "Profile update should succeed with HTTP 200");
  assert.equal(updateRes.data.user.name, "User One Updated");
  assert.equal(updateRes.data.user.avatarUrl, "https://example.com/avatar.png");
  assert.equal(typeof updateRes.data.user.passwordHash, "undefined", "Password hash must not be leaked");

  // 2. Attempt to update email to user2's email -> 409 Conflict
  const conflictRes = await api("/api/auth/profile", {
    method: "PATCH",
    headers: { authorization: `Bearer ${reg1.data.accessToken}` },
    body: { email: user2.email },
  });

  assert.equal(conflictRes.status, 409, "Claiming another user's email must return 409 Conflict");
  assert.ok(conflictRes.data.error.includes("already in use"));

  // 3. Verify in DB that email was not changed
  const dbUser = await prisma.user.findUnique({ where: { id: reg1.data.user.id } });
  assert.equal(dbUser.email, user1.email, "Email in database must remain unchanged");
});

test("TASK-005 [REQ 8 / US-ACC-001 / TG-ACC-001]: Password change verifies current password, updates bcrypt hash, and invalidates other sessions", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userPayload = {
    name: "Judith Mossman",
    username: `judith_${uniqueSuffix}`,
    email: `judith_${uniqueSuffix}@example.com`,
    password: "InitialPassword123!",
  };

  const regRes = await api("/api/auth/register", { method: "POST", body: userPayload });
  const sessionToken1 = parseCookie(regRes.headers.get("set-cookie"));
  const accessToken = regRes.data.accessToken;

  // Login on a second device to create another session
  const device2Res = await api("/api/auth/login", {
    method: "POST",
    headers: { "user-agent": "Mobile Safari" },
    body: { identifier: userPayload.username, password: userPayload.password },
  });
  const sessionToken2 = parseCookie(device2Res.headers.get("set-cookie"));

  // 1. Password change with wrong current password returns 401
  const badPassRes = await api("/api/auth/change-password", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body: {
      currentPassword: "WrongInitialPassword!",
      newPassword: "BrandNewSecurePassword123!",
    },
  });
  assert.equal(badPassRes.status, 401, "Wrong current password must return HTTP 401");

  // 2. Password change with valid current password succeeds
  const successRes = await api("/api/auth/change-password", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      cookie: `refreshToken=${sessionToken1}`,
    },
    body: {
      currentPassword: userPayload.password,
      newPassword: "BrandNewSecurePassword123!",
      revokeOtherSessions: true,
    },
  });
  assert.equal(successRes.status, 200, "Password change must succeed with HTTP 200");
  assert.equal(successRes.data.success, true);

  // 3. Verify in DB that new password hash is valid bcrypt
  const updatedUser = await prisma.user.findUnique({ where: { id: regRes.data.user.id } });
  const matchesNew = await bcrypt.compare("BrandNewSecurePassword123!", updatedUser.passwordHash);
  assert.equal(matchesNew, true, "New password hash must match in DB");

  // 4. Verify second device session was revoked
  const device2Session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(sessionToken2) },
  });
  assert.ok(device2Session.revokedAt, "Other device sessions must be revoked on password change");

  // 5. Old password no longer works
  const oldLoginRes = await api("/api/auth/login", {
    method: "POST",
    body: { identifier: userPayload.username, password: userPayload.password },
  });
  assert.equal(oldLoginRes.status, 401, "Old password must be rejected");

  // 6. New password succeeds
  const newLoginRes = await api("/api/auth/login", {
    method: "POST",
    body: { identifier: userPayload.username, password: "BrandNewSecurePassword123!" },
  });
  assert.equal(newLoginRes.status, 200, "Login with new password must succeed");
});


test("TASK-005 [REQ 9 / SEC-10]: 'Keep me signed in' persistent session with Max-Age when enabled", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userPayload = {
    name: "Persistent User",
    username: `persist_${uniqueSuffix}`,
    email: `persist_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };

  const regRes = await api("/api/auth/register", {
    method: "POST",
    body: { ...userPayload, rememberMe: true },
  });
  assert.equal(regRes.status, 201);

  const cookieHeader = regRes.headers.get("set-cookie") || "";
  assert.ok(cookieHeader.includes("Max-Age="), "Cookie must have Max-Age attribute for persistent sessions");
  assert.ok(cookieHeader.includes("HttpOnly"), "Cookie must be HttpOnly");

  // Verify session expiration in DB is ~30 days
  const token = parseCookie(cookieHeader);
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });
  assert.ok(session, "Session must exist in DB");
  const ttlMs = session.expiresAt.getTime() - session.createdAt.getTime();
  const ttlDays = ttlMs / (1000 * 60 * 60 * 24);
  assert.ok(ttlDays >= 28 && ttlDays <= 31, `Expected ~30 days TTL, got ${ttlDays}`);
});

test("TASK-005 [REQ 10 / SEC-10]: 'Keep me signed in' disabled sets browser session cookie and preserves transient state across rotation", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const userPayload = {
    name: "Transient User",
    username: `transient_${uniqueSuffix}`,
    email: `transient_${uniqueSuffix}@example.com`,
    password: "Password123!",
  };

  // 1. Register with rememberMe = false
  const regRes = await api("/api/auth/register", {
    method: "POST",
    body: { ...userPayload, rememberMe: false },
  });
  assert.equal(regRes.status, 201);

  const regCookie = regRes.headers.get("set-cookie") || "";
  assert.ok(!regCookie.includes("Max-Age="), "Session cookie must NOT have Max-Age attribute");
  assert.ok(!regCookie.includes("Expires="), "Session cookie must NOT have Expires attribute");
  assert.ok(regCookie.includes("HttpOnly"), "Session cookie must be HttpOnly");

  // Verify session in DB has ~1 day TTL
  const regToken = parseCookie(regCookie);
  const regSession = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(regToken) },
  });
  const regTtlMs = regSession.expiresAt.getTime() - regSession.createdAt.getTime();
  const regTtlHours = regTtlMs / (1000 * 60 * 60);
  assert.ok(regTtlHours >= 23 && regTtlHours <= 25, `Expected ~24h TTL, got ${regTtlHours}`);

  // 2. Explicit login with rememberMe = false
  const loginRes = await api("/api/auth/login", {
    method: "POST",
    body: {
      identifier: userPayload.username,
      password: userPayload.password,
      rememberMe: false,
    },
  });
  assert.equal(loginRes.status, 200);

  const loginCookie = loginRes.headers.get("set-cookie") || "";
  assert.ok(!loginCookie.includes("Max-Age="), "Login session cookie must NOT have Max-Age");
  assert.ok(!loginCookie.includes("Expires="), "Login session cookie must NOT have Expires");

  const loginToken = parseCookie(loginCookie);
  const loginSession = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(loginToken) },
  });
  const loginTtlMs = loginSession.expiresAt.getTime() - loginSession.createdAt.getTime();
  const loginTtlHours = loginTtlMs / (1000 * 60 * 60);
  assert.ok(loginTtlHours >= 23 && loginTtlHours <= 25, `Expected ~24h TTL, got ${loginTtlHours}`);

  // 3. Silent refresh rotation preserves session-cookie (non-persistent) behavior
  const refreshRes = await api("/api/auth/refresh", {
    method: "POST",
    headers: { cookie: `refreshToken=${loginToken}` },
  });
  assert.equal(refreshRes.status, 200);

  const refreshCookie = refreshRes.headers.get("set-cookie") || "";
  assert.ok(!refreshCookie.includes("Max-Age="), "Rotated cookie must also be a session cookie (no Max-Age)");
  assert.ok(!refreshCookie.includes("Expires="), "Rotated cookie must also be a session cookie (no Expires)");

  const rotatedToken = parseCookie(refreshCookie);
  const rotatedSession = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(rotatedToken) },
  });
  const rotTtlMs = rotatedSession.expiresAt.getTime() - rotatedSession.createdAt.getTime();
  const rotTtlHours = rotTtlMs / (1000 * 60 * 60);
  assert.ok(rotTtlHours >= 23 && rotTtlHours <= 25, `Expected rotated session to preserve ~24h TTL, got ${rotTtlHours}`);
});
