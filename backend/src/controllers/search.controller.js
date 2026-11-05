import { globalSearchService } from "../services/search.service.js";

/**
 * Controller for multi-entity search endpoint.
 * GET /api/search?q=:term&limit=:limit
 */
export async function globalSearch(req, res, next) {
  try {
    const organizationId = req.organizationId;
    const rawQuery = String(req.query.q || req.query.query || "").trim();

    if (rawQuery.length > 100) {
      return res.status(400).json({ error: "Search query too long (maximum 100 characters)" });
    }

    // Strip unprintable control characters and dangerous HTML delimiters
    const sanitizedQuery = rawQuery.replace(/[\x00-\x1f\x7f<>&"]/g, "").trim();

    const limit = req.query.limit;

    const data = await globalSearchService({
      organizationId,
      query: sanitizedQuery,
      limit,
    });

    return res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}
