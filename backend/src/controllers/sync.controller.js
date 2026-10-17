import { addSubscriber, getActiveSubscriberCount, getBufferedEvents } from "../services/sync.service.js";

/**
 * Controller for Server-Sent Events (SSE) streaming connections.
 * Route: GET /api/events/stream & GET /api/v1/events/stream
 */
export async function streamEvents(req, res) {
  const organizationId = req.organizationId;
  const userId = req.auth?.userId;

  // Extract optional Last-Event-ID header (standard SSE) or fallback to query param
  const lastEventId = req.headers["last-event-id"] || req.query.lastEventId || null;

  // Extract optional projectId filter
  let projectId = null;
  if (req.query.projectId) {
    const parsed = Number(req.query.projectId);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      projectId = parsed;
    }
  }

  // Set HTTP SSE streaming headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  // Register subscriber with the synchronization broker
  addSubscriber({
    organizationId,
    userId,
    projectId,
    res,
    req,
    lastEventId,
  });
}

/**
 * Controller for retrieving current sync connection status/diagnostics.
 * Route: GET /api/events/status
 */
export async function getSyncStatus(req, res) {
  const organizationId = req.organizationId;
  const activeSubscribers = getActiveSubscriberCount(organizationId);
  const bufferedEvents = getBufferedEvents(organizationId);

  res.status(200).json({
    organizationId,
    activeSubscribers,
    bufferedEventsCount: bufferedEvents.length,
    timestamp: new Date().toISOString(),
  });
}
