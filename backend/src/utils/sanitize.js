import sanitizeHtml from "sanitize-html";

/**
 * Sanitizes markdown/HTML comment content to protect against XSS injection.
 * Strips dangerous tags (script, iframe, object, embed, etc.) and attributes (onload, onerror, javascript: URIs).
 *
 * @param {string} content - Raw comment text
 * @returns {string} Sanitized string safe for storage and rendering
 */
export function sanitizeCommentContent(content) {
  if (typeof content !== "string") {
    return "";
  }

  const clean = sanitizeHtml(content, {
    allowedTags: [
      "b",
      "i",
      "em",
      "strong",
      "a",
      "p",
      "br",
      "ul",
      "ol",
      "li",
      "code",
      "pre",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "strike",
      "del",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });

  return clean.trim();
}
