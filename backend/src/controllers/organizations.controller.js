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
        if (["dashboard", "project", "task", "files", "report"].includes(p.resource)) {
          if (!p.action.includes("delete") && !p.action.includes("manage")) {
            await tx.rolePermission.create({
              data: { roleId: managerRole.id, permissionId: p.id },
            });
          }
        }
        if (["dashboard:view", "project:view", "task:view", "task:create", "task:update:own", "task:update:assigned", "files:view"].includes(`${p.resource}:${p.action}`)) {
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

const updateOrgSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must not exceed 100 characters").optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,50}$/, "Slug must be 3-50 lowercase alphanumeric or hyphens").optional(),
});

export async function getOrganization(req, res, next) {
  try {
    const targetId = req.params.id ? parseInt(req.params.id, 10) : req.organizationId;
    if (isNaN(targetId) || targetId !== req.organizationId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const org = await prisma.organization.findUnique({
      where: { id: targetId },
      include: {
        _count: {
          select: {
            memberships: { where: { status: "ACTIVE" } },
            projects: true,
            tasks: true,
            roles: true,
          },
        },
      },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    return res.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt,
        counts: {
          members: org._count.memberships,
          projects: org._count.projects,
          tasks: org._count.tasks,
          roles: org._count.roles,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateOrganization(req, res, next) {
  try {
    const targetId = req.params.id ? parseInt(req.params.id, 10) : req.organizationId;
    if (isNaN(targetId) || targetId !== req.organizationId) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const input = updateOrgSchema.parse(req.body);
    if (!input.name && !input.slug) {
      return res.status(400).json({ error: "At least one field (name or slug) must be provided" });
    }

    if (input.slug) {
      const existing = await prisma.organization.findUnique({
        where: { slug: input.slug },
      });
      if (existing && existing.id !== targetId) {
        return res.status(409).json({ error: "Organization slug already in use" });
      }
    }

    const updated = await prisma.organization.update({
      where: { id: targetId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.slug ? { slug: input.slug } : {}),
      },
    });

    await logAuditEvent({
      organizationId: targetId,
      actorId: req.auth.userId,
      action: "organization:update",
      resourceType: "Organization",
      resourceId: String(targetId),
      details: {
        changes: input,
        name: updated.name,
        slug: updated.slug,
      },
    });

    return res.json({ organization: updated });
  } catch (error) {
    next(error);
  }
}
