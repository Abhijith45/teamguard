import { globalSearchService } from "../services/search.service.js";

/**
 * Controller for multi-entity search endpoint.
 * GET /api/search?q=:term&limit=:limit
 */
export async function globalSearch(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const query = req.query.q || req.query.query || "";
    const limit = req.query.limit;

    const data = await globalSearchService({
      organizationId,
      query,
      limit,
    });

    return res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}
