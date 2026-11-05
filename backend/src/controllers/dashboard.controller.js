import { getDashboardDataService } from "../services/dashboard.service.js";
import { cache } from "../lib/cache.js";

/**
 * Controller retrieving aggregated dashboard KPIs, 48h urgent tasks,
 * recent projects, activity feed, and 90-day contribution heatmap.
 * Uses cache-aside pattern with 30s TTL per tenant and user.
 */
export async function getDashboardData(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;
    const cacheKey = `dashboard:${organizationId}:${userId}`;

    const data = await cache.getOrSet(
      cacheKey,
      () => getDashboardDataService({ organizationId, userId }),
      {
        ttlMs: 30 * 1000,
        tags: [`tenant:${organizationId}`, `dashboard:${organizationId}`],
      }
    );

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}
