import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";

const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,50}$/).optional(),
});

export async function listOrganizations(req, res, next) {
  try {
    const userId = req.auth.userId;
    const memberships = await prisma.membership.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        organization: true,
        roles: {
          include: { role: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const organizations = memberships.map((m) => ({
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

    return res.json({ organizations });
  } catch (error) {
    next(error);
  }
}

export async function createOrganization(req, res, next) {
  try {
    const input = createOrgSchema.parse(req.body);
    const userId = req.auth.userId;
    const baseSlug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    const uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    const newOrg = await prisma.$transaction(async (tx) => {
      // 1. Create org
      const org = await tx.organization.create({
        data: {
          name: input.name,
          slug: uniqueSlug,
        },
      });

      // 2. Create standard roles
      const superAdminRole = await tx.role.create({
        data: {
          organizationId: org.id,
          name: "Super Admin",
          slug: "super-admin",
          description: "Full administrative access",
          isSystem: true,
        },
      });

      const managerRole = await tx.role.create({
        data: {
          organizationId: org.id,
          name: "Project Manager",
          slug: "project-manager",
          description: "Can manage projects, tasks, and files",
          isSystem: true,
        },
      });

      const memberRole = await tx.role.create({
        data: {
          organizationId: org.id,
          name: "Team Member",
          slug: "team-member",
          description: "Can create and update assigned tasks",
          isSystem: true,
        },
      });

      const stakeholderRole = await tx.role.create({
        data: {
          organizationId: org.id,
          name: "Stakeholder",
          slug: "stakeholder",
          description: "Read-only viewer",
          isSystem: true,
        },
      });

      // Assign all permissions to Super Admin
      const allPerms = await tx.permission.findMany();
      for (const p of allPerms) {
        await tx.rolePermission.create({
          data: { roleId: superAdminRole.id, permissionId: p.id },
        });
      }

      // Assign partial permissions to Manager, Member, Stakeholder
      for (const p of allPerms) {
        if (["dashboard", "project", "task", "files"].includes(p.resource)) {
          if (!p.action.includes("delete") && !p.action.includes("manage")) {
            await tx.rolePermission.create({
              data: { roleId: managerRole.id, permissionId: p.id },
            });
          }
        }
        if (["dashboard:view", "project:view", "task:view", "task:create", "task:update:own", "files:view"].includes(`${p.resource}:${p.action}`)) {
          await tx.rolePermission.create({
            data: { roleId: memberRole.id, permissionId: p.id },
          });
        }
        if (["dashboard:view", "project:view", "task:view", "files:view"].includes(`${p.resource}:${p.action}`)) {
          await tx.rolePermission.create({
            data: { roleId: stakeholderRole.id, permissionId: p.id },
          });
        }
      }

      // 3. Create membership and assign Super Admin
      const membership = await tx.membership.create({
        data: {
          userId,
          organizationId: org.id,
          department: "Executive",
        },
      });

      await tx.membershipRole.create({
        data: {
          membershipId: membership.id,
          roleId: superAdminRole.id,
        },
      });

      return org;
    });

    await logAuditEvent({
      organizationId: newOrg.id,
      actorId: userId,
      action: "organization:create",
      resourceType: "Organization",
      resourceId: String(newOrg.id),
      details: { name: newOrg.name, slug: newOrg.slug },
    });

    return res.status(201).json({ organization: newOrg });
  } catch (error) {
    next(error);
  }
}

export async function listMembers(req, res, next) {
  try {
    const orgId = req.organizationId;
    const members = await prisma.membership.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      include: {
        user: { select: { id: true, name: true, email: true, username: true, avatarUrl: true } },
        roles: { include: { role: true } },
      },
    });

    const formatted = members.map((m) => ({
      membershipId: m.id,
      user: m.user,
      department: m.department,
      roles: m.roles.map((r) => r.role),
      joinedAt: m.joinedAt,
    }));

    return res.json({ members: formatted });
  } catch (error) {
    next(error);
  }
}
