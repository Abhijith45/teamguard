import { z } from "zod";
import { HttpError } from "../lib/http-error.js";
import { passwordFitsBcrypt } from "../utils/password.js";
import { refreshCookieName, refreshCookieOptions } from "../lib/tokens.js";
import {
  getCurrentUser,
  loginUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../services/auth.service.js";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128).refine(passwordFitsBcrypt, "Password must be no more than 72 UTF-8 bytes"),
}).strict();

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128).refine(passwordFitsBcrypt, "Password must be no more than 72 UTF-8 bytes"),
}).strict();

function sessionMetadata(req) {
  return { userAgent: req.get("user-agent"), ipAddress: req.ip };
}

function setRefreshCookie(res, token) {
  res.cookie(refreshCookieName, token, refreshCookieOptions());
}

export async function register(req, res) {
  const input = registerSchema.parse(req.body);
  const session = await registerUser(input, sessionMetadata(req));
  setRefreshCookie(res, session.refreshToken);
  return res.status(201).json({ user: session.user, accessToken: session.accessToken });
}

export async function login(req, res) {
  const input = loginSchema.parse(req.body);
  const activeOrgId = req.get("x-organization-id");
  const session = await loginUser(input.identifier, input.password, sessionMetadata(req), activeOrgId);
  setRefreshCookie(res, session.refreshToken);
  return res.json({ user: session.user, accessToken: session.accessToken });
}

export async function refresh(req, res) {
  const activeOrgId = req.get("x-organization-id");
  const session = await rotateRefreshToken(
    req.cookies[refreshCookieName],
    sessionMetadata(req),
    activeOrgId
  );
  setRefreshCookie(res, session.refreshToken);
  return res.json({ user: session.user, accessToken: session.accessToken });
}

export async function logout(req, res) {
  await revokeRefreshToken(req.cookies[refreshCookieName]);
  const { maxAge: _maxAge, ...cookieOptions } = refreshCookieOptions();
  res.clearCookie(refreshCookieName, cookieOptions);
  return res.status(204).end();
}

export async function currentUser(req, res) {
  const activeOrgId = req.get("x-organization-id");
  const user = await getCurrentUser(req.auth.userId, activeOrgId);
  if (!user) throw new HttpError(401, "User account no longer exists");
  return res.json({ user });
}