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
  };
}

async function createSession(userId, metadata, activeOrgId = null) {
  const refresh = createRefreshToken();
  await prisma.refreshSession.create({
    data: {
      id: refresh.sessionId,
      userId,
      tokenHash: refresh.tokenHash,
      expiresAt: refreshTokenExpiry(),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    },
  });

  return {
    user: await getPublicUser(userId, activeOrgId),
    accessToken: signAccessToken(userId),
    refreshToken: refresh.token,
  };
}

export async function registerUser(input, metadata) {
  const passwordHash = await hashPassword(input.password);
  const normalizedUsername = input.username.trim().toLowerCase();
  const normalizedEmail = input.email.trim().toLowerCase();

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

  return createSession(user.id, metadata);
}

export async function loginUser(identifier, password, metadata, activeOrgId = null) {
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

  return createSession(user.id, metadata, activeOrgId);
}

export async function rotateRefreshToken(token, metadata, activeOrgId = null) {
  if (!token) throw new HttpError(401, "Refresh session is required");

  const current = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });
  if (!current) throw new HttpError(401, "Refresh session is invalid");

  const now = new Date();
  if (current.revokedAt) {
    await prisma.refreshSession.updateMany({
      where: { userId: current.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    throw new HttpError(401, "Refresh token reuse detected; sign in again");
  }
  if (current.expiresAt <= now) {
    await prisma.refreshSession.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: now },
    });
    throw new HttpError(401, "Refresh session has expired");
  }

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
        userId: current.userId,
        tokenHash: next.tokenHash,
        expiresAt: refreshTokenExpiry(now),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    });
  });

  return {
    user: await getPublicUser(current.userId, activeOrgId),
    accessToken: signAccessToken(current.userId),
    refreshToken: next.token,
  };
}

export async function revokeRefreshToken(token) {
  if (!token) return;
  await prisma.refreshSession.updateMany({
    where: { tokenHash: hashRefreshToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId, activeOrgId = null) {
  return getPublicUser(userId, activeOrgId);
}
