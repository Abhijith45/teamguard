import { getDashboardDataService } from "../services/dashboard.service.js";

/**
 * Controller retrieving aggregated dashboard KPIs, 48h urgent tasks,
 * recent projects, activity feed, and 90-day contribution heatmap.
 */
export async function getDashboardData(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const userId = req.auth.userId;

    const data = await getDashboardDataService({
      organizationId,
      userId,
    });

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}
