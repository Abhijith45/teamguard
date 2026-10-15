import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

const TOKEN_ISSUER = "rbac-app";
const TOKEN_AUDIENCE = "rbac-client";

function accessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET must be set to at least 32 characters");
  }
  return secret;
}

export function signAccessToken(userId) {
  return jwt.sign({ sub: String(userId) }, accessSecret(), {
    expiresIn: process.env.ACCESS_TOKEN_TTL ?? "15m",
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret(), {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });
}

export function createRefreshToken() {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashRefreshToken(token), sessionId: randomUUID() };
}

export function hashRefreshToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(from = new Date()) {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("REFRESH_TOKEN_TTL_DAYS must be an integer from 1 to 365");
  }
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export const refreshCookieName = "refreshToken";

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000,
  };
}