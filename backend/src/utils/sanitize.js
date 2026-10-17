import sanitizeHtml from "sanitize-html";

/**
 * TASK-504 / UD-004 / US-COLLAB-004:
 * Server-side HTML/Rich-Text sanitization and payload bounding rules.
 * Enforces strict XSS defenses against script execution, javascript: URIs,
 * iframe widgets, and malformed tags.
 */

export const MAX_DESCRIPTION_BYTES = 64 * 1024; // 64 KB
export const MAX_COMMENT_BYTES = 16 * 1024; // 16 KB

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "b",
  "i",
  "u",
  "s",
  "em",
  "strong",
  "strike",
  "del",
  "p",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "code",
  "pre",
  "blockquote",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
];

const ALLOWED_ATTRIBUTES = {
  a: ["href", "name", "target", "rel", "title"],
  code: ["class"],
  pre: ["class"],
  span: ["class"],
  th: ["colspan", "rowspan", "align"],
  td: ["colspan", "rowspan", "align"],
};

/**
 * Sanitizes rich text content (HTML/Markdown output) to render it completely inert
 * to stored Cross-Site Scripting (XSS) vectors.
 *
 * @param {string} content - Raw user-supplied rich text
 * @returns {string} Sanitized string safe for database storage and client rendering
 */
export function sanitizeRichTextContent(content) {
  if (typeof content !== "string") {
    return "";
  }

  const clean = sanitizeHtml(content, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });

  return clean.trim();
}

/**
 * Validates that rich text description does not exceed 64 KB.
 */
export function validateDescriptionSize(content) {
  if (!content) return true;
  const bytes = Buffer.byteLength(String(content), "utf8");
  return bytes <= MAX_DESCRIPTION_BYTES;
}

/**
 * Validates that rich text comment does not exceed 16 KB.
 */
export function validateCommentSize(content) {
  if (!content) return true;
  const bytes = Buffer.byteLength(String(content), "utf8");
  return bytes <= MAX_COMMENT_BYTES;
}

/**
 * Backwards-compatible alias for comment sanitization.
 */
export function sanitizeCommentContent(content) {
  return sanitizeRichTextContent(content);
}
