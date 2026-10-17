import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeHtml,
  getByteLength,
  isHtmlEmpty,
  validateContentSize,
  MAX_DESCRIPTION_BYTES,
  MAX_COMMENT_BYTES,
} from "./editorUtils.js";

test("TASK-504 [FE REQ 1 / Empty HTML Detection]: Accurately classifies empty tags", () => {
  assert.equal(isHtmlEmpty(""), true);
  assert.equal(isHtmlEmpty("<p></p>"), true);
  assert.equal(isHtmlEmpty("<p><br></p>"), true);
  assert.equal(isHtmlEmpty("<p>   </p>"), true);
  assert.equal(isHtmlEmpty("<div><span>&nbsp;</span></div>"), true);
  assert.equal(isHtmlEmpty(null), true);
  assert.equal(isHtmlEmpty(undefined), true);

  assert.equal(isHtmlEmpty("<p>Hello world</p>"), false);
  assert.equal(isHtmlEmpty("<h1>Title</h1>"), false);
  assert.equal(isHtmlEmpty("<ul><li>Task item</li></ul>"), false);
});

test("TASK-504 [FE REQ 2 / Byte Length & Size Validation]: Calculates UTF-8 bytes and limits accurately", () => {
  assert.equal(getByteLength(""), 0);
  assert.equal(getByteLength("abc"), 3);
  // UTF-8 multibyte characters
  assert.equal(getByteLength("🚀"), 4);

  const underDescLimit = validateContentSize("<p>Small description</p>", MAX_DESCRIPTION_BYTES);
  assert.equal(underDescLimit.valid, true);
  assert.ok(underDescLimit.percentage >= 0 && underDescLimit.percentage <= 100);

  const giantStr = "X".repeat(MAX_DESCRIPTION_BYTES + 10);
  const overDescLimit = validateContentSize(giantStr, MAX_DESCRIPTION_BYTES);
  assert.equal(overDescLimit.valid, false);

  const underCommentLimit = validateContentSize("<p>Small comment</p>", MAX_COMMENT_BYTES);
  assert.equal(underCommentLimit.valid, true);

  const overCommentLimit = validateContentSize("Y".repeat(MAX_COMMENT_BYTES + 1), MAX_COMMENT_BYTES);
  assert.equal(overCommentLimit.valid, false);
});

test("TASK-504 [FE REQ 3 / HTML Sanitization]: Preserves valid rich text and renders XSS inert", () => {
  const benignHtml = "<p>This is <strong>bold</strong> and <em>italic</em> with a <a href=\"https://teamguard.io\">link</a>.</p>";
  const cleanedBenign = sanitizeHtml(benignHtml);
  assert.ok(cleanedBenign.includes("<strong>bold</strong>"));
  assert.ok(cleanedBenign.includes("<em>italic</em>"));
  assert.ok(cleanedBenign.includes("https://teamguard.io"));

  const xssHtml = "<p>Harmless</p><script>alert('pwned')</script><img src=\"x\" onerror=\"alert(1)\" /><a href=\"javascript:alert(2)\">Click</a>";
  const cleanedXss = sanitizeHtml(xssHtml);
  assert.ok(!cleanedXss.includes("<script>"));
  assert.ok(!cleanedXss.includes("alert('pwned')"));
  assert.ok(!cleanedXss.includes("onerror"));
  assert.ok(!cleanedXss.includes("javascript:"));
  assert.ok(cleanedXss.includes("<p>Harmless</p>"));
});
