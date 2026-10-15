import { prisma } from "../../config/prisma.js";

/**
 * Tenant isolation middleware.
 * Resolves active organization from 'x-organization-id' header (or fallback to primary membership),
 * verifies that the authenticated user belongs to that organization with status ACTIVE,
 * and attaches req.organizationId and req.membership (with roles and permissions).
 */
export async function resolveTenant(req, res, next) {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const headerOrgId = req.get("x-organization-id");
    let targetOrgId = headerOrgId ? Number(headerOrgId) : null;

    // If no org specified in header, fallback to the user's first active membership
    if (!targetOrgId || !Number.isSafeInteger(targetOrgId)) {
      const firstMembership = await prisma.membership.findFirst({
        where: { userId, status: "ACTIVE" },
        orderBy: { joinedAt: "asc" },
        select: { organizationId: true },
      });

      if (!firstMembership) {
        return res.status(403).json({ error: "No active organization memberships found for this account" });
      }
      targetOrgId = firstMembership.organizationId;
    }

    // Verify membership in requested organization
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

    // Extract all effective permissions from membership roles
    const permissionsSet = new Set();
    for (const mr of membership.roles) {
      for (const rp of mr.role.permissions) {
        permissionsSet.add(`${rp.permission.resource}:${rp.permission.action}`);
      }
    }

    req.organizationId = targetOrgId;
    req.organization = membership.organization;
    req.membership = membership;
    req.userPermissions = permissionsSet;

    next();
  } catch (error) {
    next(error);
  }
}
