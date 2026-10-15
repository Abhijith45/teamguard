import { prisma } from "../../config/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { idsSchema, parseId, parseRoleInput } from "../lib/admin-input.js";

export async function listRoles(_req, res) {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true } },
      permissions: { include: { permission: true }, orderBy: { permissionId: "asc" } },
    },
  });
  return res.json({ roles: roles.map(({ permissions, ...role }) => ({
    ...role,
    permissions: permissions.map(({ permission }) => permission),
  })) });
}

export async function createRole(req, res) {
  const role = await prisma.role.create({ data: parseRoleInput(req.body) });
  return res.status(201).json({ role });
}

export async function updateRole(req, res) {
  const roleId = parseId(req.params.roleId);
  const data = parseRoleInput(req.body, true);
  if (Object.keys(data).length === 0) throw new HttpError(400, "No role fields provided");
  const current = await prisma.role.findUnique({ where: { id: roleId } });
  if (!current) throw new HttpError(404, "Role not found");
  if (["admin", "user"].includes(current.name) && data.name && data.name !== current.name) {
    throw new HttpError(409, "Built-in role names cannot be changed");
  }
  const role = await prisma.role.update({ where: { id: roleId }, data });
  return res.json({ role });
}

export async function deleteRole(req, res) {
  const roleId = parseId(req.params.roleId);
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
  if (!role) throw new HttpError(404, "Role not found");
  if (["admin", "user"].includes(role.name)) throw new HttpError(409, "Built-in roles cannot be deleted");
  if (role._count.users > 0) throw new HttpError(409, "Unassign this role from all users first");
  await prisma.role.delete({ where: { id: roleId } });
  return res.status(204).end();
}

export async function replaceRolePermissions(req, res) {
  const roleId = parseId(req.params.roleId);
  const { ids: permissionIds } = idsSchema.parse(req.body);
  await prisma.$transaction(async (transaction) => {
    const role = await transaction.role.findUnique({ where: { id: roleId } });
    if (!role) throw new HttpError(404, "Role not found");
    const permissions = await transaction.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true, resource: true, action: true },
    });
    if (permissions.length !== permissionIds.length) throw new HttpError(400, "One or more permissions do not exist");
    if (role.name === "admin") {
      const required = new Set(["profile:read", "users:read", "users:manage", "roles:manage", "permissions:manage"]);
      for (const permission of permissions) required.delete(`${permission.resource}:${permission.action}`);
      if (required.size > 0) throw new HttpError(409, "The admin role must retain all core management permissions");
    }
    await transaction.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await transaction.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId, permissionId })) });
    }
  });
  return res.json({ message: "Role permissions updated" });
}
