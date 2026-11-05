import { useState, useMemo, useRef } from "react";
import { Search, FolderGit2, X, Archive, ArrowRight, ExternalLink, Filter } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

export function ProjectDirectoryModal({
  isOpen,
  onClose,
  projects = [],
  spaces = [],
  activeProjectId = null,
  onSelectProject,
}) {
  const [query, setQuery] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const containerRef = useRef(null);

  useFocusTrap({
    containerRef,
    isOpen,
    onEscape: onClose,
  });

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      // Archive filter
      if (!showArchived && p.isArchived) return false;
      // Space filter
      if (selectedSpaceId !== "ALL") {
        if (selectedSpaceId === "GENERAL" && p.spaceId) return false;
        if (selectedSpaceId !== "GENERAL" && String(p.spaceId) !== String(selectedSpaceId)) return false;
      }
      // Text search
      if (!q) return true;
      const nameMatch = (p.name || "").toLowerCase().includes(q);
      const keyMatch = (p.key || "").toLowerCase().includes(q);
      const descMatch = (p.description || "").toLowerCase().includes(q);
      return nameMatch || keyMatch || descMatch;
    });
  }, [projects, query, selectedSpaceId, showArchived]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace Project Directory"
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <FolderGit2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Project Directory</h2>
              <p className="text-xs text-slate-400">
                Browsing {filteredProjects.length} of {projects.length} workspace projects
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters bar */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              placeholder="Search projects by name, key (e.g. AFTT), or keyword..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {spaces.length > 0 && (
            <select
              value={selectedSpaceId}
              onChange={(e) => setSelectedSpaceId(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Spaces</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="GENERAL">General Workspace</option>
            </select>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0"
            />
            <span>Include Archived</span>
          </label>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {filteredProjects.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FolderGit2 size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No matching projects found</p>
              <p className="text-xs text-slate-600 mt-1">Try adjusting your search query or filters</p>
            </div>
          ) : (
            filteredProjects.map((proj) => {
              const isActive = String(activeProjectId) === String(proj.id);
              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    onSelectProject(proj.id);
                    onClose();
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectProject(proj.id);
                      onClose();
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg border transition cursor-pointer ${
                    isActive
                      ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-300"
                      : "bg-slate-800/40 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: proj.color || "#6366F1" }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs truncate">{proj.name}</span>
                        {proj.key && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 flex-shrink-0">
                            {proj.key}
                          </span>
                        )}
                        {proj.isArchived && (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Archive size={10} /> Archived
                          </span>
                        )}
                      </div>
                      {proj.description && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 max-w-md">
                          {proj.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isActive ? (
                      <span className="text-[11px] font-semibold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/20">
                        Active
                      </span>
                    ) : (
                      <ArrowRight size={14} className="text-slate-500 group-hover:text-slate-300" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong>{filteredProjects.length}</strong> projects
          </span>
          <span>Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-[10px]">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
