import { useEffect, useState } from "react";
import {
  AlertCircle,
  Copy,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Filter,
  FolderArchive,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../services/api-client.js";

function getFileIcon(type = "") {
  const t = type.toLowerCase();
  if (t.includes("figma") || t.includes("svg") || t.includes("image")) return <FileImage size={18} className="text-emerald" />;
  if (t.includes("sql") || t.includes("code")) return <FileCode size={18} className="text-blue" />;
  if (t.includes("video") || t.includes("mp4")) return <FileVideo size={18} className="text-purple" />;
  if (t.includes("excel") || t.includes("sheet")) return <FileSpreadsheet size={18} className="text-green" />;
  if (t.includes("zip") || t.includes("archive")) return <FolderArchive size={18} className="text-amber" />;
  return <FileText size={18} className="text-muted" />;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function FilesBulkView({ user, activeOrg, userPermissions, onShowNotice }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileType, setNewFileType] = useState("PDF");
  const [newFileSize, setNewFileSize] = useState("500 KB");
  const [submitting, setSubmitting] = useState(false);

  const canUpload = userPermissions.has("files:upload");
  const canDelete = userPermissions.has("files:delete");
  const canUpdate = userPermissions.has("files:update");

  async function loadFiles() {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getFiles(searchQuery ? `q=${encodeURIComponent(searchQuery)}` : "");
      setFiles(res.files || []);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, [activeOrg?.id]);

  function handleSelectAll(e) {
    if (e.target.checked) {
      setSelectedIds(new Set(files.map((f) => f.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function handleToggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!canDelete) {
      onShowNotice({ type: "error", message: "RBAC Denial: You lack 'files:delete' permission." });
      return;
    }

    try {
      setSubmitting(true);
      const ids = Array.from(selectedIds);
      await api.bulkDeleteFiles(ids);
      setFiles((prev) => prev.filter((f) => !selectedIds.has(f.id)));
      onShowNotice({ type: "success", message: `Successfully deleted ${ids.length} files.` });
      setSelectedIds(new Set());
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBulkDuplicate() {
    if (selectedIds.size === 0) return;
    if (!canUpdate) {
      onShowNotice({ type: "error", message: "RBAC Denial: You lack 'files:update' permission." });
      return;
    }

    try {
      setSubmitting(true);
      const ids = Array.from(selectedIds);
      const res = await api.bulkDuplicateFiles(ids);
      setFiles((prev) => [...(res.duplicates || []), ...prev]);
      onShowNotice({ type: "success", message: `Successfully duplicated ${ids.length} files.` });
      setSelectedIds(new Set());
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateFile(e) {
    e.preventDefault();
    if (!newFileName.trim()) return;
    try {
      setSubmitting(true);
      const res = await api.createFile({
        name: newFileName.trim(),
        fileType: newFileType,
        sizeBytes: 1024 * 512,
      });
      setFiles((prev) => [res.file, ...prev]);
      setAddModalOpen(false);
      setNewFileName("");
      onShowNotice({ type: "success", message: "File added successfully." });
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="files-view-container">
      {/* Header */}
      <div className="files-view-header">
        <div className="files-header-left">
          <h2>Files</h2>
          <p>Access, manage, and share your project files with ease.</p>
        </div>

        <div className="files-header-controls">
          <div className="search-bar-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadFiles()}
            />
          </div>

          <button type="button" className="filter-btn" onClick={loadFiles}>
            <Filter size={15} />
            <span>Filter</span>
          </button>

          {canUpload && (
            <button
              type="button"
              className="btn-primary-emerald"
              onClick={() => setAddModalOpen(true)}
            >
              <Plus size={16} />
              <span>Add Files</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="view-error-container">
          <AlertCircle size={20} className="text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {/* Files Table */}
      <div className="files-table-wrapper">
        <table className="files-table">
          <thead>
            <tr>
              <th className="th-checkbox">
                <input
                  type="checkbox"
                  checked={files.length > 0 && selectedIds.size === files.length}
                  onChange={handleSelectAll}
                />
              </th>
              <th>File Name</th>
              <th>Project</th>
              <th>Uploaded By</th>
              <th>Uploaded On</th>
              <th>File Size</th>
              <th>Type</th>
              <th className="th-action">Action</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const isSelected = selectedIds.has(file.id);
              const formattedDate = new Date(file.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <tr key={file.id} className={isSelected ? "row-selected" : ""}>
                  <td className="td-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleOne(file.id)}
                    />
                  </td>
                  <td className="td-file-name">
                    <div className="file-name-cell">
                      {getFileIcon(file.fileType)}
                      <strong>{file.name}</strong>
                    </div>
                  </td>
                  <td>
                    <span className="project-cell-badge">
                      {file.project?.name || "Global Assets"}
                    </span>
                  </td>
                  <td>
                    <div className="uploader-cell">
                      <span className="mini-avatar">
                        {file.uploadedBy?.name ? file.uploadedBy.name[0] : "U"}
                      </span>
                      <span>{file.uploadedBy?.name || "Team Member"}</span>
                    </div>
                  </td>
                  <td className="td-muted">{formattedDate}</td>
                  <td className="td-muted">{formatBytes(file.sizeBytes)}</td>
                  <td>
                    <span className="file-type-pill">{file.fileType}</span>
                  </td>
                  <td className="td-action">
                    <button type="button" className="icon-btn-ghost">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {files.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  {loading ? "Loading files…" : "No files found in this workspace."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Table Pagination Footer */}
      <div className="table-pagination-footer">
        <span className="pagination-info">Showing 1 - {files.length} from {files.length}</span>
        <div className="pagination-pages">
          <button type="button" className="pagination-arrow" disabled>&lt;</button>
          <span className="pagination-current">1</span>
          <button type="button" className="pagination-arrow" disabled>&gt;</button>
        </div>
      </div>

      {/* Floating Bulk Operations Bar */}
      {selectedIds.size > 0 && (
        <div className="floating-bulk-bar">
          <div className="bulk-bar-count">
            <strong>{selectedIds.size}</strong> files selected
          </div>

          <div className="bulk-bar-divider" />

          <button
            type="button"
            className="bulk-action-btn"
            onClick={handleBulkDuplicate}
            disabled={submitting || !canUpdate}
            title={!canUpdate ? "RBAC: Requires files:update" : "Duplicate selected files"}
          >
            <Copy size={15} />
            <span>Duplicate</span>
          </button>

          <button
            type="button"
            className="bulk-action-btn bulk-btn-delete"
            onClick={handleBulkDelete}
            disabled={submitting || !canDelete}
            title={!canDelete ? "RBAC: Requires files:delete" : "Delete selected files"}
          >
            <Trash2 size={15} />
            <span>Delete</span>
          </button>

          <button
            type="button"
            className="bulk-bar-close"
            onClick={() => setSelectedIds(new Set())}
            title="Clear selection"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Add File Modal */}
      {addModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Upload / Add File Asset</h3>
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={() => setAddModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateFile} className="modal-form">
              <div className="form-field">
                <label>File Name</label>
                <input
                  type="text"
                  placeholder="e.g. Design_System_v2.fig"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>File Type</label>
                <select
                  value={newFileType}
                  onChange={(e) => setNewFileType(e.target.value)}
                >
                  <option value="Figma File">Figma File</option>
                  <option value="PDF">PDF</option>
                  <option value="SVG">SVG</option>
                  <option value="Word">Word</option>
                  <option value="Image">Image</option>
                  <option value="SQL File">SQL File</option>
                  <option value="Video">Video</option>
                  <option value="Markdown">Markdown</option>
                  <option value="ZIP File">ZIP File</option>
                  <option value="Excel">Excel</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-emerald"
                  disabled={submitting}
                >
                  {submitting ? "Uploading…" : "Add File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
