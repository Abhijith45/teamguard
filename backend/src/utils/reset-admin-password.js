import "dotenv/config";
import { prisma } from "../../config/prisma.js";
import { hashPassword } from "./password.js";

async function main() {
  const username = process.env.ADMIN_RESET_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_RESET_PASSWORD;
  if (!username || !password) {
    throw new Error("Set ADMIN_RESET_USERNAME and ADMIN_RESET_PASSWORD in backend/.env first.");
  }
  if (password.length < 12) {
    throw new Error("Admin password must be at least 12 characters.");
  }

  const [user, adminRole, passwordHash] = await Promise.all([
    prisma.user.findUnique({ where: { username }, select: { id: true, username: true } }),
    prisma.role.findUnique({ where: { name: "admin" }, select: { id: true } }),
    hashPassword(password),
  ]);
  if (!user) throw new Error(`No account exists for username ${username}.`);
  if (!adminRole) throw new Error("The admin role is missing; run npm run db:seed first.");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, isActive: true },
    }),
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      update: {},
      create: { userId: user.id, roleId: adminRole.id },
    }),
  ]);

  console.log(`Password reset and admin role verified for ${user.username}.`);
}

main()
  .catch((error) => {
    console.error(`Admin password reset failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });