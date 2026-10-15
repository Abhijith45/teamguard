import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";

const roleReassignSchema = z.object({
  roleId: z.number().int().positive().optional(),
  roleSlug: z.string().trim().optional(),
}).refine((data) => data.roleId !== undefined || data.roleSlug !== undefined, {
  message: "Either roleId or roleSlug must be provided",
});

const statusUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

const departmentUpdateSchema = z.object({
  department: z.string().trim().max(100).nullable().optional(),
});

function parseMembershipId(param) {
  const id = Number(param);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

/**
 * List all members of the active organization (US-TENANT-004).
 * Enforces tenant isolation. Admins see all statuses; regular members see ACTIVE.
 */
export async function listMembers(req, res, next) {
  try {
    const orgId = req.organizationId;
    const { search, department, role, status } = req.query;

    const hasManagePerm = req.userPermissions?.has("members:manage") || req.userPermissions?.has("roles:manage");

    // Regular members only see ACTIVE members per US-TENANT-004 AC 2
    let statusFilter = "ACTIVE";
    if (hasManagePerm && status) {
      if (status.toUpperCase() === "ALL") {
        statusFilter = undefined;
      } else if (["ACTIVE", "INACTIVE", "SUSPENDED"].includes(status.toUpperCase())) {
        statusFilter = status.toUpperCase();
      }
    }

    const where = {
      organizationId: orgId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(department && department !== "ALL" ? { department } : {}),
    };

    if (search && typeof search === "string" && search.trim().length > 0) {
      const q = search.trim();
      where.user = {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      };
    }

    if (role && role !== "ALL") {
      where.roles = {
        some: {
          role: {
            OR: [
              { slug: role.toLowerCase() },
              { name: { equals: role, mode: "insensitive" } },
            ],
          },
        },
      };
    }

    const [members, activeOwnersCount] = await Promise.all([
      prisma.membership.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              avatarUrl: true,
              isActive: true,
            },
          },
          roles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  description: true,
                  isSystem: true,
                },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
      }),
      // Count total active Super Admins in this organization to identify last owner
      prisma.membership.count({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          roles: {
            some: {
              role: {
                slug: "super-admin",
              },
            },
          },
        },
      }),
    ]);

    const formatted = members.map((m) => {
      const isSuperAdmin = m.roles.some((r) => r.role.slug === "super-admin");
      const isLastOwner = isSuperAdmin && activeOwnersCount === 1 && m.status === "ACTIVE";

      return {
        membershipId: m.id,
        userId: m.user.id,
        user: m.user,
        department: m.department || "General",
        status: m.status,
        joinedAt: m.joinedAt,
        roles: m.roles.map((r) => r.role),
        isLastOwner,
      };
    });

    return res.json({
      members: formatted,
      total: formatted.length,
      activeOwnersCount,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all available roles for role assignment in the active organization.
 */
export async function getAvailableRoles(req, res, next) {
  try {
    const orgId = req.organizationId;
    const roles = await prisma.role.findMany({
      where: {
        OR: [
          { organizationId: orgId },
          { organizationId: null }, // System global roles
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isSystem: true,
      },
      orderBy: { id: "asc" },
    });

    return res.json({ roles });
  } catch (error) {
    next(error);
  }
}

/**
 * Reassign a member's role (US-INV-004).
 * Enforces Last-Owner Protection (BR-010): Cannot demote the sole active Super Admin / Owner.
 */
export async function reassignMemberRole(req, res, next) {
  try {
    const membershipId = parseMembershipId(req.params.membershipId);
    if (!membershipId) {
      return res.status(400).json({ error: "Invalid membership ID: must be a positive integer" });
    }

    const { roleId, roleSlug } = roleReassignSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    // 1. Fetch target membership strictly scoped to active tenant (Conceal foreign with 404)
    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
      include: {
        roles: { include: { role: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: "Member not found in current organization" });
    }

    // 2. Resolve target role
    let targetRole;
    if (roleId) {
      targetRole = await prisma.role.findFirst({
        where: {
          id: roleId,
          OR: [{ organizationId: orgId }, { organizationId: null }],
        },
      });
    } else if (roleSlug) {
      targetRole = await prisma.role.findFirst({
        where: {
          slug: roleSlug.toLowerCase(),
          OR: [{ organizationId: orgId }, { organizationId: null }],
        },
      });
    }

    if (!targetRole) {
      return res.status(400).json({ error: "Specified role does not exist for this organization" });
    }

    // 3. Last-Owner Safeguard (BR-010 / US-INV-004 / US-INV-005)
    const currentlySuperAdmin = membership.roles.some((r) => r.role.slug === "super-admin");
    const isNewRoleSuperAdmin = targetRole.slug === "super-admin";

    if (currentlySuperAdmin && !isNewRoleSuperAdmin && membership.status === "ACTIVE") {
      const otherActiveOwners = await prisma.membership.count({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          id: { not: membershipId },
          roles: {
            some: {
              role: { slug: "super-admin" },
            },
          },
        },
      });

      if (otherActiveOwners === 0) {
        return res.status(403).json({
          error: "Cannot demote or remove the sole active organization owner",
          code: "LAST_OWNER_PROTECTION",
          detail: "An organization must maintain at least one active Super Admin / Owner at all times.",
        });
      }
    }

    // 4. Atomically update membership roles
    const oldRoleNames = membership.roles.map((r) => r.role.name).join(", ");
    await prisma.$transaction(async (tx) => {
      await tx.membershipRole.deleteMany({
        where: { membershipId },
      });
      await tx.membershipRole.create({
        data: {
          membershipId,
          roleId: targetRole.id,
        },
      });
    });

    // 5. Audit Logging
    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "member:role:reassign",
      resourceType: "Membership",
      resourceId: String(membershipId),
      details: {
        targetUserId: membership.user.id,
        targetEmail: membership.user.email,
        previousRoles: oldRoleNames,
        newRole: targetRole.name,
        newRoleId: targetRole.id,
      },
    });

    const updated = await prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
        roles: { include: { role: true } },
      },
    });

    return res.json({
      message: `Member role updated to ${targetRole.name}`,
      member: {
        membershipId: updated.id,
        userId: updated.user.id,
        user: updated.user,
        department: updated.department,
        status: updated.status,
        roles: updated.roles.map((r) => r.role),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update member department.
 */
export async function updateMemberDepartment(req, res, next) {
  try {
    const membershipId = parseMembershipId(req.params.membershipId);
    if (!membershipId) {
      return res.status(400).json({ error: "Invalid membership ID: must be a positive integer" });
    }

    const { department } = departmentUpdateSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!membership) {
      return res.status(404).json({ error: "Member not found in current organization" });
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: { department: department || null },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
        roles: { include: { role: true } },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "member:department:update",
      resourceType: "Membership",
      resourceId: String(membershipId),
      details: {
        targetUserId: membership.user.id,
        previousDepartment: membership.department,
        newDepartment: department,
      },
    });

    return res.json({
      message: "Department updated successfully",
      member: {
        membershipId: updated.id,
        userId: updated.user.id,
        user: updated.user,
        department: updated.department,
        status: updated.status,
        roles: updated.roles.map((r) => r.role),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update member status (ACTIVE, INACTIVE, SUSPENDED) (US-INV-005).
 * Enforces Last-Owner Safeguard (BR-010): Cannot deactivate sole active Super Admin.
 */
export async function updateMemberStatus(req, res, next) {
  try {
    const membershipId = parseMembershipId(req.params.membershipId);
    if (!membershipId) {
      return res.status(400).json({ error: "Invalid membership ID: must be a positive integer" });
    }

    const { status } = statusUpdateSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
      include: {
        roles: { include: { role: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: "Member not found in current organization" });
    }

    // Last-Owner Safeguard (BR-010) on deactivation/suspension
    if (status !== "ACTIVE" && membership.status === "ACTIVE") {
      const isSuperAdmin = membership.roles.some((r) => r.role.slug === "super-admin");
      if (isSuperAdmin) {
        const otherActiveOwners = await prisma.membership.count({
          where: {
            organizationId: orgId,
            status: "ACTIVE",
            id: { not: membershipId },
            roles: {
              some: {
                role: { slug: "super-admin" },
              },
            },
          },
        });

        if (otherActiveOwners === 0) {
          return res.status(403).json({
            error: "Cannot deactivate the sole active organization owner",
            code: "LAST_OWNER_PROTECTION",
            detail: "An organization must maintain at least one active Super Admin / Owner at all times.",
          });
        }
      }
    }

    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: { status },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
        roles: { include: { role: true } },
      },
    });

    // Invalidate refresh sessions for target user if suspended/deactivated
    if (status !== "ACTIVE") {
      await prisma.refreshSession.updateMany({
        where: { userId: membership.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "member:status:update",
      resourceType: "Membership",
      resourceId: String(membershipId),
      details: {
        targetUserId: membership.user.id,
        previousStatus: membership.status,
        newStatus: status,
      },
    });

    return res.json({
      message: `Member status updated to ${status}`,
      member: {
        membershipId: updated.id,
        userId: updated.user.id,
        user: updated.user,
        department: updated.department,
        status: updated.status,
        roles: updated.roles.map((r) => r.role),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove member from organization (US-INV-005).
 * Enforces Last-Owner Safeguard (BR-010): Cannot remove sole active Super Admin.
 */
export async function removeMember(req, res, next) {
  try {
    const membershipId = parseMembershipId(req.params.membershipId);
    if (!membershipId) {
      return res.status(400).json({ error: "Invalid membership ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
      include: {
        roles: { include: { role: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: "Member not found in current organization" });
    }

    // Last-Owner Safeguard (BR-010)
    const isSuperAdmin = membership.roles.some((r) => r.role.slug === "super-admin");
    if (isSuperAdmin && membership.status === "ACTIVE") {
      const otherActiveOwners = await prisma.membership.count({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          id: { not: membershipId },
          roles: {
            some: {
              role: { slug: "super-admin" },
            },
          },
        },
      });

      if (otherActiveOwners === 0) {
        return res.status(403).json({
          error: "Cannot remove the sole active organization owner",
          code: "LAST_OWNER_PROTECTION",
          detail: "An organization must maintain at least one active Super Admin / Owner at all times.",
        });
      }
    }

    // Atomically unassign tasks and delete membership
    await prisma.$transaction(async (tx) => {
      // Unassign tasks assigned to this member in this org
      await tx.task.updateMany({
        where: { organizationId: orgId, assigneeId: membership.user.id },
        data: { assigneeId: null },
      });

      // Delete membership
      await tx.membership.delete({
        where: { id: membershipId },
      });
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "member:remove",
      resourceType: "Membership",
      resourceId: String(membershipId),
      details: {
        targetUserId: membership.user.id,
        targetEmail: membership.user.email,
        roles: membership.roles.map((r) => r.role.name),
      },
    });

    return res.json({
      message: "Member removed from organization successfully",
      removedMembershipId: membershipId,
    });
  } catch (error) {
    next(error);
  }
}
