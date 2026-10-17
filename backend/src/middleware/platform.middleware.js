import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.js";

function getMfaSecret() {
  return process.env.JWT_ACCESS_SECRET || "fallback-secret-for-development-must-be-long-enough";
}

/**
 * Middleware that strictly restricts route access to verified Platform Super Administrators.
 * Ordinary Organization Owners, Managers, Members, and Viewers will receive HTTP 403 Forbidden.
 */
export async function requirePlatformAdmin(req, res, next) {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Double check from database to prevent stale token elevation
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true, isActive: true },
    });

    if (!user?.isActive || !user?.isPlatformAdmin) {
      return res.status(403).json({
        error: "Forbidden: Platform administrator privileges required",
      });
    }

    req.auth.isPlatformAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware that verifies the ephemeral x-mfa-token (5m TTL, single-use nonce).
 * Enforces dual-control and prevents replay attacks.
 */
export async function requireMfaStepUp(req, res, next) {
  try {
    const mfaToken = req.get("x-mfa-token") || req.body?.mfaToken;
    if (!mfaToken) {
      return res.status(401).json({
        error: "MFA step-up authentication required",
      });
    }

    let claims;
    try {
      claims = jwt.verify(mfaToken, getMfaSecret(), {
        issuer: "teamguard-platform",
        audience: "teamguard-break-glass",
      });
    } catch {
      return res.status(401).json({
        error: "MFA step-up token is invalid or expired",
      });
    }

    // Verify token identity matches authenticated operator
    if (Number(claims.sub) !== req.auth.userId) {
      return res.status(403).json({
        error: "MFA step-up token does not belong to the current operator",
      });
    }

    // Verify target organization binding if present in request
    const targetOrgId = req.body?.organizationId || req.body?.targetOrganizationId || req.params?.id;
    if (targetOrgId && claims.targetOrganizationId && Number(claims.targetOrganizationId) !== Number(targetOrgId)) {
      return res.status(403).json({
        error: "MFA step-up token was issued for a different organization context",
      });
    }

    // Verify single-use nonce in database
    const nonceRecord = await prisma.platformMfaNonce.findUnique({
      where: { nonce: claims.nonce },
    });

    if (!nonceRecord) {
      return res.status(401).json({
        error: "MFA step-up token nonce is invalid",
      });
    }

    if (nonceRecord.usedAt !== null) {
      return res.status(401).json({
        error: "MFA step-up token has already been used (single-use replay protection)",
      });
    }

    if (new Date() > new Date(nonceRecord.expiresAt)) {
      return res.status(401).json({
        error: "MFA step-up token has expired",
      });
    }

    req.mfaSession = {
      claims,
      nonce: claims.nonce,
      targetOrganizationId: claims.targetOrganizationId,
    };

    next();
  } catch (error) {
    next(error);
  }
}
