import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { idsSchema, parseId, publicUser, userSelect } from "../lib/admin-input.js";

export async function listUsers(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const where = search ? {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { username: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ],
  } : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, select: userSelect, orderBy: { id: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.user.count({ where }),
  ]);
  return res.json({ users: users.map(publicUser), pagination: { page, pageSize, total } });
}

export async function setUserActive(req, res) {
  const userId = parseId(req.params.userId);
  const { isActive } = z.object({ isActive: z.boolean() }).strict().parse(req.body);
  if (userId === req.auth.userId && !isActive) {
    throw new HttpError(409, "You cannot deactivate your own account");
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    select: { id: true, isActive: true },
  });
  if (!isActive) {
    await prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  return res.json({ user });
}

export async function replaceUserRoles(req, res) {
  const userId = parseId(req.params.userId);
  const { ids: roleIds } = idsSchema.parse(req.body);
  const user = await prisma.$transaction(async (transaction) => {
    const target = await transaction.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    if (!target) throw new HttpError(404, "User not found");
    const roles = await transaction.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } });
    if (roles.length !== roleIds.length) throw new HttpError(400, "One or more roles do not exist");
    const hadAdminRole = target.roles.some(({ role }) => role.name === "admin");
    const willKeepAdminRole = roles.some((role) => role.name === "admin");
    if (hadAdminRole && !willKeepAdminRole) {
      const adminRole = await transaction.role.findUnique({ where: { name: "admin" } });
      const otherAdmins = await transaction.userRole.count({
        where: {
          roleId: adminRole.id,
          userId: { not: userId },
          user: { is: { isActive: true } },
        },
      });
      if (otherAdmins === 0) throw new HttpError(409, "Cannot remove the last administrator");
    }
    await transaction.userRole.deleteMany({ where: { userId } });
    if (roleIds.length > 0) {
      await transaction.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
    }
    return transaction.user.findUnique({ where: { id: userId }, select: userSelect });
  });
  return res.json({ user: publicUser(user) });
}

export async function replaceUserPermissions(req, res) {
  const userId = parseId(req.params.userId);
  const { ids: permissionIds } = idsSchema.parse(req.body);
  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new HttpError(404, "User not found");
    const permissions = await transaction.permission.findMany({ where: { id: { in: permissionIds } }, select: { id: true } });
    if (permissions.length !== permissionIds.length) throw new HttpError(400, "One or more permissions do not exist");
    await transaction.userPermission.deleteMany({ where: { userId } });
    if (permissionIds.length > 0) {
      await transaction.userPermission.createMany({ data: permissionIds.map((permissionId) => ({ userId, permissionId })) });
    }
  });
  return res.json({ message: "Direct permissions updated" });
}
