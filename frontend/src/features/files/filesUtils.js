/**
 * TeamGuard — File Asset Utilities & Helpers (TASK-405)
 * Pure utility functions for file sorting, filtering, duplicate naming, and formatting.
 */

/**
 * Generates duplicate file name with ' (Copy)' suffix placed before extension.
 * e.g., 'Design_System.fig' -> 'Design_System (Copy).fig'
 * e.g., 'README' -> 'README (Copy)'
 */
export function getDuplicateFileName(name) {
  if (!name || typeof name !== "string") return "Untitled (Copy)";
  const trimmed = name.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot > 0) {
    const base = trimmed.slice(0, lastDot);
    const ext = trimmed.slice(lastDot);
    return `${base} (Copy)${ext}`;
  }
  return `${trimmed} (Copy)`;
}

/**
 * Formats byte values into human-readable strings.
 */
export function formatBytes(bytes) {
  if (!bytes || typeof bytes !== "number" || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/**
 * Pure file sorting function.
 * Supports: 'name', 'sizeBytes', 'createdAt', 'fileType', 'project'.
 */
export function sortFiles(files = [], sortBy = "createdAt", sortOrder = "desc") {
  if (!Array.isArray(files)) return [];
  const dir = sortOrder.toLowerCase() === "asc" ? 1 : -1;

  return [...files].sort((a, b) => {
    switch (sortBy) {
      case "name": {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        return nameA.localeCompare(nameB) * dir;
      }
      case "sizeBytes": {
        const sizeA = Number(a.sizeBytes) || 0;
        const sizeB = Number(b.sizeBytes) || 0;
        return (sizeA - sizeB) * dir;
      }
      case "fileType": {
        const typeA = (a.fileType || "").toLowerCase();
        const typeB = (b.fileType || "").toLowerCase();
        return typeA.localeCompare(typeB) * dir;
      }
      case "project": {
        const projA = (a.project?.name || "Global Assets").toLowerCase();
        const projB = (b.project?.name || "Global Assets").toLowerCase();
        return projA.localeCompare(projB) * dir;
      }
      case "createdAt":
      default: {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return (timeA - timeB) * dir;
      }
    }
  });
}

/**
 * Multi-criteria file filter.
 */
export function filterFiles(files = [], { searchQuery = "", projectId = "ALL", fileType = "ALL" } = {}) {
  if (!Array.isArray(files)) return [];

  const query = searchQuery ? searchQuery.trim().toLowerCase() : "";

  return files.filter((file) => {
    // Search query filter
    if (query) {
      const matchName = (file.name || "").toLowerCase().includes(query);
      const matchType = (file.fileType || "").toLowerCase().includes(query);
      const matchProject = (file.project?.name || "").toLowerCase().includes(query);
      if (!matchName && !matchType && !matchProject) return false;
    }

    // Project filter
    if (projectId && projectId !== "ALL") {
      if (projectId === "unassigned" || projectId === "null" || projectId === 0 || projectId === "0") {
        if (file.projectId !== null && file.projectId !== undefined) return false;
      } else {
        if (Number(file.projectId) !== Number(projectId)) return false;
      }
    }

    // File type filter
    if (fileType && fileType !== "ALL") {
      if ((file.fileType || "").toLowerCase() !== fileType.toLowerCase()) return false;
    }

    return true;
  });
}

/**
 * Maps a fileType string to a visual classification category.
 */
export function getFileTypeCategory(type = "") {
  const t = (type || "").toLowerCase();
  if (t.includes("figma") || t.includes("svg") || t.includes("image") || t.includes("png") || t.includes("jpg")) return "image";
  if (t.includes("sql") || t.includes("code") || t.includes("js") || t.includes("json")) return "code";
  if (t.includes("video") || t.includes("mp4") || t.includes("mov")) return "video";
  if (t.includes("excel") || t.includes("sheet") || t.includes("csv")) return "spreadsheet";
  if (t.includes("zip") || t.includes("archive") || t.includes("tar") || t.includes("gz")) return "archive";
  if (t.includes("pdf")) return "pdf";
  return "document";
}
