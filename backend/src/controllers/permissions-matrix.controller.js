import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { logAuditEvent } from "../services/audit.service.js";

const toggleSchema = z.object({
  roleId: z.number().int().positive(),
  permissionId: z.number().int().positive(),
  enabled: z.boolean(),
});

export async function getMatrix(req, res, next) {
  try {
    const orgId = req.organizationId;

    // Fetch roles in active organization
    const roles = await prisma.role.findMany({
      where: { organizationId: orgId },
      orderBy: { id: "asc" },
      include: {
        permissions: {
          select: { permissionId: true },
        },
      },
    });

    // Fetch all permissions
    const permissions = await prisma.permission.findMany({
      orderBy: [{ resource: "asc" }, { action: "asc" }],
    });

    // Group permissions into modules matching the UI mockup
    const categoryLabels = {
      dashboard: "Dashboard",
      task: "Tasks",
      files: "Files",
      project: "Projects",
      members: "Team & Members",
      roles: "Roles & Administration",
      audit: "Audit Logs",
      profile: "Profile",
    };

    const categoriesMap = new Map();
    for (const p of permissions) {
      const catKey = p.resource;
      if (!categoriesMap.has(catKey)) {
        categoriesMap.set(catKey, {
          id: catKey,
          label: categoryLabels[catKey] ?? catKey.toUpperCase(),
          permissions: [],
        });
      }
      categoriesMap.get(catKey).permissions.push({
        id: p.id,
        resource: p.resource,
        action: p.action,
        description: p.description,
      });
    }

    const categories = Array.from(categoriesMap.values());

    // Build lookup matrix: roleId -> Set of permissionIds
    const rolePermissionMap = {};
    for (const r of roles) {
      rolePermissionMap[r.id] = r.permissions.map((rp) => rp.permissionId);
    }

    return res.json({
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        isSystem: r.isSystem,
      })),
      categories,
      matrix: rolePermissionMap,
    });
  } catch (error) {
    next(error);
  }
}

export async function togglePermission(req, res, next) {
  try {
    const { roleId, permissionId, enabled } = toggleSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    // Verify role belongs to active organization
    const role = await prisma.role.findFirst({
      where: { id: roleId, organizationId: orgId },
    });
    if (!role) {
      return res.status(404).json({ error: "Role not found in this organization" });
    }

    // Privilege escalation protection: prevent locking out Super Admin
    if (role.name === "Super Admin" && !enabled) {
      return res.status(403).json({
        error: "Privilege Guard: Cannot revoke permissions from Super Admin role to prevent lockout",
      });
    }

    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
    });
    if (!permission) {
      return res.status(404).json({ error: "Permission not found" });
    }

    if (enabled) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    } else {
      await prisma.rolePermission.deleteMany({
        where: { roleId, permissionId },
      });
    }

    await logAuditEvent({
      organizationId: orgId,
      actorId,
      action: enabled ? "role:permission:grant" : "role:permission:revoke",
      resourceType: "RolePermission",
      resourceId: `${roleId}:${permissionId}`,
      details: {
        roleName: role.name,
        permission: `${permission.resource}:${permission.action}`,
        enabled,
      },
    });

    return res.json({
      success: true,
      roleId,
      permissionId,
      enabled,
    });
  } catch (error) {
    next(error);
  }
}
