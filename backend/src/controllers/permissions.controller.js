import { prisma } from "../../config/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { parseId, parsePermissionInput } from "../lib/admin-input.js";

export async function listPermissions(_req, res) {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ resource: "asc" }, { action: "asc" }],
    include: { _count: { select: { roles: true, users: true } } },
  });
  return res.json({ permissions });
}

export async function createPermission(req, res) {
  const permission = await prisma.permission.create({ data: parsePermissionInput(req.body) });
  return res.status(201).json({ permission });
}

export async function deletePermission(req, res) {
  const permissionId = parseId(req.params.permissionId);
  const permission = await prisma.permission.findUnique({
    where: { id: permissionId },
    include: { _count: { select: { roles: true, users: true } } },
  });
  if (!permission) throw new HttpError(404, "Permission not found");
  if (permission._count.roles > 0 || permission._count.users > 0) {
    throw new HttpError(409, "Remove this permission from roles and users first");
  }
  await prisma.permission.delete({ where: { id: permissionId } });
  return res.status(204).end();
}
