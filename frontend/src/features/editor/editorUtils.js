import DOMPurify from "dompurify";

export const MAX_DESCRIPTION_BYTES = 64 * 1024; // 64 KB
export const MAX_COMMENT_BYTES = 16 * 1024; // 16 KB

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "b",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "em",
  "strong",
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

const ALLOWED_ATTR = ["href", "name", "target", "rel", "title", "class", "colspan", "rowspan", "align"];

/**
 * Client-side DOMPurify sanitizer. Renders malicious XSS vectors inert while
 * preserving structured rich text formatting.
 *
 * @param {string} dirtyHtml
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml || typeof dirtyHtml !== "string") {
    return "";
  }

  const purify =
    typeof window !== "undefined"
      ? typeof DOMPurify === "function"
        ? DOMPurify(window)
        : DOMPurify
      : null;

  if (purify && typeof purify.sanitize === "function") {
    if (typeof purify.addHook === "function") {
      purify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A" && node.hasAttribute("href")) {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      });
    }

    const clean = purify.sanitize(dirtyHtml, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      FORBID_TAGS: ["script", "iframe", "object", "embed", "style", "form", "input", "button"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
    });

    if (typeof purify.removeHook === "function") {
      purify.removeHook("afterSanitizeAttributes");
    }

    return clean;
  }

  // Node.js test environment fallback when window / browser DOM is absent
  const cleaned = dirtyHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, 'href="#"');

  return cleaned.trim();
}

/**
 * Calculates accurate UTF-8 byte length of a string.
 * @param {string} str
 * @returns {number}
 */
export function getByteLength(str) {
  if (!str) return 0;
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.byteLength(str, "utf8");
  }
  return encodeURI(str).split(/%(?:u[0-9A-F]{4}|[0-9A-F]{2})/i).length - 1;
}

/**
 * Determines whether HTML contains meaningful content or just empty tags.
 * e.g. "<p></p>", "<p><br></p>", "<p>   </p>" are considered empty.
 *
 * @param {string} html
 * @returns {boolean}
 */
export function isHtmlEmpty(html) {
  if (!html || typeof html !== "string") return true;
  const stripped = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return stripped.length === 0;
}

/**
 * Validates whether the given rich text content complies with max byte limit.
 *
 * @param {string} content
 * @param {number} maxBytes
 * @returns {{ valid: boolean, byteLength: number, maxBytes: number, percentage: number }}
 */
export function validateContentSize(content, maxBytes = MAX_DESCRIPTION_BYTES) {
  const byteLength = getByteLength(content);
  return {
    valid: byteLength <= maxBytes,
    byteLength,
    maxBytes,
    percentage: Math.min(100, Math.round((byteLength / maxBytes) * 100)),
  };
}
