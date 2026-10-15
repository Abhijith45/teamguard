import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";
import { isSystemRole, validateDelegationBarrier } from "../middleware/rbac.middleware.js";

const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Role name must be at least 2 characters")
    .max(50, "Role name must not exceed 50 characters"),
  description: z.string().trim().max(240, "Description must not exceed 240 characters").optional().nullable(),
  cloneFromRoleId: z.number().int().positive().optional().nullable(),
});

const updateRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Role name must be at least 2 characters")
    .max(50, "Role name must not exceed 50 characters")
    .optional(),
  description: z.string().trim().max(240).optional().nullable(),
});

const bulkToggleSchema = z.object({
  enabled: z.boolean(),
});

export async function listRoles(req, res, next) {
  try {
    const orgId = req.organizationId;
    const roles = await prisma.role.findMany({
      where: orgId ? { organizationId: orgId } : {},
      orderBy: { id: "asc" },
      include: {
        _count: { select: { memberships: true } },
        permissions: { include: { permission: true }, orderBy: { permissionId: "asc" } },
      },
    });

    return res.json({
      roles: roles.map(({ permissions, ...role }) => ({
        ...role,
        permissions: permissions.map(({ permission }) => permission),
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function createRole(req, res, next) {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: "Organization tenant context required" });
    }

    const input = createRoleSchema.parse(req.body);
    const actorId = req.auth.userId;

    // Check duplicate role name in tenant
    const existing = await prisma.role.findFirst({
      where: {
        organizationId: orgId,
        name: { equals: input.name, mode: "insensitive" },
      },
    });
    if (existing) {
      return res.status(409).json({ error: "Role name already exists in this organization" });
    }

    // Auto-generate clean slug
    const baseSlug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-");
    const uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    let clonedPermissionIds = [];

    // If cloning from an existing role, verify source role
    if (input.cloneFromRoleId) {
      const sourceRole = await prisma.role.findFirst({
        where: {
          id: input.cloneFromRoleId,
          OR: [{ organizationId: orgId }, { organizationId: null }],
        },
        include: { permissions: true },
      });

      if (!sourceRole) {
        return res.status(404).json({ error: "Template role to clone from not found" });
      }

      clonedPermissionIds = sourceRole.permissions.map((rp) => rp.permissionId);

      // Universal Privilege Delegation Barrier (US-RBAC-006 / TG-RBAC-007)
      if (clonedPermissionIds.length > 0) {
        const clonedPerms = await prisma.permission.findMany({
          where: { id: { in: clonedPermissionIds } },
        });
        const delegationCheck = validateDelegationBarrier(req.userPermissions, clonedPerms);
        if (!delegationCheck.allowed) {
          return res.status(403).json({
            error: "Privilege Delegation Barrier: Cannot clone or grant permissions that you do not personally possess",
            code: "DELEGATION_BARRIER_BREACH",
            unauthorizedPermissions: delegationCheck.unauthorizedPermissions,
          });
        }
      }
    }

    const newRole = await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          organizationId: orgId,
          name: input.name,
          slug: uniqueSlug,
          description: input.description || null,
          isSystem: false,
        },
      });

      if (clonedPermissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: clonedPermissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }

      return role;
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "role:create",
      resourceType: "Role",
      resourceId: String(newRole.id),
      details: {
        name: newRole.name,
        slug: newRole.slug,
        isCustom: true,
        clonedFromRoleId: input.cloneFromRoleId || null,
        clonedPermissionCount: clonedPermissionIds.length,
      },
    });

    const fullRole = await prisma.role.findUnique({
      where: { id: newRole.id },
      include: {
        _count: { select: { memberships: true } },
        permissions: { include: { permission: true } },
      },
    });

    return res.status(201).json({
      role: {
        ...fullRole,
        permissions: fullRole.permissions.map((rp) => rp.permission),
      },
      clonedPermissionCount: clonedPermissionIds.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateRole(req, res, next) {
  try {
    const orgId = req.organizationId;
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) return res.status(400).json({ error: "Invalid role ID" });

    const input = updateRoleSchema.parse(req.body);
    const actorId = req.auth.userId;

    const role = await prisma.role.findFirst({
      where: { id: roleId, organizationId: orgId },
    });
    if (!role) {
      return res.status(404).json({ error: "Role not found in this organization" });
    }

    // System Role Protection (US-RBAC-007 / TG-RBAC-008)
    if (isSystemRole(role)) {
      if (input.name && input.name !== role.name) {
        return res.status(403).json({
          error: "Cannot rename built-in system role",
          code: "SYSTEM_ROLE_IMMUTABLE",
        });
      }
    }

    if (input.name && input.name !== role.name) {
      const duplicate = await prisma.role.findFirst({
        where: {
          organizationId: orgId,
          name: { equals: input.name, mode: "insensitive" },
          id: { not: roleId },
        },
      });
      if (duplicate) {
        return res.status(409).json({ error: "Role name already exists in this organization" });
      }
    }

    const updated = await prisma.role.update({
      where: { id: roleId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: {
        _count: { select: { memberships: true } },
        permissions: { include: { permission: true } },
      },
    });

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: "role:update",
      resourceType: "Role",
      resourceId: String(roleId),
      details: { changes: input },
    });

    return res.json({
      role: {
        ...updated,
        permissions: updated.permissions.map((rp) => rp.permission),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function bulkToggleModulePermissions(req, res, next) {
  try {
    const orgId = req.organizationId;
    const roleId = parseInt(req.params.roleId, 10);
    const { module: moduleName } = req.params;
    const { enabled } = bulkToggleSchema.parse(req.body);
    const actorId = req.auth.userId;

    if (isNaN(roleId)) return res.status(400).json({ error: "Invalid role ID" });

    const role = await prisma.role.findFirst({
      where: { id: roleId, organizationId: orgId },
    });
    if (!role) {
      return res.status(404).json({ error: "Role not found in this organization" });
    }

    // Lockout Guard (US-RBAC-005 AC 2, BR-004, SEC-05)
    if ((role.name === "Super Admin" || role.slug === "super-admin" || role.slug === "owner") && !enabled) {
      return res.status(403).json({
        error: "Privilege Guard: Cannot revoke permissions from Super Admin role to prevent lockout",
        code: "SUPER_ADMIN_LOCKOUT_PROTECTION",
      });
    }

    // Find all permissions belonging to this module/resource
    const permissions = await prisma.permission.findMany({
      where: { resource: moduleName },
    });

    if (permissions.length === 0) {
      return res.status(404).json({ error: `No permissions found for module: ${moduleName}` });
    }

    const permissionIds = permissions.map((p) => p.id);

    if (enabled) {
      // Universal Privilege Delegation Barrier (US-RBAC-006 / TG-RBAC-007)
      const delegationCheck = validateDelegationBarrier(req.userPermissions, permissions);
      if (!delegationCheck.allowed) {
        return res.status(403).json({
          error: "Privilege Delegation Barrier: Cannot grant permissions that you do not personally possess",
          code: "DELEGATION_BARRIER_BREACH",
          unauthorizedPermissions: delegationCheck.unauthorizedPermissions,
        });
      }

      // Upsert permissions
      for (const pId of permissionIds) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: pId } },
          update: {},
          create: { roleId, permissionId: pId },
        });
      }
    } else {
      // Bulk revoke
      await prisma.rolePermission.deleteMany({
        where: {
          roleId,
          permissionId: { in: permissionIds },
        },
      });
    }

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: enabled ? "role:module:bulk-grant" : "role:module:bulk-revoke",
      resourceType: "RolePermission",
      resourceId: `${roleId}:${moduleName}`,
      details: {
        roleName: role.name,
        module: moduleName,
        enabled,
        affectedCount: permissionIds.length,
      },
    });

    return res.json({
      success: true,
      roleId,
      module: moduleName,
      enabled,
      affectedCount: permissionIds.length,
      permissionIds,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteRole(req, res, next) {
  try {
    const orgId = req.organizationId;
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) return res.status(400).json({ error: "Invalid role ID" });

    const role = await prisma.role.findFirst({
      where: { id: roleId, ...(orgId ? { organizationId: orgId } : {}) },
      include: {
        _count: {
          select: {
            memberships: {
              where: {
                membership: {
                  ...(orgId ? { organizationId: orgId } : {}),
                  status: "ACTIVE",
                },
              },
            },
          },
        },
      },
    });

    if (!role) {
      return res.status(404).json({ error: "Role not found in this organization" });
    }

    // System role protection (US-RBAC-003, US-RBAC-007, TG-RBAC-008, SEC-05)
    if (isSystemRole(role)) {
      return res.status(403).json({
        error: "Cannot delete protected system role",
        code: "SYSTEM_ROLE_IMMUTABLE",
      });
    }

    // Active member assignment guard (US-RBAC-006 AC 1)
    if (role._count.memberships > 0) {
      return res.status(400).json({
        error: "Cannot delete role assigned to active members; reassign members first",
        activeMemberCount: role._count.memberships,
      });
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.membershipRole.deleteMany({ where: { roleId } }),
      prisma.role.delete({ where: { id: roleId } }),
    ]);

    await logAuditEvent({
      organizationId: orgId || role.organizationId,
      actorId: req.auth.userId,
      action: "role:delete",
      resourceType: "Role",
      resourceId: String(roleId),
      details: { name: role.name, slug: role.slug },
    });

    return res.json({
      success: true,
      message: `Role "${role.name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function replaceRolePermissions(req, res, next) {
  try {
    const orgId = req.organizationId;
    const roleId = parseInt(req.params.roleId, 10);
    const { ids: permissionIds } = z
      .object({ ids: z.array(z.number().int().positive()) })
      .parse(req.body);

    const role = await prisma.role.findFirst({
      where: { id: roleId, ...(orgId ? { organizationId: orgId } : {}) },
    });
    if (!role) return res.status(404).json({ error: "Role not found" });

    if (role.name === "Super Admin" || role.slug === "super-admin") {
      const allPerms = await prisma.permission.findMany({ select: { id: true } });
      if (permissionIds.length < allPerms.length) {
        return res.status(403).json({
          error: "Privilege Guard: Cannot revoke permissions from Super Admin role to prevent lockout",
          code: "SUPER_ADMIN_LOCKOUT_PROTECTION",
        });
      }
    }

    // Universal Privilege Delegation Barrier (US-RBAC-006 / TG-RBAC-007)
    if (permissionIds.length > 0) {
      const permsToGrant = await prisma.permission.findMany({
        where: { id: { in: permissionIds } },
      });
      const delegationCheck = validateDelegationBarrier(req.userPermissions, permsToGrant);
      if (!delegationCheck.allowed) {
        return res.status(403).json({
          error: "Privilege Delegation Barrier: Cannot grant permissions that you do not personally possess",
          code: "DELEGATION_BARRIER_BREACH",
          unauthorizedPermissions: delegationCheck.unauthorizedPermissions,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
    });

    return res.json({ message: "Role permissions updated", roleId, count: permissionIds.length });
  } catch (error) {
    next(error);
  }
}
