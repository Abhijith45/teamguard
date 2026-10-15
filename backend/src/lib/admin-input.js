import { z } from "zod";
import { HttpError } from "./http-error.js";

export const idsSchema = z.object({
  ids: z.array(z.number().int().positive()).max(100).refine((ids) => new Set(ids).size === ids.length),
}).strict();

export const userSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  isActive: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
  directPermissions: {
    select: { permission: { select: { id: true, resource: true, action: true } } },
  },
};

export function parseId(rawId) {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid ID");
  return id;
}

export function publicUser(user) {
  return {
    ...user,
    roles: user.roles.map(({ role }) => role),
    directPermissions: user.directPermissions.map(({ permission }) => permission),
  };
}

export function parseRoleInput(body, partial = false) {
  const schema = z.object({
    name: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,39}$/),
    description: z.string().trim().max(240).nullable().optional(),
  }).strict();
  return (partial ? schema.partial() : schema).parse(body);
}

export function parsePermissionInput(body) {
  return z.object({
    resource: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,39}$/),
    action: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,39}$/),
    description: z.string().trim().max(240).nullable().optional(),
  }).strict().parse(body);
}
