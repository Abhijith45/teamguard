import { prisma } from "../../config/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { hashPassword } from "../utils/password.js";
import {
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from "../lib/tokens.js";
import bcrypt from "bcryptjs";

export async function getPublicUser(userId, requestedOrgId = null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      avatarUrl: true,
      isActive: true,
      isPlatformAdmin: true,
      memberships: {
        where: { status: "ACTIVE" },
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
      },
    },
  });

  if (!user) return null;

  const organizations = user.memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    department: m.department,
    roles: m.roles.map((r) => ({
      id: r.role.id,
      name: r.role.name,
      slug: r.role.slug,
    })),
  }));

  // Resolve active membership
  let activeMembership = null;
  if (requestedOrgId) {
    activeMembership = user.memberships.find((m) => m.organizationId === Number(requestedOrgId));
  }
  if (!activeMembership && user.memberships.length > 0) {
    activeMembership = user.memberships[0];
  }

  const activeRoles = activeMembership
    ? activeMembership.roles.map((r) => ({
        id: r.role.id,
        name: r.role.name,
        slug: r.role.slug,
      }))
    : [];

  const effectivePermissions = [];
  if (activeMembership) {
    for (const mr of activeMembership.roles) {
      for (const rp of mr.role.permissions) {
        effectivePermissions.push({
          resource: rp.permission.resource,
          action: rp.permission.action,
        });
      }
    }
  }

  const uniquePermissions = [
    ...new Map(
      effectivePermissions.map((p) => [`${p.resource}:${p.action}`, p])
    ).values(),
  ];

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    organizations,
    activeOrganization: activeMembership
      ? {
          id: activeMembership.organization.id,
          name: activeMembership.organization.name,
          slug: activeMembership.organization.slug,
        }
      : null,
    roles: activeRoles,
    permissions: uniquePermissions,
    isPlatformAdmin: Boolean(user.isPlatformAdmin),
  };
}

async function createSession(userId, metadata = {}, activeOrgId = null, rememberMe = true) {
  const refresh = createRefreshToken();
  const familyId = refresh.sessionId;
  await prisma.refreshSession.create({
    data: {
      id: refresh.sessionId,
      familyId,
      userId,
      tokenHash: refresh.tokenHash,
      expiresAt: refreshTokenExpiry(new Date(), rememberMe),
      userAgent: metadata?.userAgent ?? null,
      ipAddress: metadata?.ipAddress ?? null,
    },
  });

  return {
    user: await getPublicUser(userId, activeOrgId),
    accessToken: signAccessToken(userId),
    refreshToken: refresh.token,
    sessionId: refresh.sessionId,
    familyId,
    rememberMe,
  };
}

export async function registerUser(input, metadata) {
  const passwordHash = await hashPassword(input.password);
  const normalizedUsername = input.username.trim().toLowerCase();
  const normalizedEmail = input.email.trim().toLowerCase();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
    },
  });
  if (existing) {
    if (existing.email === normalizedEmail) {
      throw new HttpError(409, "An account with this email already exists");
    }
    throw new HttpError(409, "An account with this username already exists");
  }

  const user = await prisma.$transaction(async (tx) => {
    // 1. Create user
    const newUser = await tx.user.create({
      data: {
        name: input.name,
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
      },
    });

    // 2. Create organization
    const orgSlug = `${normalizedUsername}-workspace-${Date.now().toString().slice(-4)}`;
    const organization = await tx.organization.create({
      data: {
        name: `${input.name}'s Workspace`,
        slug: orgSlug,
      },
    });

    // 3. Create Super Admin role for this organization
    const superAdminRole = await tx.role.create({
      data: {
        organizationId: organization.id,
        name: "Super Admin",
        slug: "super-admin",
        description: "Full administrative access",
        isSystem: true,
      },
    });

    // Assign all existing permissions to Super Admin role
    const allPermissions = await tx.permission.findMany();
    for (const perm of allPermissions) {
      await tx.rolePermission.create({
        data: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      });
    }

    // 4. Create membership
    const membership = await tx.membership.create({
      data: {
        userId: newUser.id,
        organizationId: organization.id,
        department: "Executive",
      },
    });

    // 5. Connect membership to Super Admin role
    await tx.membershipRole.create({
      data: {
        membershipId: membership.id,
        roleId: superAdminRole.id,
      },
    });

    return newUser;
  });

  return createSession(user.id, metadata, null, input.rememberMe ?? true);
}

export async function loginUser(identifier, password, metadata, activeOrgId = null, rememberMe = true) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
    },
  });

  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !user.isActive || !passwordMatches) {
    throw new HttpError(401, "Invalid username/email or password");
  }

  return createSession(user.id, metadata, activeOrgId, rememberMe);
}

export async function rotateRefreshToken(token, metadata = {}, activeOrgId = null) {
  if (!token) throw new HttpError(401, "Refresh session is required");

  const current = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });
  if (!current) throw new HttpError(401, "Refresh session is invalid");

  const now = new Date();
  const familyId = current.familyId || current.id;

  // Determine if this session family is persistent ("rememberMe") or transient
  const sessionDurationMs = current.expiresAt.getTime() - current.createdAt.getTime();
  const isRemembered = sessionDurationMs > (2 * 24 * 60 * 60 * 1000);

  // 1. Replay / Reuse Detection:
  // If an already-rotated or already-revoked token is re-presented,
  // invalidate the entire session family immediately to prevent replay attacks.
  if (current.revokedAt || current.rotatedAt) {
    await prisma.refreshSession.updateMany({
      where: {
        OR: [{ familyId }, { id: current.id }],
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    throw new HttpError(401, "Refresh token reuse detected; session family invalidated");
  }

  // 2. Expiration check
  if (current.expiresAt <= now) {
    await prisma.refreshSession.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: now },
    });
    throw new HttpError(401, "Refresh session has expired");
  }

  // 3. Atomic Token Rotation within the Family
  const next = createRefreshToken();
  await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshSession.updateMany({
      where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
      data: {
        revokedAt: now,
        rotatedAt: now,
        replacedBySessionId: next.sessionId,
      },
    });
    if (revoked.count !== 1) {
      throw new HttpError(401, "Refresh session was already used");
    }

    await tx.refreshSession.create({
      data: {
        id: next.sessionId,
        familyId,
        userId: current.userId,
        tokenHash: next.tokenHash,
        expiresAt: refreshTokenExpiry(now, isRemembered),
        userAgent: metadata?.userAgent ?? current.userAgent,
        ipAddress: metadata?.ipAddress ?? current.ipAddress,
      },
    });
  });

  return {
    user: await getPublicUser(current.userId, activeOrgId),
    accessToken: signAccessToken(current.userId),
    refreshToken: next.token,
    sessionId: next.sessionId,
    familyId,
    rememberMe: isRemembered,
  };
}

export async function revokeRefreshToken(token) {
  if (!token) return;
  const hash = hashRefreshToken(token);
  const current = await prisma.refreshSession.findUnique({
    where: { tokenHash: hash },
  });
  if (!current) return;

  const now = new Date();
  const familyId = current.familyId || current.id;

  await prisma.refreshSession.updateMany({
    where: {
      OR: [{ familyId }, { id: current.id }],
      revokedAt: null,
    },
    data: { revokedAt: now },
  });
}

export async function revokeAllUserSessions(userId, exceptToken = null) {
  const now = new Date();
  let exceptId = null;
  if (exceptToken) {
    const current = await prisma.refreshSession.findUnique({
      where: { tokenHash: hashRefreshToken(exceptToken) },
    });
    if (current) exceptId = current.id;
  }

  const where = {
    userId: Number(userId),
    revokedAt: null,
  };
  if (exceptId) {
    where.id = { not: exceptId };
  }

  return prisma.refreshSession.updateMany({
    where,
    data: { revokedAt: now },
  });
}

export async function cleanupExpiredSessions({ olderThanDays = 30 } = {}) {
  const now = new Date();
  const revokedCutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);

  const result = await prisma.refreshSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { revokedAt: { not: null, lt: revokedCutoff } },
      ],
    },
  });

  return {
    deletedCount: result.count,
    timestamp: now.toISOString(),
  };
}

export async function updateUserProfile(userId, { name, email, avatarUrl, username }, activeOrgId = null) {
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) throw new HttpError(404, "User not found");

  const updateData = {};

  if (name !== undefined) {
    updateData.name = name.trim();
  }

  if (email !== undefined) {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing && existing.id !== user.id) {
        throw new HttpError(409, "Email is already in use by another account");
      }
      updateData.email = normalizedEmail;
    }
  }

  if (username !== undefined) {
    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername !== user.username) {
      const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
      if (existing && existing.id !== user.id) {
        throw new HttpError(409, "Username is already in use by another account");
      }
      updateData.username = normalizedUsername;
    }
  }

  if (avatarUrl !== undefined) {
    updateData.avatarUrl = avatarUrl ? avatarUrl.trim() : null;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });
  }

  return getPublicUser(user.id, activeOrgId);
}

export async function changeUserPassword(userId, { currentPassword, newPassword, revokeOtherSessions = true }, currentRefreshToken = null) {
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) throw new HttpError(404, "User not found");

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    throw new HttpError(401, "Current password is incorrect");
  }

  if (currentPassword === newPassword) {
    throw new HttpError(400, "New password cannot be the same as current password");
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  if (revokeOtherSessions) {
    await revokeAllUserSessions(user.id, currentRefreshToken);
  }

  return { success: true, message: "Password updated successfully" };
}

export async function getCurrentUser(userId, activeOrgId = null) {
  return getPublicUser(userId, activeOrgId);
}
