import crypto from "crypto";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "./audit.service.js";
import { sendInvitationEmail } from "./email.service.js";
import { validateDelegationBarrier } from "../middleware/rbac.middleware.js";

/**
 * Creates and dispatches an organization member invitation (US-INV-001 / UD-005)
 */
export async function createInvitationService({
  organizationId,
  inviterId,
  email,
  roleId,
  department,
  callerPermissions,
  frontendUrl,
}) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Verify organization exists and is active
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!organization) {
    const error = new Error("Organization not found");
    error.status = 404;
    throw error;
  }

  // 2. Reject if the user with this email is already an active member of this organization
  const existingMembership = await prisma.membership.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
      user: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
    },
  });
  if (existingMembership) {
    const error = new Error("User is already a member of this organization");
    error.status = 400;
    throw error;
  }

  // 3. Verify target role exists in organization
  const targetRole = await prisma.role.findFirst({
    where: {
      id: roleId,
      OR: [{ organizationId }, { organizationId: null }],
    },
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  });
  if (!targetRole) {
    const error = new Error("Specified role does not exist in this organization");
    error.status = 404;
    throw error;
  }

  // 4. Delegation Barrier Guard: Caller cannot assign a role granting permissions they lack
  const targetRolePermissions = targetRole.permissions.map((rp) => rp.permission);
  const delegationCheck = validateDelegationBarrier(callerPermissions, targetRolePermissions);
  if (!delegationCheck.allowed) {
    const error = new Error(
      "Privilege Delegation Barrier: Cannot assign a role granting permissions you do not personally possess"
    );
    error.status = 403;
    error.code = "DELEGATION_BARRIER_BREACH";
    error.unauthorizedPermissions = delegationCheck.unauthorizedPermissions;
    throw error;
  }

  // 5. Invalidate any existing PENDING invitations for this email in this tenant
  await prisma.membershipInvitation.updateMany({
    where: {
      organizationId,
      email: normalizedEmail,
      status: "PENDING",
    },
    data: {
      status: "REVOKED",
    },
  });

  // 6. Cryptographic token generation & SHA-256 storage
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = await prisma.membershipInvitation.create({
    data: {
      organizationId,
      inviterId,
      roleId,
      email: normalizedEmail,
      department: department?.trim() || null,
      tokenHash,
      status: "PENDING",
      expiresAt,
    },
    include: {
      role: true,
      inviter: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // 7. Dispatch transactional invitation email via Resend
  const origin = frontendUrl || process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const inviteUrl = `${origin}/invite/accept?token=${rawToken}`;

  await sendInvitationEmail({
    to: normalizedEmail,
    organizationName: organization.name,
    inviterName: invitation.inviter.name,
    roleName: targetRole.name,
    department: invitation.department,
    inviteUrl,
  });

  // 8. Record immutable security audit log
  await logAuditEvent({
    organizationId,
    actorId: inviterId,
    action: "INVITATION_CREATE",
    resourceType: "invitation",
    resourceId: invitation.id,
    details: {
      email: normalizedEmail,
      roleId,
      roleName: targetRole.name,
      department: invitation.department,
      expiresAt: expiresAt.toISOString(),
    },
  });

  const { tokenHash: _th, ...safeInvitation } = invitation;

  return {
    invitation: safeInvitation,
    token: rawToken,
    inviteUrl,
  };
}

/**
 * Lists invitations for an organization with automatic expiry synchronization (US-INV-003)
 */
export async function listInvitationsService({ organizationId, status }) {
  // Sync expired invitations
  await prisma.membershipInvitation.updateMany({
    where: {
      organizationId,
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
    data: {
      status: "EXPIRED",
    },
  });

  const where = { organizationId };
  if (status) {
    where.status = status;
  }

  const invitations = await prisma.membershipInvitation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      role: { select: { id: true, name: true, slug: true } },
      inviter: { select: { id: true, name: true, email: true } },
      acceptedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return invitations.map(({ tokenHash: _th, ...rest }) => rest);
}

/**
 * Accepts an invitation and provisions tenant membership atomically (US-INV-002)
 */
export async function acceptInvitationService({ rawToken, userId, userEmail }) {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.trim()) {
    const error = new Error("Invitation is no longer valid");
    error.status = 400;
    throw error;
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");

  // 1. Locate invitation by cryptographic token hash
  const invitation = await prisma.membershipInvitation.findUnique({
    where: { tokenHash },
    include: {
      organization: true,
      role: true,
    },
  });

  if (!invitation) {
    const error = new Error("Invitation is no longer valid");
    error.status = 400;
    throw error;
  }

  // 2. State invariant checks
  if (invitation.status === "REVOKED" || invitation.status === "ACCEPTED") {
    const error = new Error("Invitation is no longer valid");
    error.status = 400;
    throw error;
  }

  if (new Date(invitation.expiresAt) < new Date() || invitation.status === "EXPIRED") {
    if (invitation.status !== "EXPIRED") {
      await prisma.membershipInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
    }
    const error = new Error("Invitation has expired");
    error.status = 400;
    throw error;
  }

  // 3. Identity Matching Invariant: Authenticated user email must match invitation email
  const normalizedUserEmail = userEmail?.trim().toLowerCase();
  const normalizedInviteEmail = invitation.email.trim().toLowerCase();

  if (normalizedUserEmail !== normalizedInviteEmail) {
    const error = new Error("This invitation was sent to a different email address");
    error.status = 403;
    throw error;
  }

  // 4. Verify user is not already an active member of this organization
  const existingMembership = await prisma.membership.findFirst({
    where: {
      organizationId: invitation.organizationId,
      userId,
      status: "ACTIVE",
    },
  });
  if (existingMembership) {
    const error = new Error("User is already a member of this organization");
    error.status = 400;
    throw error;
  }

  // 5. Execute atomic membership creation & invitation fulfillment
  const membership = await prisma.$transaction(async (tx) => {
    // Optimistic concurrency guard: ensure status is still PENDING
    const updateResult = await tx.membershipInvitation.updateMany({
      where: {
        id: invitation.id,
        status: "PENDING",
      },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedById: userId,
      },
    });

    if (updateResult.count === 0) {
      const error = new Error("Invitation is no longer valid");
      error.status = 409;
      throw error;
    }

    // Create or re-activate organization membership
    const member = await tx.membership.upsert({
      where: {
        userId_organizationId: {
          userId,
          organizationId: invitation.organizationId,
        },
      },
      create: {
        userId,
        organizationId: invitation.organizationId,
        department: invitation.department,
        status: "ACTIVE",
      },
      update: {
        department: invitation.department,
        status: "ACTIVE",
      },
    });

    // Assign the designated role to the membership
    await tx.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: member.id,
          roleId: invitation.roleId,
        },
      },
      create: {
        membershipId: member.id,
        roleId: invitation.roleId,
      },
      update: {},
    });

    return member;
  });

  // 6. Record immutable security audit log
  await logAuditEvent({
    organizationId: invitation.organizationId,
    actorId: userId,
    action: "INVITATION_ACCEPT",
    resourceType: "invitation",
    resourceId: invitation.id,
    details: {
      email: normalizedUserEmail,
      roleId: invitation.roleId,
      roleName: invitation.role.name,
      department: invitation.department,
    },
  });

  return {
    success: true,
    message: "Invitation accepted successfully",
    organization: invitation.organization,
    membership,
  };
}

/**
 * Revokes a pending invitation (US-INV-003)
 */
export async function revokeInvitationService({ organizationId, invitationId, actorId }) {
  const invitation = await prisma.membershipInvitation.findUnique({
    where: { id: invitationId },
    include: { role: true },
  });

  if (!invitation || invitation.organizationId !== organizationId) {
    const error = new Error("Invitation not found");
    error.status = 404;
    throw error;
  }

  if (invitation.status !== "PENDING") {
    const error = new Error("Only pending invitations can be revoked");
    error.status = 400;
    throw error;
  }

  await prisma.membershipInvitation.update({
    where: { id: invitationId },
    data: { status: "REVOKED" },
  });

  await logAuditEvent({
    organizationId,
    actorId,
    action: "INVITATION_REVOKE",
    resourceType: "invitation",
    resourceId: invitation.id,
    details: {
      email: invitation.email,
      roleId: invitation.roleId,
      roleName: invitation.role.name,
    },
  });

  return { success: true, message: "Invitation revoked" };
}

/**
 * Resends an invitation with a refreshed single-use token and 7-day expiration (US-INV-003)
 */
export async function resendInvitationService({
  organizationId,
  invitationId,
  actorId,
  callerPermissions,
  frontendUrl,
}) {
  const invitation = await prisma.membershipInvitation.findUnique({
    where: { id: invitationId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
      organization: true,
      inviter: { select: { id: true, name: true, email: true } },
    },
  });

  if (!invitation || invitation.organizationId !== organizationId) {
    const error = new Error("Invitation not found");
    error.status = 404;
    throw error;
  }

  if (invitation.status === "ACCEPTED") {
    const error = new Error("Cannot resend an already accepted invitation");
    error.status = 400;
    throw error;
  }

  // Delegation barrier guard
  const targetRolePermissions = invitation.role.permissions.map((rp) => rp.permission);
  const delegationCheck = validateDelegationBarrier(callerPermissions, targetRolePermissions);
  if (!delegationCheck.allowed) {
    const error = new Error(
      "Privilege Delegation Barrier: Cannot assign a role granting permissions you do not personally possess"
    );
    error.status = 403;
    error.code = "DELEGATION_BARRIER_BREACH";
    error.unauthorizedPermissions = delegationCheck.unauthorizedPermissions;
    throw error;
  }

  // Reject if user is already an active member
  const existingMembership = await prisma.membership.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
      user: {
        email: {
          equals: invitation.email,
          mode: "insensitive",
        },
      },
    },
  });
  if (existingMembership) {
    const error = new Error("User is already a member of this organization");
    error.status = 400;
    throw error;
  }

  // Generate fresh token and 7-day expiration
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const updated = await prisma.membershipInvitation.update({
    where: { id: invitationId },
    data: {
      tokenHash,
      status: "PENDING",
      expiresAt,
    },
    include: {
      role: true,
      inviter: { select: { id: true, name: true, email: true } },
    },
  });

  // Re-dispatch transactional email
  const origin = frontendUrl || process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const inviteUrl = `${origin}/invite/accept?token=${rawToken}`;

  await sendInvitationEmail({
    to: updated.email,
    organizationName: invitation.organization.name,
    inviterName: updated.inviter.name,
    roleName: updated.role.name,
    department: updated.department,
    inviteUrl,
  });

  // Record audit log
  await logAuditEvent({
    organizationId,
    actorId,
    action: "INVITATION_RESEND",
    resourceType: "invitation",
    resourceId: updated.id,
    details: {
      email: updated.email,
      roleId: updated.roleId,
      roleName: updated.role.name,
      expiresAt: expiresAt.toISOString(),
    },
  });

  const { tokenHash: _th, ...safeInvitation } = updated;

  return {
    success: true,
    invitation: safeInvitation,
    token: rawToken,
    inviteUrl,
  };
}

/**
 * Public/authenticated verification helper to inspect invitation metadata before acceptance
 */
export async function verifyInvitationService({ rawToken }) {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.trim()) {
    const error = new Error("Invalid invitation token");
    error.status = 400;
    throw error;
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");

  const invitation = await prisma.membershipInvitation.findUnique({
    where: { tokenHash },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      role: { select: { id: true, name: true, description: true } },
      inviter: { select: { id: true, name: true } },
    },
  });

  if (!invitation) {
    const error = new Error("Invitation not found or invalid");
    error.status = 404;
    throw error;
  }

  const isExpired = new Date(invitation.expiresAt) < new Date();

  return {
    id: invitation.id,
    organization: invitation.organization,
    role: invitation.role,
    inviter: invitation.inviter,
    email: invitation.email,
    department: invitation.department,
    status: isExpired && invitation.status === "PENDING" ? "EXPIRED" : invitation.status,
    expiresAt: invitation.expiresAt,
    isExpired,
  };
}
