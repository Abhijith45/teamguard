import React, { useMemo } from "react";
import { sanitizeHtml, isHtmlEmpty } from "../features/editor/editorUtils.js";

/**
 * RichTextViewer Component
 *
 * Renders sanitized rich text HTML with full XSS defense.
 * Applies rich typography styles for headings, lists, inline code,
 * blockquotes, links, and code blocks.
 */
export function RichTextViewer({
  content = "",
  className = "",
  placeholder = "No content provided.",
}) {
  const sanitized = useMemo(() => sanitizeHtml(content), [content]);
  const isEmpty = useMemo(() => isHtmlEmpty(sanitized), [sanitized]);

  if (isEmpty) {
    return (
      <div className={`rich-text-viewer empty ${className}`}>
        <span className="rich-text-placeholder-text">{placeholder}</span>
      </div>
    );
  }

  return (
    <div
      className={`rich-text-viewer ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

export default RichTextViewer;
