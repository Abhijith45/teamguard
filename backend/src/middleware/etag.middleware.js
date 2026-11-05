import crypto from "node:crypto";

/**
 * Computes a lightweight ETag for string/buffer payloads.
 */
export function generateETag(body) {
  if (body === null || body === undefined) return null;
  const str = typeof body === "string" ? body : Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const hash = crypto.createHash("md5").update(str).digest("hex");
  return `"${hash}"`;
}

/**
 * Express middleware to attach ETags and handle conditional HTTP 304 responses
 * on GET requests across JSON endpoints.
 */
export function conditionalETagMiddleware(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  // Intercept res.json
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    if (res.headersSent) {
      return originalJson(data);
    }

    try {
      const etag = generateETag(data);
      if (etag) {
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "private, no-cache, must-revalidate");

        const clientETag = req.headers["if-none-match"];
        if (clientETag && clientETag === etag) {
          return res.status(304).end();
        }
      }
    } catch {
      // Graceful fallback to regular response
    }

    return originalJson(data);
  };

  next();
}
