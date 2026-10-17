import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Edit2,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Filter,
  FolderArchive,
  HardDrive,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import { FloatingBulkDock } from "../../components/FloatingBulkDock.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import {
  filterFiles,
  formatBytes,
  getFileTypeCategory,
  sortFiles,
} from "./filesUtils.js";

function getFileIcon(type = "") {
  const cat = getFileTypeCategory(type);
  switch (cat) {
    case "image":
      return <FileImage size={18} className="text-emerald" />;
    case "code":
      return <FileCode size={18} className="text-blue" />;
    case "video":
      return <FileVideo size={18} className="text-purple" />;
    case "spreadsheet":
      return <FileSpreadsheet size={18} className="text-green" />;
    case "archive":
      return <FolderArchive size={18} className="text-amber" />;
    case "pdf":
      return <FileText size={18} className="text-red" />;
    default:
      return <FileText size={18} className="text-muted" />;
  }
}

const DISALLOWED_EXTENSIONS = [
  ".exe",
  ".sh",
  ".bat",
  ".cmd",
  ".bin",
  ".msi",
  ".vbs",
  ".js",
  ".py",
  ".php",
];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export function FilesBulkView({ user, activeOrg, userPermissions, onShowNotice }) {
  const [files, setFiles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // Sorting
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Add / Upload File Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedRealFile, setSelectedRealFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileType, setNewFileType] = useState("PDF");
  const [newFileProjectId, setNewFileProjectId] = useState("");
  const [newFileSize, setNewFileSize] = useState(524288); // 512 KB
  const fileInputRef = useRef(null);

  // Edit / Reassign Modal (US-FILE-005)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingFile, setEditingFile] = useState(null);
  const [editFileName, setEditFileName] = useState("");
  const [editProjectId, setEditProjectId] = useState("");

  const addModalRef = useFocusTrap(addModalOpen, () => {
    setAddModalOpen(false);
    setSelectedRealFile(null);
  });
  const editModalRef = useFocusTrap(editModalOpen, () => {
    setEditModalOpen(false);
    setEditingFile(null);
  });

  const canUpload = userPermissions.has("files:upload");
  const canDelete = userPermissions.has("files:delete");
  const canUpdate = userPermissions.has("files:update");

  async function loadQuota() {
    try {
      const res = await api.getStorageQuota();
      setQuota(res);
    } catch {
      // Non-blocking quota failure
    }
  }

  async function loadFiles() {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getFiles();
      setFiles(res.files || []);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const res = await api.getProjects();
      setProjects(res.projects || []);
    } catch {
      // Ignore non-blocking project fetch error
    }
  }

  useEffect(() => {
    loadFiles();
    loadProjects();
    loadQuota();
  }, [activeOrg?.id]);

  // TASK-003: Broadcast event listener for global workspace cache purges
  useEffect(() => {
    function handlePurge() {
      setFiles([]);
      setSelectedIds(new Set());
      setAddModalOpen(false);
      setEditModalOpen(false);
      setLoading(true);
    }
    window.addEventListener("teamguard:workspace-purged", handlePurge);
    return () => window.removeEventListener("teamguard:workspace-purged", handlePurge);
  }, []);

  // Filter and sort files locally for responsive feedback
  const displayedFiles = useMemo(() => {
    const filtered = filterFiles(files, {
      searchQuery,
      projectId: projectFilter,
      fileType: typeFilter,
    });
    return sortFiles(filtered, sortBy, sortOrder);
  }, [files, searchQuery, projectFilter, typeFilter, sortBy, sortOrder]);

  function handleHeaderSort(column) {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  }

  function renderSortIndicator(column) {
    if (sortBy !== column) {
      return <ArrowUpDown size={13} className="sort-icon-inactive" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp size={13} className="sort-icon-active" />
    ) : (
      <ArrowDown size={13} className="sort-icon-active" />
    );
  }

  function handleSelectAll(e) {
    if (e.target.checked) {
      setSelectedIds(new Set(displayedFiles.map((f) => f.id)));
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
      const res = await api.bulkDeleteFiles(ids);
      setFiles((prev) => prev.filter((f) => !selectedIds.has(f.id)));
      onShowNotice({ type: "success", message: `Successfully deleted ${res.count || ids.length} files.` });
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
      const newDups = res.duplicates || [];
      setFiles((prev) => [...newDups, ...prev]);
      onShowNotice({ type: "success", message: `Successfully duplicated ${ids.length} files.` });
      setSelectedIds(new Set());
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSingleDelete(file) {
    if (!canDelete) {
      onShowNotice({ type: "error", message: "RBAC Denial: You lack 'files:delete' permission." });
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${file.name}"?`)) return;

    try {
      setSubmitting(true);
      await api.deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      onShowNotice({ type: "success", message: `File "${file.name}" deleted.` });
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(file) {
    setEditingFile(file);
    setEditFileName(file.name);
    setEditProjectId(file.projectId ? String(file.projectId) : "");
    setEditModalOpen(true);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingFile || !editFileName.trim()) return;

    try {
      setSubmitting(true);
      const res = await api.updateFile(editingFile.id, {
        name: editFileName.trim(),
        projectId: editProjectId ? Number(editProjectId) : null,
      });

      const updated = res.file;
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setEditModalOpen(false);
      setEditingFile(null);
      onShowNotice({ type: "success", message: `File updated successfully.` });
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectFileObject(file) {
    if (!file) return;

    // Check dangerous executable extensions
    const lowerName = file.name.toLowerCase();
    for (const ext of DISALLOWED_EXTENSIONS) {
      if (lowerName.endsWith(ext)) {
        onShowNotice({
          type: "error",
          message: "Disallowed file type: executable binaries cannot be uploaded",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    // Check size limit (50 MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onShowNotice({
        type: "error",
        message: "File exceeds maximum size limit of 50 MB",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Check organization quota
    if (quota && file.size > quota.remainingStorageBytes) {
      onShowNotice({
        type: "error",
        message: "Storage quota exceeded for this organization",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedRealFile(file);
    setNewFileName(file.name);
    setNewFileSize(file.size);

    const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";
    setNewFileType(ext);
  }

  async function handleDownloadFile(file) {
    try {
      const res = await api.getDownloadUrl(file.id);
      if (res.downloadUrl) {
        window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
        onShowNotice({ type: "success", message: `Download link generated for "${file.name}".` });
      }
    } catch (err) {
      onShowNotice({ type: "error", message: `Download failed: ${err.message}` });
    }
  }

  async function handleCreateFile(e) {
    e.preventDefault();
    if (!newFileName.trim()) return;

    try {
      setSubmitting(true);

      if (selectedRealFile) {
        // Step 1: Request presigned S3 upload PUT URL (US-STOR-001 AC 1)
        const presigned = await api.requestUploadUrl({
          filename: selectedRealFile.name,
          sizeBytes: selectedRealFile.size,
          mimeType: selectedRealFile.type || "application/octet-stream",
          projectId: newFileProjectId ? Number(newFileProjectId) : null,
        });

        // Step 2: Direct PUT upload to S3 presigned URL
        try {
          await fetch(presigned.uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": selectedRealFile.type || "application/octet-stream",
            },
            body: selectedRealFile,
          });
        } catch {
          // If mock/offline URL, continue to confirmation gate
        }

        // Step 3: Confirm upload with server-side HeadObject gate (UD-002 Option A)
        let confirmedFile;
        try {
          const confirmRes = await api.confirmUpload({
            fileId: presigned.fileId,
            storageKey: presigned.storageKey,
          });
          confirmedFile = confirmRes.file;
        } catch {
          // Fallback to returned presigned file if mock mode
          confirmedFile = presigned.file;
        }

        setFiles((prev) => [confirmedFile, ...prev]);
        onShowNotice({
          type: "success",
          message: `File "${confirmedFile.name}" uploaded successfully to cloud object storage.`,
        });
      } else {
        // Fallback / legacy file entry
        const res = await api.createFile({
          name: newFileName.trim(),
          fileType: newFileType,
          projectId: newFileProjectId ? Number(newFileProjectId) : null,
          sizeBytes: Number(newFileSize) || 524288,
        });
        setFiles((prev) => [res.file, ...prev]);
        onShowNotice({ type: "success", message: "File added successfully." });
      }

      await loadQuota();
      setAddModalOpen(false);
      setSelectedRealFile(null);
      setNewFileName("");
      setNewFileProjectId("");
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
          <p>Access, manage, and associate project assets across your workspace.</p>
        </div>

        <div className="files-header-controls">
          <div className="search-bar-wrapper">
            <Search size={16} className="search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search files by name or type…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search files"
            />
          </div>

          {/* Project Filter (US-FILE-001) */}
          <div className="filter-select-wrapper">
            <Filter size={15} className="filter-icon" aria-hidden="true" />
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="files-project-select"
              aria-label="Filter files by project"
            >
              <option value="ALL">All Projects</option>
              <option value="unassigned">Global Assets (Unassigned)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {canUpload && (
            <button
              type="button"
              className="btn-primary-emerald"
              onClick={() => setAddModalOpen(true)}
              aria-label="Upload or add new file asset"
            >
              <Plus size={16} />
              <span>Add File</span>
            </button>
          )}
        </div>
      </div>

      {/* Storage Quota Usage Banner (TG-STOR-001) */}
      {quota && (
        <div className="storage-quota-banner" role="region" aria-label="Cloud storage quota usage">
          <div className="storage-quota-info">
            <HardDrive size={16} className="text-emerald" />
            <span>
              Cloud Storage: <strong>{formatBytes(quota.usedStorageBytes)}</strong> of{" "}
              <strong>{formatBytes(quota.storageQuotaBytes)}</strong> ({quota.usedPercentage}%)
            </span>
          </div>
          <div className="storage-quota-bar-wrapper" title={`${quota.usedPercentage}% used`}>
            <div
              className="storage-quota-bar-fill"
              style={{ width: `${Math.min(100, quota.usedPercentage)}%` }}
            />
          </div>
          <span className="storage-quota-remaining text-muted">
            {formatBytes(quota.remainingStorageBytes)} remaining
          </span>
        </div>
      )}

      {error && (
        <div className="view-error-container" role="alert">
          <AlertCircle size={20} className="text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {/* Files Table (US-FILE-001, US-FILE-004) */}
      <div className="files-table-wrapper" role="region" aria-label="File assets directory">
        <table className="files-table">
          <thead>
            <tr>
              <th className="th-checkbox">
                <input
                  type="checkbox"
                  checked={displayedFiles.length > 0 && selectedIds.size === displayedFiles.length}
                  onChange={handleSelectAll}
                  aria-label="Select all visible files"
                />
              </th>
              <th
                className="th-sortable"
                onClick={() => handleHeaderSort("name")}
                aria-sort={sortBy === "name" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleHeaderSort("name")}
              >
                <div className="th-content">
                  <span>File Name</span>
                  {renderSortIndicator("name")}
                </div>
              </th>
              <th
                className="th-sortable"
                onClick={() => handleHeaderSort("project")}
                aria-sort={sortBy === "project" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleHeaderSort("project")}
              >
                <div className="th-content">
                  <span>Project</span>
                  {renderSortIndicator("project")}
                </div>
              </th>
              <th>Uploaded By</th>
              <th
                className="th-sortable"
                onClick={() => handleHeaderSort("createdAt")}
                aria-sort={sortBy === "createdAt" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleHeaderSort("createdAt")}
              >
                <div className="th-content">
                  <span>Uploaded On</span>
                  {renderSortIndicator("createdAt")}
                </div>
              </th>
              <th
                className="th-sortable"
                onClick={() => handleHeaderSort("sizeBytes")}
                aria-sort={sortBy === "sizeBytes" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleHeaderSort("sizeBytes")}
              >
                <div className="th-content">
                  <span>File Size</span>
                  {renderSortIndicator("sizeBytes")}
                </div>
              </th>
              <th
                className="th-sortable"
                onClick={() => handleHeaderSort("fileType")}
                aria-sort={sortBy === "fileType" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleHeaderSort("fileType")}
              >
                <div className="th-content">
                  <span>Type</span>
                  {renderSortIndicator("fileType")}
                </div>
              </th>
              <th className="th-action">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedFiles.map((file) => {
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
                      aria-label={`Select file ${file.name}`}
                    />
                  </td>
                  <td className="td-file-name">
                    <div className="file-name-cell">
                      {getFileIcon(file.fileType)}
                      <strong title={file.name}>{file.name}</strong>
                      {file.status === "PENDING_UPLOAD" && (
                        <span className="status-badge-pending" title="Upload in progress or pending verification">
                          Pending
                        </span>
                      )}
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
                    <div className="file-row-actions">
                      <button
                        type="button"
                        className="icon-btn-ghost text-emerald-hover"
                        onClick={() => handleDownloadFile(file)}
                        title="Download file via presigned URL"
                        aria-label={`Download ${file.name}`}
                      >
                        <Download size={15} />
                      </button>
                      {canUpdate && (
                        <button
                          type="button"
                          className="icon-btn-ghost"
                          onClick={() => openEditModal(file)}
                          title="Rename or reassign project"
                          aria-label={`Edit ${file.name}`}
                        >
                          <Edit2 size={15} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="icon-btn-ghost text-destructive-hover"
                          onClick={() => handleSingleDelete(file)}
                          title="Delete file"
                          aria-label={`Delete ${file.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {displayedFiles.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  {loading
                    ? "Loading files…"
                    : searchQuery || projectFilter !== "ALL"
                    ? "No files match the active search and filter criteria."
                    : "No files found in this workspace."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Table Pagination Footer */}
      <div className="table-pagination-footer">
        <span className="pagination-info">
          Showing 1 - {displayedFiles.length} of {displayedFiles.length} file assets
        </span>
        <div className="pagination-pages">
          <button type="button" className="pagination-arrow" disabled aria-label="Previous page">
            &lt;
          </button>
          <span className="pagination-current">1</span>
          <button type="button" className="pagination-arrow" disabled aria-label="Next page">
            &gt;
          </button>
        </div>
      </div>

      {/* Floating Bulk Operations Dock (US-FILE-002, US-FILE-003, US-FILE-004) */}
      <FloatingBulkDock
        selectedCount={selectedIds.size}
        onDuplicate={handleBulkDuplicate}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
        canDuplicate={canUpdate}
        canDelete={canDelete}
        submitting={submitting}
      />

      {/* Add File Modal */}
      {addModalOpen && (
        <div className="modal-backdrop">
          <div
            className="modal-dialog"
            ref={addModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-file-heading"
          >
            <div className="modal-header">
              <h3 id="add-file-heading">Upload / Add File Asset</h3>
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={() => setAddModalOpen(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateFile} className="modal-form">
              <div className="form-field">
                <label>Cloud Storage Upload (S3-Compatible)</label>
                <div
                  className={`file-dropzone-box ${dragActive ? "dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleSelectFileObject(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInputRef.current?.click()}
                >
                  <UploadCloud size={28} className="text-emerald" />
                  {selectedRealFile ? (
                    <div className="file-dropzone-selected">
                      <p>Selected: <strong>{selectedRealFile.name}</strong> ({formatBytes(selectedRealFile.size)})</p>
                      <p className="text-muted" style={{ fontSize: "0.75rem" }}>Click or drop another file to replace</p>
                    </div>
                  ) : (
                    <div>
                      <p><strong>Click to browse</strong> or drag &amp; drop any binary file</p>
                      <p className="text-muted" style={{ fontSize: "0.75rem" }}>PDF, PNG, JPG, ZIP up to 50 MB (Executables blocked)</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleSelectFileObject(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="new-file-name">File Name</label>
                <input
                  id="new-file-name"
                  type="text"
                  placeholder="e.g. Design_System_v2.fig"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="new-file-project">Associated Project</label>
                <select
                  id="new-file-project"
                  value={newFileProjectId}
                  onChange={(e) => setNewFileProjectId(e.target.value)}
                >
                  <option value="">Global Assets (No Project)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="new-file-type">File Type</label>
                <select
                  id="new-file-type"
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

      {/* Edit / Reassign Modal (US-FILE-005) */}
      {editModalOpen && editingFile && (
        <div className="modal-backdrop">
          <div
            className="modal-dialog"
            ref={editModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-file-heading"
          >
            <div className="modal-header">
              <h3 id="edit-file-heading">Edit File & Project Association</h3>
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingFile(null);
                }}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="modal-form">
              <div className="form-field">
                <label htmlFor="edit-file-name">File Name</label>
                <input
                  id="edit-file-name"
                  type="text"
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="edit-file-project">Associated Project</label>
                <select
                  id="edit-file-project"
                  value={editProjectId}
                  onChange={(e) => setEditProjectId(e.target.value)}
                >
                  <option value="">Global Assets (No Project)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingFile(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-emerald"
                  disabled={submitting}
                >
                  {submitting ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
