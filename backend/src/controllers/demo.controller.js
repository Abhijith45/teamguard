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
  persona: z.enum(["super-admin", "project-manager", "team-member", "stakeholder"]),
  organizationSlug: z.string().optional().default("acme-corp"),
});

const personaEmailMap = {
  "super-admin": "admin@teamguard.io",
  "project-manager": "manager@teamguard.io",
  "team-member": "member@teamguard.io",
  "stakeholder": "viewer@teamguard.io",
};

export async function switchPersona(req, res, next) {
  try {
    const { persona, organizationSlug } = switchSchema.parse(req.body);
    const targetEmail = personaEmailMap[persona];

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
