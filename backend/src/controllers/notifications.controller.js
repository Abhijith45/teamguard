import {
  listNotificationsService,
  getUnreadCountService,
  markNotificationAsReadService,
  markAllNotificationsAsReadService,
  deleteNotificationService,
  clearReadNotificationsService,
  getNotificationPreferencesService,
  updateNotificationPreferencesService,
} from "../services/notifications.service.js";

/**
 * Lists notifications for caller in the active organization.
 */
export async function listNotifications(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;
    const unreadOnly = req.query.unreadOnly === "true" || req.query.unreadOnly === true;
    const page = req.query.page;
    const limit = req.query.limit;

    const result = await listNotificationsService({
      organizationId,
      userId,
      unreadOnly,
      page,
      limit,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Returns unread notification count for caller in the active organization.
 */
export async function getUnreadCount(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;

    const result = await getUnreadCountService({
      organizationId,
      userId,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Marks a single notification as read.
 */
export async function markAsRead(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;
    const notificationId = parseInt(req.params.id, 10);

    if (isNaN(notificationId) || notificationId <= 0) {
      return res.status(400).json({ error: "Invalid notification ID" });
    }

    const notification = await markNotificationAsReadService({
      organizationId,
      userId,
      notificationId,
    });

    return res.status(200).json({ notification });
  } catch (err) {
    next(err);
  }
}

/**
 * Marks all notifications for caller in current organization as read.
 */
export async function markAllAsRead(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;

    const result = await markAllNotificationsAsReadService({
      organizationId,
      userId,
    });

    return res.status(200).json({
      message: "All notifications marked as read",
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a single notification.
 */
export async function deleteNotification(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;
    const notificationId = parseInt(req.params.id, 10);

    if (isNaN(notificationId) || notificationId <= 0) {
      return res.status(400).json({ error: "Invalid notification ID" });
    }

    const result = await deleteNotificationService({
      organizationId,
      userId,
      notificationId,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Clears all read notifications for caller in current organization.
 */
export async function clearReadNotifications(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;

    const result = await clearReadNotificationsService({
      organizationId,
      userId,
    });

    return res.status(200).json({
      message: "Read notifications cleared",
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the notification preferences for caller in active organization.
 */
export async function getPreferences(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;

    const preferences = await getNotificationPreferencesService({
      organizationId,
      userId,
    });

    return res.status(200).json({ preferences });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates notification preferences for caller in active organization.
 */
export async function updatePreferences(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;

    const preferences = await updateNotificationPreferencesService({
      organizationId,
      userId,
      data: req.body,
    });

    return res.status(200).json({
      message: "Notification preferences updated successfully",
      preferences,
    });
  } catch (err) {
    next(err);
  }
}
