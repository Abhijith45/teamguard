import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  getDuplicateFileName,
  getFileTypeCategory,
  filterFiles,
  sortFiles,
} from "./filesUtils.js";

test("TASK-405 [US-FILE-003 / Duplication Naming]: getDuplicateFileName", () => {
  assert.equal(getDuplicateFileName("spec.pdf"), "spec (Copy).pdf");
  assert.equal(getDuplicateFileName("design_system.fig"), "design_system (Copy).fig");
  assert.equal(getDuplicateFileName("archive.tar.gz"), "archive.tar (Copy).gz");
  assert.equal(getDuplicateFileName("LICENSE"), "LICENSE (Copy)");
  assert.equal(getDuplicateFileName("  document.docx  "), "document (Copy).docx");
  assert.equal(getDuplicateFileName(""), "Untitled (Copy)");
  assert.equal(getDuplicateFileName(null), "Untitled (Copy)");
});

test("TASK-405 [US-FILE-001 / Byte Formatting]: formatBytes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1024 * 500), "500 KB");
  assert.equal(formatBytes(1048576 * 2.5), "2.5 MB");
  assert.equal(formatBytes(1073741824 * 1.5), "1.50 GB");
  assert.equal(formatBytes(-10), "0 B");
  assert.equal(formatBytes(null), "0 B");
});

test("TASK-405 [US-FILE-004 / Sorting]: sortFiles across name, size, type, project, and date", () => {
  const sample = [
    { id: 1, name: "B_file.pdf", sizeBytes: 2000, fileType: "PDF", createdAt: "2026-01-02", project: { name: "Zeus" } },
    { id: 2, name: "A_file.fig", sizeBytes: 500, fileType: "Figma File", createdAt: "2026-01-03", project: { name: "Apollo" } },
    { id: 3, name: "C_file.sql", sizeBytes: 10000, fileType: "SQL File", createdAt: "2026-01-01", project: null },
  ];

  // Name asc
  const byNameAsc = sortFiles(sample, "name", "asc");
  assert.equal(byNameAsc[0].id, 2);
  assert.equal(byNameAsc[1].id, 1);
  assert.equal(byNameAsc[2].id, 3);

  // Size desc
  const bySizeDesc = sortFiles(sample, "sizeBytes", "desc");
  assert.equal(bySizeDesc[0].id, 3);
  assert.equal(bySizeDesc[1].id, 1);
  assert.equal(bySizeDesc[2].id, 2);

  // Date desc
  const byDateDesc = sortFiles(sample, "createdAt", "desc");
  assert.equal(byDateDesc[0].id, 2);
  assert.equal(byDateDesc[1].id, 1);
  assert.equal(byDateDesc[2].id, 3);

  // Project asc (nulls default to 'Global Assets')
  const byProjectAsc = sortFiles(sample, "project", "asc");
  assert.equal(byProjectAsc[0].id, 2); // Apollo
  assert.equal(byProjectAsc[1].id, 3); // Global Assets
  assert.equal(byProjectAsc[2].id, 1); // Zeus
});

test("TASK-405 [US-FILE-001 & US-FILE-002 / Filtering]: filterFiles by query, project, and type", () => {
  const sample = [
    { id: 1, name: "Brand_Guidelines.pdf", sizeBytes: 1000, fileType: "PDF", projectId: 10, project: { name: "Marketing" } },
    { id: 2, name: "Backend_Architecture.fig", sizeBytes: 2000, fileType: "Figma File", projectId: 20, project: { name: "Platform" } },
    { id: 3, name: "Global_Asset.png", sizeBytes: 500, fileType: "Image", projectId: null, project: null },
  ];

  // Search by text query
  const resQuery = filterFiles(sample, { searchQuery: "architecture" });
  assert.equal(resQuery.length, 1);
  assert.equal(resQuery[0].id, 2);

  // Filter by project ID
  const resProj = filterFiles(sample, { projectId: 10 });
  assert.equal(resProj.length, 1);
  assert.equal(resProj[0].id, 1);

  // Filter by unassigned project
  const resUnassigned = filterFiles(sample, { projectId: "unassigned" });
  assert.equal(resUnassigned.length, 1);
  assert.equal(resUnassigned[0].id, 3);

  // Filter by fileType
  const resType = filterFiles(sample, { fileType: "PDF" });
  assert.equal(resType.length, 1);
  assert.equal(resType[0].id, 1);
});

test("TASK-405: getFileTypeCategory classifies extensions", () => {
  assert.equal(getFileTypeCategory("Figma File"), "image");
  assert.equal(getFileTypeCategory("PNG Image"), "image");
  assert.equal(getFileTypeCategory("SQL File"), "code");
  assert.equal(getFileTypeCategory("MP4 Video"), "video");
  assert.equal(getFileTypeCategory("Excel Spreadsheet"), "spreadsheet");
  assert.equal(getFileTypeCategory("ZIP File"), "archive");
  assert.equal(getFileTypeCategory("PDF Document"), "pdf");
  assert.equal(getFileTypeCategory("Unknown"), "document");
});
