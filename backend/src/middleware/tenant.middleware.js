import { prisma } from "../../config/prisma.js";
import { cache } from "../lib/cache.js";

/**
 * Tenant isolation middleware with In-Memory Caching (TASK-CACHE).
 * Resolves active organization from 'x-organization-id' header,
 * checks membership and effective permissions against cache or database,
 * and attaches req.organizationId, req.membership, and req.userPermissions (Set).
 */
export async function resolveTenant(req, res, next) {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const headerOrgId = req.get("x-organization-id");
    if (!headerOrgId || typeof headerOrgId !== "string" || !headerOrgId.trim()) {
      return res.status(400).json({ error: "x-organization-id header is required" });
    }

    const trimmed = headerOrgId.trim();
    if (!/^[1-9]\d*$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed))) {
      return res.status(400).json({ error: "Invalid x-organization-id header: must be a positive integer" });
    }

    const targetOrgId = Number(trimmed);
    const cacheKey = `membership:${targetOrgId}:${userId}`;

    // 1. Try cache lookup
    const cached = cache.get(cacheKey);
    if (cached) {
      req.organizationId = targetOrgId;
      req.organization = cached.organization;
      req.membership = cached.membership;
      req.userPermissions = new Set(cached.permissions);
      return next();
    }

    // 2. Database query on cache miss
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: targetOrgId,
        },
      },
      include: {
        organization: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!membership || membership.status !== "ACTIVE") {
      return res.status(403).json({ error: "Access denied: you are not an active member of this organization" });
    }

    if (membership.organization.isSuspended) {
      return res.status(403).json({ error: "Organization account is suspended. Contact platform administrator." });
    }

    // Extract all effective permissions from membership roles
    const permissionsSet = new Set();
    for (const mr of membership.roles) {
      if (!mr.role || !Array.isArray(mr.role.permissions)) continue;
      for (const rp of mr.role.permissions) {
        if (!rp.permission) continue;
        permissionsSet.add(`${rp.permission.resource}:${rp.permission.action}`);
      }
    }

    // Store in cache with multi-tenant and user tags (TTL 60s)
    cache.set(
      cacheKey,
      {
        membership,
        organization: membership.organization,
        permissions: Array.from(permissionsSet),
      },
      {
        ttlMs: 60 * 1000,
        tags: [`tenant:${targetOrgId}`, `user:${userId}`],
      }
    );

    req.organizationId = targetOrgId;
    req.organization = membership.organization;
    req.membership = membership;
    req.userPermissions = permissionsSet;

    next();
  } catch (error) {
    next(error);
  }
}
