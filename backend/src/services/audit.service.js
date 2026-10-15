import { prisma } from "../../config/prisma.js";

/**
 * Audit Logging Service.
 * Logs security and operational actions with tenant isolation.
 * Never logs sensitive credentials, tokens, or hashes.
 */
export async function logAuditEvent({
  organizationId,
  actorId,
  action,
  resourceType,
  resourceId,
  details,
  outcome = "SUCCESS",
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: actorId ?? null,
        action,
        resourceType,
        resourceId: resourceId ? String(resourceId) : null,
        details: typeof details === "object" ? JSON.stringify(details) : (details ?? null),
        outcome,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log entry:", error.message);
    return null;
  }
}
