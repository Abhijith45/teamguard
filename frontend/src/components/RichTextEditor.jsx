import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Unlink,
  Undo,
  Redo,
  AlertCircle,
} from "lucide-react";
import {
  sanitizeHtml,
  getByteLength,
  MAX_DESCRIPTION_BYTES,
  validateContentSize,
} from "../features/editor/editorUtils.js";

/**
 * RichTextEditor Component
 *
 * Implements TASK-504 / UD-004 / US-COLLAB-004:
 * - TipTap / ProseMirror rich text WYSIWYG editor
 * - Headings (H1-H3), Lists (bullet/ordered), Quotes, Code Snippets/Blocks, Links, Undo/Redo
 * - Markdown shortcut input rules (#, *, 1., >, ```)
 * - Real-time byte bounding counter against 64KB / 16KB limits
 * - Strict client-side sanitization on output
 * - Accessible toolbar with active states and keyboard navigation
 */
export function RichTextEditor({
  value = "",
  onChange = null,
  placeholder = "Write detailed requirements, formatting, or markdown...",
  disabled = false,
  maxBytes = MAX_DESCRIPTION_BYTES,
  minHeight = "140px",
  id = "rich-text-editor",
  ariaLabel = "Rich text editor",
}) {
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || "",
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const sanitized = sanitizeHtml(html);
      onChange?.(sanitized);
    },
  });

  // Synchronize external value changes without disrupting cursor
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (value !== currentHtml && (value || currentHtml !== "<p></p>")) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  // Synchronize disabled state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  // Byte size calculation
  const currentContent = editor ? editor.getHTML() : value;
  const sizeMeta = useMemo(
    () => validateContentSize(currentContent, maxBytes),
    [currentContent, maxBytes]
  );

  const formattedSize = useMemo(() => {
    const bytes = sizeMeta.byteLength;
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }, [sizeMeta.byteLength]);

  const maxFormatted = useMemo(() => {
    return `${Math.round(maxBytes / 1024)} KB`;
  }, [maxBytes]);

  const setLink = useCallback(() => {
    if (!editor) return;
    if (!linkUrl) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkInputOpen(false);
      return;
    }

    let validUrl = linkUrl.trim();
    if (!/^https?:\/\//i.test(validUrl) && !/^mailto:/i.test(validUrl)) {
      validUrl = `https://${validUrl}`;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: validUrl })
      .run();

    setLinkInputOpen(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  if (!editor) {
    return (
      <div
        className="rich-text-editor-skeleton"
        style={{ minHeight, border: "1px solid var(--color-border-subtle)", borderRadius: 8, padding: 12 }}
      >
        <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Loading editor...</span>
      </div>
    );
  }

  return (
    <div
      className={`rich-text-editor-container ${disabled ? "disabled" : ""} ${!sizeMeta.valid ? "over-limit" : ""}`}
      id={id}
      aria-label={ariaLabel}
    >
      {/* Accessible Editor Toolbar */}
      {!disabled && (
        <div className="rte-toolbar" role="toolbar" aria-label="Text formatting options">
          <div className="rte-btn-group">
            <button
              type="button"
              className={`rte-btn ${editor.isActive("bold") ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Bold (Ctrl+B)"
              aria-label="Bold"
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              className={`rte-btn ${editor.isActive("italic") ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Italic (Ctrl+I)"
              aria-label="Italic"
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              className={`rte-btn ${editor.isActive("strike") ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              title="Strikethrough"
              aria-label="Strikethrough"
            >
              <Strikethrough size={14} />
            </button>
            <button
              type="button"
              className={`rte-btn ${editor.isActive("code") ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="Inline Code (`code`)"
              aria-label="Inline Code"
            >
              <Code size={14} />
            </button>
          </div>

          <div className="rte-divider" />

          <div className="rte-btn-group">
            <button
              type="button"
              className={`rte-btn ${editor.isActive("heading", { level: 1 }) ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              title="Heading 1 (# text)"
              aria-label="Heading 1"
            >
              <Heading1 size={14} />
            </button>
            <button
              type="button"
              className={`rte-btn ${editor.isActive("heading", { level: 2 }) ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="Heading 2 (## text)"
              aria-label="Heading 2"
            >
              <Heading2 size={14} />
            </button>
            <button
              type="button"
              className={`rte-btn ${editor.isActive("heading", { level: 3 }) ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              title="Heading 3 (### text)"
              aria-label="Heading 3"
            >
              <Heading3 size={14} />
            </button>
          </div>

          <div className="rte-divider" />

          <div className="rte-btn-group">
            <button
              type="button"
              className={`rte-btn ${editor.isActive("bulletList") ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Bullet List (- item)"
              aria-label="Bullet List"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              className={`rte-btn ${editor.isActive("orderedList") ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Ordered List (1. item)"
              aria-label="Ordered List"
            >
              <ListOrdered size={14} />
            </button>
            <button
              type="button"
              className={`rte-btn ${editor.isActive("blockquote") ? "is-active" : ""}`}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="Blockquote (> quote)"
              aria-label="Blockquote"
            >
              <Quote size={14} />
            </button>
          </div>

          <div className="rte-divider" />

          <div className="rte-btn-group">
            <button
              type="button"
              className={`rte-btn ${editor.isActive("link") ? "is-active" : ""}`}
              onClick={() => {
                const previousUrl = editor.getAttributes("link").href || "";
                setLinkUrl(previousUrl);
                setLinkInputOpen((prev) => !prev);
              }}
              title="Insert / Edit Link"
              aria-label="Link"
            >
              <LinkIcon size={14} />
            </button>
            {editor.isActive("link") && (
              <button
                type="button"
                className="rte-btn"
                onClick={() => editor.chain().focus().unsetLink().run()}
                title="Remove Link"
                aria-label="Remove Link"
              >
                <Unlink size={14} />
              </button>
            )}
          </div>

          <div className="rte-divider" />

          <div className="rte-btn-group">
            <button
              type="button"
              className="rte-btn"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo size={14} />
            </button>
            <button
              type="button"
              className="rte-btn"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo size={14} />
            </button>
          </div>

          <div className="rte-toolbar-spacer" />

          {/* Byte Counter Badge */}
          <div
            className={`rte-byte-badge ${!sizeMeta.valid ? "danger" : sizeMeta.percentage >= 80 ? "warning" : ""}`}
            title={`Payload size: ${formattedSize} of ${maxFormatted} maximum limit`}
          >
            <span>{formattedSize} / {maxFormatted}</span>
          </div>
        </div>
      )}

      {/* Popover Link Input Modal */}
      {linkInputOpen && !disabled && (
        <div className="rte-link-popover" role="dialog" aria-label="Insert Link Dialog">
          <input
            type="url"
            className="rte-link-input"
            placeholder="https://example.com/spec..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setLink();
              } else if (e.key === "Escape") {
                setLinkInputOpen(false);
              }
            }}
            autoFocus
          />
          <button type="button" className="rte-link-apply-btn" onClick={setLink}>
            Apply
          </button>
          <button
            type="button"
            className="rte-link-cancel-btn"
            onClick={() => setLinkInputOpen(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="rte-content-wrapper" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>

      {/* Over-Limit Alert Footer */}
      {!sizeMeta.valid && (
        <div className="rte-error-banner" role="alert">
          <AlertCircle size={14} />
          <span>Content exceeds maximum payload size of {maxFormatted}. Please shorten your text before saving.</span>
        </div>
      )}
    </div>
  );
}

export default RichTextEditor;
