import { prisma } from "../../config/prisma.js";

/**
 * Access tier rank hierarchy:
 * FULL (4) > EDIT (3) > COMMENT (2) > VIEW (1)
 */
export const SPACE_TIER_RANK = {
  VIEW: 1,
  COMMENT: 2,
  EDIT: 3,
  FULL: 4,
};

/**
 * Determines whether a caller holds organization-level administrative bypass.
 */
export function isSpaceAdminOrOwner(req) {
  if (req.auth?.isPlatformAdmin) return true;
  if (req.userPermissions?.has("space:manage") || req.userPermissions?.has("roles:manage")) {
    return true;
  }
  if (req.membership?.roles) {
    return req.membership.roles.some((mr) => {
      const slug = (mr.role?.slug || "").toLowerCase();
      const name = (mr.role?.name || "").toLowerCase();
      return (
        slug === "super-admin" ||
        slug === "admin" ||
        slug === "owner" ||
        name === "super admin" ||
        name === "admin" ||
        name === "owner"
      );
    });
  }
  return false;
}

/**
 * Spatial ReBAC Authorization Middleware (Layer 4)
 *
 * @param {"VIEW" | "COMMENT" | "EDIT" | "FULL"} [requiredLevel="VIEW"]
 * @returns {import("express").RequestHandler}
 */
export function requireSpaceAccess(requiredLevel = "VIEW") {
  const normalizedRequired = (requiredLevel || "VIEW").toUpperCase();
  const requiredRank = SPACE_TIER_RANK[normalizedRequired] ?? 1;

  return async (req, res, next) => {
    try {
      // 1. Guest Account Exclusion (F-09)
      if (req.membership?.accountType === "GUEST" || req.user?.accountType === "GUEST") {
        return res.status(403).json({
          error: "Access Denied: Guests cannot access Spaces directly",
          code: "GUEST_SPACE_ACCESS_DENIED",
        });
      }

      // 2. Resolve Space ID from route params or body
      const rawSpaceId = req.params.spaceId || req.params.id || req.body?.spaceId;
      if (!rawSpaceId) {
        return res.status(400).json({ error: "Space ID is required" });
      }

      const spaceId = Number(rawSpaceId);
      if (!Number.isSafeInteger(spaceId) || spaceId <= 0) {
        return res.status(400).json({ error: "Invalid space ID: must be a positive integer" });
      }

      // 3. Query space strictly scoped to active tenant (Conceal foreign/deleted with 404)
      const space = await prisma.space.findFirst({
        where: {
          id: spaceId,
          organizationId: req.organizationId,
        },
        include: {
          members: {
            include: {
              membership: {
                include: {
                  user: {
                    select: { id: true, name: true, email: true, username: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!space) {
        return res.status(404).json({ error: "Space not found" });
      }

      // 4. Super Admin / Owner Spatial Bypass (F-04)
      if (isSpaceAdminOrOwner(req)) {
        req.space = space;
        req.spaceAccessLevel = "FULL";
        return next();
      }

      // 5. Look up explicit SpaceMember record
      const spaceMember = space.members?.find((m) => m.membershipId === req.membership?.id);

      // 6. Public vs. Private Space Evaluation
      if (!space.isPrivate) {
        // Public Space: baseline effective tier is EDIT (or higher if user is in SpaceMember)
        let effectiveLevel = "EDIT";
        if (spaceMember?.accessLevel) {
          const assignedRank = SPACE_TIER_RANK[spaceMember.accessLevel] ?? 1;
          if (assignedRank > SPACE_TIER_RANK.EDIT) {
            effectiveLevel = spaceMember.accessLevel;
          }
        }

        const effectiveRank = SPACE_TIER_RANK[effectiveLevel] ?? 1;
        if (effectiveRank < requiredRank) {
          return res.status(403).json({
            error: `Insufficient space access tier: requires ${normalizedRequired}, current tier is ${effectiveLevel}`,
            requiredLevel: normalizedRequired,
            currentLevel: effectiveLevel,
          });
        }

        req.space = space;
        req.spaceAccessLevel = effectiveLevel;
        req.spaceMember = spaceMember;
        return next();
      }

      // Private Space: explicit SpaceMember record required
      if (!spaceMember) {
        // CRITICAL RESOURCE HIDING: Return 404 Not Found, NEVER 403
        return res.status(404).json({ error: "Space not found" });
      }

      const userRank = SPACE_TIER_RANK[spaceMember.accessLevel] ?? 1;
      if (userRank < requiredRank) {
        return res.status(403).json({
          error: `Insufficient space access tier: requires ${normalizedRequired}, current tier is ${spaceMember.accessLevel}`,
          code: "OBJECT_TIER_BARRIER",
          requiredLevel: normalizedRequired,
          currentLevel: spaceMember.accessLevel,
        });
      }

      req.space = space;
      req.spaceAccessLevel = spaceMember.accessLevel;
      req.spaceMember = spaceMember;
      return next();
    } catch (error) {
      next(error);
    }
  };
}
