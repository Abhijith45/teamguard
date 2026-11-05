import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import {
  createRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  refreshCookieName,
  refreshCookieOptions,
} from "../lib/tokens.js";
import { getPublicUser } from "../services/auth.service.js";

const switchSchema = z.object({
  persona: z.enum([
    "super-admin",
    "project-manager",
    "team-member",
    "stakeholder",
    "platform-operator",
    "guest-collaborator",
  ]),
  organizationSlug: z.string().optional().default("acme-corp"),
});

const personaEmailMap = {
  "super-admin": "admin@teamguard.io",
  "project-manager": "manager@teamguard.io",
  "team-member": "member@teamguard.io",
  "stakeholder": "viewer@teamguard.io",
  "platform-operator": "platform-operator@teamguard.internal",
  "guest-collaborator": "guest@teamguard.io",
};

export async function switchPersona(req, res, next) {
  try {
    const isDemoEnabled = process.env.DEMO_MODE_ENABLED !== "false";
    if (!isDemoEnabled) {
      return res.status(403).json({ error: "Demo mode is disabled in this environment" });
    }

    const allowedIps = (process.env.DEMO_ALLOWED_IPS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowedIps.length > 0) {
      const clientIp = req.ip || req.socket?.remoteAddress;
      if (!allowedIps.includes(clientIp)) {
        return res.status(403).json({ error: "Demo access is restricted" });
      }
    }

    const { persona, organizationSlug } = switchSchema.parse(req.body);
    let targetEmail = personaEmailMap[persona];
    if (organizationSlug === "nova-labs" && persona === "super-admin") {
      targetEmail = "elena@novalabs.io";
    }

    if (persona === "platform-operator") {
      await prisma.user.upsert({
        where: { email: targetEmail },
        update: { isPlatformAdmin: true, isActive: true },
        create: {
          name: "Platform Operator",
          username: "platform_operator",
          email: targetEmail,
          passwordHash: "demo-hash",
          isPlatformAdmin: true,
          isActive: true,
        },
      });
    }

    if (persona === "guest-collaborator") {
      const guestUser = await prisma.user.upsert({
        where: { email: targetEmail },
        update: { isActive: true },
        create: {
          name: "Guest Collaborator",
          username: "guest_collaborator",
          email: targetEmail,
          passwordHash: "demo-hash",
          isActive: true,
        },
      });

      const targetOrg = await prisma.organization.findUnique({
        where: { slug: organizationSlug },
      });

      if (targetOrg) {
        await prisma.membership.upsert({
          where: { userId_organizationId: { userId: guestUser.id, organizationId: targetOrg.id } },
          update: { status: "ACTIVE", accountType: "GUEST" },
          create: {
            userId: guestUser.id,
            organizationId: targetOrg.id,
            status: "ACTIVE",
            department: "External Contractor",
            accountType: "GUEST",
          },
        });
      }
    }

    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      return res.status(404).json({ error: `Demo user for persona '${persona}' not found` });
    }

    const org = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
    });

    if (!org) {
      return res.status(404).json({ error: `Organization '${organizationSlug}' not found` });
    }

    const refresh = createRefreshToken();
    await prisma.refreshSession.create({
      data: {
        id: refresh.sessionId,
        userId: user.id,
        tokenHash: refresh.tokenHash,
        expiresAt: refreshTokenExpiry(),
        userAgent: req.get("user-agent"),
        ipAddress: req.ip,
      },
    });

    res.cookie(refreshCookieName, refresh.token, refreshCookieOptions());

    const publicUser = await getPublicUser(user.id, org.id);
    const accessToken = signAccessToken(user.id);

    return res.json({
      user: publicUser,
      accessToken,
      persona,
      activeOrganization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    });
  } catch (error) {
    next(error);
  }
}
