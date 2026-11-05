import { z } from "zod";
import { HttpError } from "../lib/http-error.js";
import { passwordFitsBcrypt } from "../utils/password.js";
import { refreshCookieName, refreshCookieOptions } from "../lib/tokens.js";
import {
  changeUserPassword,
  cleanupExpiredSessions,
  getCurrentUser,
  loginUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
  updateUserProfile,
} from "../services/auth.service.js";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128).refine(passwordFitsBcrypt, "Password must be no more than 72 UTF-8 bytes"),
  rememberMe: z.boolean().optional().default(true),
}).strict();

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128).refine(passwordFitsBcrypt, "Password must be no more than 72 UTF-8 bytes"),
  rememberMe: z.boolean().optional().default(true),
}).strict();

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/).optional(),
  avatarUrl: z.string().trim().url().max(1024).nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one profile field must be provided for update",
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128).refine(passwordFitsBcrypt, "Current password must be no more than 72 UTF-8 bytes"),
  newPassword: z.string().min(8).max(128).refine(passwordFitsBcrypt, "New password must be no more than 72 UTF-8 bytes"),
  revokeOtherSessions: z.boolean().optional().default(true),
}).strict();

const cleanupSessionsSchema = z.object({
  olderThanDays: z.coerce.number().int().min(0).max(365).optional().default(30),
}).strict().optional();

function sessionMetadata(req) {
  return { userAgent: req.get("user-agent"), ipAddress: req.ip };
}

function setRefreshCookie(res, token, rememberMe = true) {
  res.cookie(refreshCookieName, token, refreshCookieOptions(rememberMe));
}

export async function register(req, res) {
  const input = registerSchema.parse(req.body);
  const session = await registerUser(input, sessionMetadata(req));
  setRefreshCookie(res, session.refreshToken, session.rememberMe);
  return res.status(201).json({ user: session.user, accessToken: session.accessToken });
}

export async function login(req, res) {
  const input = loginSchema.parse(req.body);
  const activeOrgId = req.get("x-organization-id");
  const session = await loginUser(input.identifier, input.password, sessionMetadata(req), activeOrgId, input.rememberMe);
  setRefreshCookie(res, session.refreshToken, session.rememberMe);
  return res.json({ user: session.user, accessToken: session.accessToken });
}

export async function refresh(req, res) {
  const activeOrgId = req.get("x-organization-id");
  const session = await rotateRefreshToken(
    req.cookies[refreshCookieName],
    sessionMetadata(req),
    activeOrgId
  );
  setRefreshCookie(res, session.refreshToken, session.rememberMe);
  return res.json({ user: session.user, accessToken: session.accessToken });
}

export async function logout(req, res) {
  await revokeRefreshToken(req.cookies[refreshCookieName]);
  const { maxAge: _maxAge, ...cookieOptions } = refreshCookieOptions(false);
  res.clearCookie(refreshCookieName, cookieOptions);
  return res.status(204).end();
}

export async function currentUser(req, res) {
  const activeOrgId = req.get("x-organization-id");
  const user = await getCurrentUser(req.auth.userId, activeOrgId);
  if (!user) throw new HttpError(401, "User account no longer exists");
  return res.json({ user });
}

export async function updateProfile(req, res) {
  const input = profileUpdateSchema.parse(req.body);
  const activeOrgId = req.get("x-organization-id");
  const user = await updateUserProfile(req.auth.userId, input, activeOrgId);
  return res.json({ user });
}

export async function changePassword(req, res) {
  const input = changePasswordSchema.parse(req.body);
  const currentRefreshToken = req.cookies[refreshCookieName];
  const result = await changeUserPassword(req.auth.userId, input, currentRefreshToken);
  return res.json(result);
}

export async function cleanupSessions(req, res) {
  const input = req.body ? cleanupSessionsSchema.parse(req.body) : {};
  const result = await cleanupExpiredSessions(input);
  return res.json(result);
}
