import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";

const createAccessRequestSchema = z.object({
  resourceType: z.enum(["SPACE", "PROJECT"]),
  resourceId: z.number().int().positive("resourceId must be a positive integer"),
  requestedLevel: z.enum(["VIEW", "COMMENT", "EDIT", "FULL"]).default("VIEW"),
  justification: z.string().trim().min(1, "Justification is required").max(1000),
});

const reviewAccessRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().trim().max(1000).optional().nullable(),
});

/**
 * Checks whether the caller holds administrative/managerial review privileges.
 */
function canReviewRequests(req) {
  if (req.auth?.isPlatformAdmin) return true;
  if (
    req.userPermissions?.has("access_request:review") ||
    req.userPermissions?.has("roles:manage") ||
    req.userPermissions?.has("members:manage")
  ) {
    return true;
  }
  if (req.membership?.roles) {
    return req.membership.roles.some((r) => {
      const slug = (r.role?.slug || "").toLowerCase();
      const name = (r.role?.name || "").toLowerCase();
      return (
        slug === "super-admin" ||
        slug === "admin" ||
        slug === "owner" ||
        slug === "project-manager" ||
        slug === "manager" ||
        name === "super admin" ||
        name === "admin" ||
        name === "owner" ||
        name === "project manager" ||
        name === "manager"
      );
    });
  }
  return false;
}

/**
 * Submit a self-service access request (F-14)
 */
export async function createAccessRequest(req, res, next) {
  try {
    const input = createAccessRequestSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    // Verify target resource exists in the current organization (Resource Hiding / Cross-tenant protection)
    if (input.resourceType === "SPACE") {
      const space = await prisma.space.findFirst({
        where: { id: input.resourceId, organizationId: orgId },
      });
      if (!space) {
        return res.status(404).json({ error: "Target resource not found in current organization" });
      }
    } else if (input.resourceType === "PROJECT") {
      const project = await prisma.project.findFirst({
        where: { id: input.resourceId, organizationId: orgId, deletedAt: null },
      });
      if (!project) {
        return res.status(404).json({ error: "Target resource not found in current organization" });
      }
    }

    const accessRequest = await prisma.accessRequest.create({
      data: {
        organizationId: orgId,
        requesterMembershipId: req.membership.id,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        requestedLevel: input.requestedLevel,
        justification: input.justification,
        status: "PENDING",
      },
      include: {
        requester: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true, avatarUrl: true } },
          },
        },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "access_request:create",
      resourceType: "AccessRequest",
      resourceId: String(accessRequest.id),
      details: {
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        requestedLevel: input.requestedLevel,
      },
    });

    return res.status(201).json({ accessRequest });
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    next(error);
  }
}

/**
 * List access requests (F-15)
 */
export async function listAccessRequests(req, res, next) {
  try {
    const orgId = req.organizationId;
    const canReview = canReviewRequests(req);

    const where = {
      organizationId: orgId,
    };

    if (!canReview) {
      where.requesterMembershipId = req.membership.id;
    }

    if (req.query.status) {
      where.status = String(req.query.status).toUpperCase();
    }
    if (req.query.resourceType) {
      where.resourceType = String(req.query.resourceType).toUpperCase();
    }
    if (req.query.resourceId) {
      where.resourceId = Number(req.query.resourceId);
    }

    const accessRequests = await prisma.accessRequest.findMany({
      where,
      include: {
        requester: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true, avatarUrl: true } },
          },
        },
        reviewer: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      accessRequests,
      total: accessRequests.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get access request details
 */
export async function getAccessRequest(req, res, next) {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: "Invalid access request ID: must be a positive integer" });
    }

    const orgId = req.organizationId;
    const accessRequest = await prisma.accessRequest.findFirst({
      where: { id: requestId, organizationId: orgId },
      include: {
        requester: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true, avatarUrl: true } },
          },
        },
        reviewer: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true } },
          },
        },
      },
    });

    if (!accessRequest) {
      return res.status(404).json({ error: "Access request not found" });
    }

    const canReview = canReviewRequests(req);
    if (!canReview && accessRequest.requesterMembershipId !== req.membership.id) {
      return res.status(403).json({ error: "Forbidden: You cannot view this access request" });
    }

    return res.status(200).json({ accessRequest });
  } catch (error) {
    next(error);
  }
}

/**
 * Review an access request (Approve / Reject) with automated SpaceMember provisioning (F-15)
 */
export async function reviewAccessRequest(req, res, next) {
  try {
    if (!canReviewRequests(req)) {
      return res.status(403).json({
        error: "Forbidden: You do not have permission to review access requests",
      });
    }

    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: "Invalid access request ID: must be a positive integer" });
    }

    const input = reviewAccessRequestSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const existingRequest = await prisma.accessRequest.findFirst({
      where: { id: requestId, organizationId: orgId },
      include: {
        requester: true,
      },
    });

    if (!existingRequest) {
      return res.status(404).json({ error: "Access request not found" });
    }

    // Critical Automation Invariant (F-15):
    // On approval, automatically upsert target SpaceMember join record
    if (input.status === "APPROVED" && existingRequest.resourceType === "SPACE") {
      await prisma.spaceMember.upsert({
        where: {
          spaceId_membershipId: {
            spaceId: existingRequest.resourceId,
            membershipId: existingRequest.requesterMembershipId,
          },
        },
        update: {
          accessLevel: existingRequest.requestedLevel,
        },
        create: {
          spaceId: existingRequest.resourceId,
          membershipId: existingRequest.requesterMembershipId,
          accessLevel: existingRequest.requestedLevel,
        },
      });
    }

    const updated = await prisma.accessRequest.update({
      where: { id: existingRequest.id },
      data: {
        status: input.status,
        reviewedByMembershipId: req.membership.id,
        rejectionReason: input.status === "REJECTED" ? (input.rejectionReason || null) : null,
      },
      include: {
        requester: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true } },
          },
        },
        reviewer: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true } },
          },
        },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: input.status === "APPROVED" ? "access_request:review:approved" : "access_request:review:rejected",
      resourceType: "AccessRequest",
      resourceId: String(updated.id),
      details: {
        resourceType: updated.resourceType,
        resourceId: updated.resourceId,
        status: updated.status,
        requestedLevel: updated.requestedLevel,
        rejectionReason: updated.rejectionReason,
      },
    });

    return res.status(200).json({ accessRequest: updated });
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    next(error);
  }
}
