import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  X,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Calendar,
  LayoutDashboard,
  CheckSquare,
  FolderGit2,
  FolderPlus,
  Users,
  ShieldCheck,
  ScrollText,
  FileText,
  User,
  Plus,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import {
  getQuickActions,
  filterQuickActions,
  flattenSearchResults,
  getNextNavIndex,
  groupFlattenedItems,
} from "./commandPaletteUtils.js";

export function CommandPaletteModal({
  isOpen,
  onClose,
  permissions = [],
  currentSection = "dashboard",
  onNavigateSection,
  onNavigateTask,
  onOpenProjectWizard,
  onCreateTask,
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [rawResults, setRawResults] = useState({
    projects: [],
    tasks: [],
    members: [],
    files: [],
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Compute available quick actions based on permissions
  const allQuickActions = getQuickActions({ currentSection, permissions });
  const filteredQuickActions = filterQuickActions(allQuickActions, query);

  // Flatten all matching items into a single indexed list
  const flatItems = flattenSearchResults({
    results: rawResults,
    quickActions: filteredQuickActions,
  });

  const grouped = groupFlattenedItems(flatItems);

  // Reset query and focus when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setRawResults({ projects: [], tasks: [], members: [], files: [] });
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Execute debounced search when query changes
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setRawResults({ projects: [], tasks: [], members: [], files: [] });
      setLoading(false);
      setSelectedIndex(0);
      return;
    }

    setLoading(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.globalSearch(trimmed, 6);
        setRawResults(res.results || { projects: [], tasks: [], members: [], files: [] });
        setSelectedIndex(0);
      } catch (err) {
        console.error("Global search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, isOpen]);

  // Ensure selected item stays scrolled into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Execute selection handler
  const handleSelectItem = useCallback(
    (item) => {
      if (!item) return;
      onClose();

      if (item.type === "action") {
        if (item.actionType === "navigate" && onNavigateSection) {
          onNavigateSection(item.targetSection);
        } else if (item.actionType === "create-project" && onOpenProjectWizard) {
          onOpenProjectWizard();
        } else if (item.actionType === "create-task" && onCreateTask) {
          onCreateTask();
        } else if (item.actionType === "create-task" && onNavigateSection) {
          onNavigateSection("tasks");
        }
      } else if (item.type === "project") {
        if (onNavigateSection) {
          onNavigateSection("tasks");
        }
      } else if (item.type === "task") {
        if (onNavigateTask) {
          onNavigateTask(item.payload.id);
        } else if (onNavigateSection) {
          onNavigateSection("tasks");
          window.dispatchEvent(
            new CustomEvent("teamguard:navigate-task", {
              detail: { taskId: Number(item.payload.id) },
            })
          );
        }
      } else if (item.type === "member") {
        if (onNavigateSection) {
          onNavigateSection("members");
        }
      } else if (item.type === "file") {
        if (onNavigateSection) {
          onNavigateSection("files");
        }
      }
    },
    [onClose, onNavigateSection, onNavigateTask, onOpenProjectWizard, onCreateTask]
  );

  // Keyboard navigation listener (ArrowDown, ArrowUp, Enter, Escape)
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => getNextNavIndex(prev, flatItems.length, "down"));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => getNextNavIndex(prev, flatItems.length, "up"));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems.length > 0 && selectedIndex >= 0 && selectedIndex < flatItems.length) {
          handleSelectItem(flatItems[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [isOpen, flatItems, selectedIndex, handleSelectItem, onClose]
  );

  if (!isOpen) return null;

  function renderItemIcon(item) {
    if (item.type === "action") {
      switch (item.iconName) {
        case "LayoutDashboard":
          return <LayoutDashboard size={16} className="cmd-icon-action" />;
        case "CheckSquare":
          return <CheckSquare size={16} className="cmd-icon-action" />;
        case "FolderGit2":
          return <FolderGit2 size={16} className="cmd-icon-action" />;
        case "FolderPlus":
          return <FolderPlus size={16} className="cmd-icon-create" />;
        case "Plus":
          return <Plus size={16} className="cmd-icon-create" />;
        case "Users":
          return <Users size={16} className="cmd-icon-action" />;
        case "ShieldCheck":
          return <ShieldCheck size={16} className="cmd-icon-action" />;
        case "ScrollText":
          return <ScrollText size={16} className="cmd-icon-action" />;
        case "FileText":
          return <FileText size={16} className="cmd-icon-action" />;
        case "Calendar":
          return <Calendar size={16} className="cmd-icon-action" />;
        case "User":
          return <User size={16} className="cmd-icon-action" />;
        default:
          return <ExternalLink size={16} className="cmd-icon-action" />;
      }
    }
    if (item.type === "project") {
      return <FolderGit2 size={16} className="cmd-icon-project" />;
    }
    if (item.type === "task") {
      return <CheckSquare size={16} className="cmd-icon-task" />;
    }
    if (item.type === "member") {
      if (item.avatarUrl) {
        return <img src={item.avatarUrl} alt={item.title} className="cmd-avatar-img" />;
      }
      return (
        <span className="cmd-avatar-fallback">
          {item.title ? item.title[0].toUpperCase() : "U"}
        </span>
      );
    }
    if (item.type === "file") {
      return <FileText size={16} className="cmd-icon-file" />;
    }
    return <Search size={16} />;
  }

  return (
    <div
      className="cmd-palette-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Global Search and Command Palette"
    >
      <div
        className="cmd-palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="cmd-input-container">
          <Search size={18} className="cmd-search-lead-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cmd-search-input"
            placeholder="Type a command, task, project, or member name… (ESC to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-autocomplete="list"
            aria-controls="cmd-results-list"
          />
          {loading && <Loader2 size={16} className="cmd-loading-spinner animate-spin" />}
          {query && !loading && (
            <button
              type="button"
              className="cmd-clear-btn"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="Clear input"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Results Container */}
        <div className="cmd-results-container" ref={listRef} id="cmd-results-list" role="listbox">
          {flatItems.length === 0 ? (
            <div className="cmd-empty-state">
              <Search size={32} className="cmd-empty-icon" />
              <p className="cmd-empty-title">No matching results found</p>
              <span className="cmd-empty-hint">
                Try searching for a project key, task title, member email, or keyword.
              </span>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.category} className="cmd-group-section">
                <div className="cmd-group-header">
                  <span>{group.category}</span>
                  <span className="cmd-group-count">{group.items.length}</span>
                </div>
                <div className="cmd-group-items">
                  {group.items.map((item) => {
                    const isSelected = item.globalIndex === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        data-index={item.globalIndex}
                        className={`cmd-item-row ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectItem(item)}
                        onMouseEnter={() => setSelectedIndex(item.globalIndex)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div className="cmd-item-icon-col">{renderItemIcon(item)}</div>
                        <div className="cmd-item-body">
                          <div className="cmd-item-title-row">
                            <span className="cmd-item-title">{item.title}</span>
                            {item.status && (
                              <span className={`cmd-status-badge status-${item.status.toLowerCase()}`}>
                                {item.status}
                              </span>
                            )}
                            {item.role && (
                              <span className="cmd-role-badge">{item.role}</span>
                            )}
                          </div>
                          {item.subtitle && (
                            <span className="cmd-item-subtitle">{item.subtitle}</span>
                          )}
                        </div>
                        {isSelected && (
                          <div className="cmd-item-enter-hint">
                            <span>Select</span>
                            <CornerDownLeft size={12} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Command Palette Keyboard Hints Footer */}
        <div className="cmd-footer-bar">
          <div className="cmd-footer-shortcuts">
            <span className="cmd-shortcut-hint">
              <kbd><ArrowUp size={11} /></kbd>
              <kbd><ArrowDown size={11} /></kbd>
              <span>to navigate</span>
            </span>
            <span className="cmd-shortcut-hint">
              <kbd><CornerDownLeft size={11} /></kbd>
              <span>to select</span>
            </span>
            <span className="cmd-shortcut-hint">
              <kbd>ESC</kbd>
              <span>to dismiss</span>
            </span>
          </div>
          <div className="cmd-footer-meta">
            <span>{flatItems.length} {flatItems.length === 1 ? "result" : "results"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
