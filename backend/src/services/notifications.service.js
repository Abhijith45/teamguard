import { prisma } from "../../config/prisma.js";
import { z } from "zod";

/**
 * Creates a notification record for a specific recipient user within an organization.
 * Strictly prevents self-notifications (actorId === userId).
 * Validates active recipient membership within the tenant boundary.
 */
export async function createNotificationService({
  organizationId,
  userId,
  actorId = null,
  type,
  title,
  message,
  resourceType = "task",
  resourceId,
  link = null,
}) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);
  const actor = actorId ? Number(actorId) : null;

  // Invariant 1: Never notify an actor for their own action
  if (actor && actor === targetUserId) {
    return null;
  }

  if (!orgId || !targetUserId || !type || !title || !message) {
    return null;
  }

  // Invariant 2: Verify recipient exists and is active member of this organization
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
    select: { status: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return null;
  }

  const notification = await prisma.notification.create({
    data: {
      organizationId: orgId,
      userId: targetUserId,
      actorId: actor,
      type,
      title,
      message,
      resourceType,
      resourceId: String(resourceId),
      link,
      isRead: false,
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          email: true,
        },
      },
    },
  });

  return notification;
}

/**
 * Lists paginated notifications for the calling user in the active organization.
 */
export async function listNotificationsService({
  organizationId,
  userId,
  unreadOnly = false,
  page = 1,
  limit = 20,
}) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where = {
    organizationId: orgId,
    userId: targetUserId,
  };

  if (unreadOnly) {
    where.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: "desc" },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        organizationId: orgId,
        userId: targetUserId,
        isRead: false,
      },
    }),
  ]);

  return {
    notifications,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    unreadCount,
  };
}

/**
 * Retrieves the count of unread notifications for the caller in the active organization.
 */
export async function getUnreadCountService({ organizationId, userId }) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);

  const unreadCount = await prisma.notification.count({
    where: {
      organizationId: orgId,
      userId: targetUserId,
      isRead: false,
    },
  });

  return { unreadCount };
}

/**
 * Marks a single notification as read.
 * Scoped strictly by organizationId and userId to prevent unauthorized manipulation.
 */
export async function markNotificationAsReadService({
  organizationId,
  userId,
  notificationId,
}) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);
  const notifId = Number(notificationId);

  const existing = await prisma.notification.findFirst({
    where: {
      id: notifId,
      organizationId: orgId,
      userId: targetUserId,
    },
  });

  if (!existing) {
    const error = new Error("Notification not found");
    error.statusCode = 404;
    throw error;
  }

  if (existing.isRead) {
    return existing;
  }

  const updated = await prisma.notification.update({
    where: { id: notifId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          email: true,
        },
      },
    },
  });

  return updated;
}

/**
 * Marks all unread notifications for the active user in the current tenant as read.
 */
export async function markAllNotificationsAsReadService({
  organizationId,
  userId,
}) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);

  const result = await prisma.notification.updateMany({
    where: {
      organizationId: orgId,
      userId: targetUserId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return { updatedCount: result.count };
}

/**
 * Deletes a single notification.
 */
export async function deleteNotificationService({
  organizationId,
  userId,
  notificationId,
}) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);
  const notifId = Number(notificationId);

  const existing = await prisma.notification.findFirst({
    where: {
      id: notifId,
      organizationId: orgId,
      userId: targetUserId,
    },
  });

  if (!existing) {
    const error = new Error("Notification not found");
    error.statusCode = 404;
    throw error;
  }

  await prisma.notification.delete({
    where: { id: notifId },
  });

  return { success: true, id: notifId };
}

/**
 * Clears all read notifications for caller in the active organization.
 */
export async function clearReadNotificationsService({
  organizationId,
  userId,
}) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);

  const result = await prisma.notification.deleteMany({
    where: {
      organizationId: orgId,
      userId: targetUserId,
      isRead: true,
    },
  });

  return { deletedCount: result.count };
}

const preferencesSchema = z.object({
  emailDigest: z.enum(["INSTANT", "DAILY", "WEEKLY", "OFF"]).optional(),
  notifyTaskAssigned: z.boolean().optional(),
  notifyTaskStatusChanged: z.boolean().optional(),
  notifyCommentAdded: z.boolean().optional(),
  notifyProjectArchived: z.boolean().optional(),
  notifyDueSoon: z.boolean().optional(),
});

/**
 * Retrieves the notification preferences for the calling user in the active tenant.
 * Falls back to default preferences if not yet customized.
 */
export async function getNotificationPreferencesService({ organizationId, userId }) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);

  const existing = await prisma.notificationPreference.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
  });

  if (existing) {
    return existing;
  }

  // Default notification preferences
  return {
    userId: targetUserId,
    organizationId: orgId,
    emailDigest: "DAILY",
    notifyTaskAssigned: true,
    notifyTaskStatusChanged: true,
    notifyCommentAdded: true,
    notifyProjectArchived: true,
    notifyDueSoon: true,
    isDefault: true,
  };
}

/**
 * Updates or creates notification preferences for the calling user in the active tenant.
 */
export async function updateNotificationPreferencesService({
  organizationId,
  userId,
  data,
}) {
  const orgId = Number(organizationId);
  const targetUserId = Number(userId);

  const parsed = preferencesSchema.safeParse(data);
  if (!parsed.success) {
    const error = new Error("Invalid notification preferences payload");
    error.statusCode = 400;
    error.details = parsed.error.issues;
    throw error;
  }

  const validData = parsed.data;

  const preference = await prisma.notificationPreference.upsert({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
    create: {
      userId: targetUserId,
      organizationId: orgId,
      ...validData,
    },
    update: {
      ...validData,
      updatedAt: new Date(),
    },
  });

  return preference;
}
