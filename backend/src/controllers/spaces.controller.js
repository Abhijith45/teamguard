import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";
import { isSpaceAdminOrOwner } from "../middleware/space.middleware.js";

const createSpaceSchema = z.object({
  name: z.string().trim().min(2, "Space name must be at least 2 characters").max(100),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-_]+$/i, "Slug must contain only alphanumeric characters, dashes, and underscores"),
  description: z.string().trim().max(500).optional().nullable(),
  icon: z.string().trim().optional().default("Folder"),
  color: z.string().trim().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Color must be a valid hex code").optional().default("#6366f1"),
  isPrivate: z.boolean().optional().default(false),
});

const updateSpaceSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  icon: z.string().trim().optional(),
  color: z.string().trim().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i).optional(),
  isPrivate: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

const spaceMemberSchema = z.object({
  membershipId: z.number().int().positive("membershipId must be a positive integer"),
  accessLevel: z.enum(["FULL", "EDIT", "COMMENT", "VIEW"]).default("VIEW"),
});

/**
 * List all spaces accessible to the user (F-01, F-02, F-04, F-09)
 */
export async function listSpaces(req, res, next) {
  try {
    // Guest user returns empty array (F-09)
    if (req.membership?.accountType === "GUEST" || req.user?.accountType === "GUEST") {
      return res.status(200).json([]);
    }

    const orgId = req.organizationId;
    const isAdmin = isSpaceAdminOrOwner(req);

    const where = {
      organizationId: orgId,
      isArchived: false,
    };

    if (!isAdmin) {
      where.OR = [
        { isPrivate: false },
        {
          isPrivate: true,
          members: {
            some: {
              membershipId: req.membership.id,
            },
          },
        },
      ];
    }

    const spaces = await prisma.space.findMany({
      where,
      include: {
        members: {
          select: {
            id: true,
            membershipId: true,
            accessLevel: true,
          },
        },
        _count: {
          select: {
            projects: true,
            members: true,
          },
        },
      },
      orderBy: [{ isPrivate: "asc" }, { name: "asc" }],
    });

    const formatted = spaces.map((s) => {
      let computedLevel = "EDIT";
      if (isAdmin) {
        computedLevel = "FULL";
      } else {
        const mem = s.members.find((m) => m.membershipId === req.membership.id);
        if (mem) {
          computedLevel = mem.accessLevel;
        } else if (!s.isPrivate) {
          computedLevel = "EDIT";
        }
      }

      return {
        ...s,
        accessLevel: computedLevel,
      };
    });

    return res.status(200).json(formatted);
  } catch (error) {
    next(error);
  }
}

/**
 * Get space by ID (F-01, F-02, F-03)
 */
export async function getSpace(req, res, next) {
  try {
    return res.status(200).json({
      space: req.space,
      accessLevel: req.spaceAccessLevel,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new space (F-01, F-02)
 */
export async function createSpace(req, res, next) {
  try {
    if (req.membership?.accountType === "GUEST" || req.user?.accountType === "GUEST") {
      return res.status(403).json({
        error: "Access Denied: Guests cannot access Spaces directly",
        code: "GUEST_SPACE_ACCESS_DENIED",
      });
    }

    const input = createSpaceSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const existingSlug = await prisma.space.findUnique({
      where: {
        organizationId_slug: {
          organizationId: orgId,
          slug: input.slug,
        },
      },
    });

    if (existingSlug) {
      return res.status(409).json({ error: "A space with this slug already exists in this organization" });
    }

    const space = await prisma.$transaction(async (tx) => {
      const created = await tx.space.create({
        data: {
          organizationId: orgId,
          creatorId: req.membership.id,
          name: input.name,
          slug: input.slug,
          description: input.description,
          icon: input.icon,
          color: input.color,
          isPrivate: input.isPrivate,
        },
      });

      if (input.isPrivate) {
        await tx.spaceMember.create({
          data: {
            spaceId: created.id,
            membershipId: req.membership.id,
            accessLevel: "FULL",
          },
        });
      }

      return created;
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "space:create",
      resourceType: "Space",
      resourceId: String(space.id),
      details: {
        name: space.name,
        slug: space.slug,
        isPrivate: space.isPrivate,
      },
    });

    return res.status(201).json({ space });
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    next(error);
  }
}

/**
 * Update space details (F-01, F-03)
 */
export async function updateSpace(req, res, next) {
  try {
    const input = updateSpaceSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const updated = await prisma.space.update({
      where: { id: req.space.id },
      data: input,
      include: {
        members: {
          include: {
            membership: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "space:update",
      resourceType: "Space",
      resourceId: String(updated.id),
      details: input,
    });

    return res.status(200).json({ space: updated });
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    next(error);
  }
}

/**
 * Delete a space (F-04, F-07, F-16)
 */
export async function deleteSpace(req, res, next) {
  try {
    const orgId = req.organizationId;
    const actorId = req.auth.userId;
    const spaceId = req.space.id;

    await prisma.space.delete({
      where: { id: spaceId },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "space:delete",
      resourceType: "Space",
      resourceId: String(spaceId),
      details: { name: req.space.name },
    });

    return res.status(200).json({ message: "Space deleted successfully", spaceId });
  } catch (error) {
    next(error);
  }
}

/**
 * Add or update a space member (F-03)
 */
export async function addOrUpdateSpaceMember(req, res, next) {
  try {
    const { membershipId, accessLevel } = spaceMemberSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const targetMembership = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId: orgId,
        status: "ACTIVE",
      },
    });

    if (!targetMembership) {
      return res.status(404).json({ error: "Member not found in current organization" });
    }

    if (targetMembership.accountType === "GUEST") {
      return res.status(400).json({ error: "Guests cannot be added as space members directly" });
    }

    const member = await prisma.spaceMember.upsert({
      where: {
        spaceId_membershipId: {
          spaceId: req.space.id,
          membershipId,
        },
      },
      update: {
        accessLevel,
      },
      create: {
        spaceId: req.space.id,
        membershipId,
        accessLevel,
      },
      include: {
        membership: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true } },
          },
        },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "space:member:upsert",
      resourceType: "SpaceMember",
      resourceId: String(member.id),
      details: {
        spaceId: req.space.id,
        targetMembershipId: membershipId,
        accessLevel,
      },
    });

    return res.status(200).json({ member, spaceMember: member });
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    next(error);
  }
}

/**
 * Remove a space member (F-03)
 */
export async function removeSpaceMember(req, res, next) {
  try {
    const membershipId = Number(req.params.membershipId);
    if (!Number.isSafeInteger(membershipId) || membershipId <= 0) {
      return res.status(400).json({ error: "Invalid membership ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const existing = await prisma.spaceMember.findUnique({
      where: {
        spaceId_membershipId: {
          spaceId: req.space.id,
          membershipId,
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Space member not found" });
    }

    await prisma.spaceMember.delete({
      where: { id: existing.id },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "space:member:remove",
      resourceType: "SpaceMember",
      resourceId: String(existing.id),
      details: {
        spaceId: req.space.id,
        removedMembershipId: membershipId,
      },
    });

    return res.status(200).json({ message: "Space member removed successfully", removedMembershipId: membershipId });
  } catch (error) {
    next(error);
  }
}
