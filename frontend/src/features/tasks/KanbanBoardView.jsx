import { useEffect, useState, useRef } from "react";
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckSquare,
  Edit3,
  Eye,
  Filter,
  Inbox,
  Kanban,
  Layers,
  List,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Table,
  User,
  X,
} from "lucide-react";
import { api } from "../../services/api-client.js";
import { LoadingView } from "../../components/LoadingView.jsx";
import { getWorkspaceEventStream } from "../../services/eventStream.js";
import {
  applyRealtimeTaskCreate,
  applyRealtimeTaskUpdate,
  applyRealtimeTaskDelete,
} from "../sync/syncUtils.js";
import { TaskDetailDrawer } from "./TaskDetailDrawer.jsx";
import { TaskListView } from "./TaskListView.jsx";
import { TaskTableView } from "./TaskTableView.jsx";
import { DueDateBadge } from "./DueDateBadge.jsx";
import { ColumnQuickAdd } from "./ColumnQuickAdd.jsx";
import { CalendarView } from "../calendar/CalendarView.jsx";
import { ProjectChatView } from "./ProjectChatView.jsx";
import { Calendar as CalendarIcon, Flag } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

const COLUMNS = [
  { id: "TODO", label: "To do", dotColor: "#A855F7" },
  { id: "IN_PROGRESS", label: "In Progress", dotColor: "#3B82F6" },
  { id: "REVISION", label: "Revision", dotColor: "#F59E0B" },
  { id: "DONE", label: "Done", dotColor: "#10B981" },
];

const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
function getAvatarColor(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getAvatarInitial(name) {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getPriorityFlag(priority) {
  switch (priority) {
    case "URGENT":
      return <Flag size={13} className="text-red-500 fill-red-500" style={{ color: "#ef4444", fill: "#ef4444" }} />;
    case "HIGH":
      return <Flag size={13} className="text-orange-500 fill-orange-500" style={{ color: "#f97316", fill: "#f97316" }} />;
    case "MEDIUM":
      return <Flag size={13} className="text-blue-500 fill-blue-500" style={{ color: "#3b82f6", fill: "#3b82f6" }} />;
    case "LOW":
      return <Flag size={13} className="text-slate-400 fill-slate-400" style={{ color: "#94a3b8", fill: "#94a3b8" }} />;
    default:
      return null;
  }
}


export function KanbanBoardView({
  user,
  activeOrg,
  userPermissions,
  onShowNotice,
  initialProjectId = null,
  initialViewType = null,
  onViewTypeChange = null,
  onProjectChange = null,
}) {
  const resolveInitialViewMode = (type) => {
    if (type === "l" || type === "list") return "list";
    if (type === "gr" || type === "table") return "table";
    if (type === "c" || type === "calendar") return "calendar";
    if (type === "chat") return "chat";
    try {
      const saved = localStorage.getItem("teamguard_pref_view");
      if (saved && ["board", "list", "table", "calendar", "chat"].includes(saved)) {
        return saved;
      }
    } catch {}
    return "board";
  };

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewModeState] = useState(() => resolveInitialViewMode(initialViewType)); // "board" | "list" | "table"
  const [syncStatus, setSyncStatus] = useState("disconnected"); // TASK-503 / UD-003

  // Search & Multi-Parameter Filter state (TASK-206)
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProject, setFilterProjectState] = useState(() => (initialProjectId ? String(initialProjectId) : "ALL"));
  const [filterAssignee, setFilterAssignee] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [sortBy, setSortBy] = useState("default");
  const [activeColumnMenu, setActiveColumnMenu] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [updatingBulkStatus, setUpdatingBulkStatus] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState("TODO");

  const setViewMode = (newMode) => {
    setViewModeState(newMode);
    try {
      localStorage.setItem("teamguard_pref_view", newMode);
    } catch {}
    if (onViewTypeChange) {
      const code =
        newMode === "list"
          ? "l"
          : newMode === "table"
          ? "gr"
          : newMode === "calendar"
          ? "c"
          : newMode === "chat"
          ? "chat"
          : "b";
      onViewTypeChange(code);
    }
  };

  const setFilterProject = (projId) => {
    setFilterProjectState(projId);
    if (onProjectChange && projId !== "ALL") {
      onProjectChange(projId);
    }
  };

  // Sync when initialProjectId changes
  useEffect(() => {
    if (initialProjectId) {
      setFilterProjectState(String(initialProjectId));
      if (!newProjectId) {
        setNewProjectId(String(initialProjectId));
      }
    }
  }, [initialProjectId]);

  // Sync when initialViewType changes
  useEffect(() => {
    if (initialViewType) {
      setViewModeState(resolveInitialViewMode(initialViewType));
    }
  }, [initialViewType]);

  // Pagination state (TASK-206)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Create Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newProjectId, setNewProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const createTaskModalRef = useRef(null);

  useFocusTrap({
    containerRef: createTaskModalRef,
    isOpen: createModalOpen,
    onEscape: () => setCreateModalOpen(false),
  });

  // Detail Drawer state (TASK-204)
  const [editingTask, setEditingTask] = useState(null);

  // Native HTML5 & Pointer Drag-and-Drop state (TASK-204)
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const draggedTaskRef = useRef(null);
  const dragEnterCountRef = useRef({});
  const wasDraggingRef = useRef(false);

  // Permission checks
  const canCreateTask = userPermissions.has("task:create");
  const canUpdateAny = userPermissions.has("task:update:any") || userPermissions.has("task:manage");
  const canUpdateOwn = userPermissions.has("task:update:own");
  const canUpdateAssigned = userPermissions.has("task:update:assigned");
  const canAssign = userPermissions.has("task:assign") || userPermissions.has("task:manage") || canUpdateAny;
  const canManageProjects = userPermissions.has("project:manage") || userPermissions.has("task:manage") || canUpdateAny;
  const canDeleteTask = userPermissions.has("task:delete") || canUpdateAny;
  const selectedProject = projects.find((p) => String(p.id) === String(filterProject));
  const isSelectedProjectArchived = selectedProject?.isArchived === true;

  async function loadTasks() {
    try {
      setLoading(true);
      setError(null);
      const [tasksRes, projectsRes, membersRes] = await Promise.all([
        api.getTasks(),
        api.getProjects(),
        api.getMembers().catch(() => ({ members: [] })),
      ]);
      const fetchedTasks = tasksRes.tasks || [];
      const fetchedProjects = projectsRes.projects || [];
      const activeProjects = fetchedProjects.filter((p) => !p.isArchived);

      setTasks(fetchedTasks);
      setProjects(fetchedProjects);
      setMembers(membersRes.members || []);

      if (activeProjects.length > 0) {
        if (!filterProject || filterProject === "ALL") {
          const defaultProject = activeProjects[0];
          setFilterProjectState(String(defaultProject.id));
          setNewProjectId(String(defaultProject.id));
          if (onProjectChange) {
            onProjectChange(defaultProject.id);
          }
        } else if (!newProjectId) {
          setNewProjectId(String(activeProjects[0].id));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, [activeOrg?.id]);

  // TASK-503: Real-Time State Synchronization via SSE Streams (UD-003)
  useEffect(() => {
    if (!activeOrg?.id) return;

    const stream = getWorkspaceEventStream();
    const unsubStatus = stream.onStatusChange((status) => {
      setSyncStatus(status);
    });

    const unsubCreate = stream.on("task:created", (payload) => {
      if (!payload?.task) return;
      setTasks((prev) => applyRealtimeTaskCreate(prev, payload.task));
    });

    const unsubUpdate = stream.on("task:updated", (payload) => {
      if (!payload) return;
      setTasks((prev) => applyRealtimeTaskUpdate(prev, payload));
      const targetId = Number(payload.taskId || payload.task?.id);
      setEditingTask((prev) =>
        prev && Number(prev.id) === targetId
          ? { ...prev, ...(payload.task || {}), ...(payload.changes || {}) }
          : prev
      );
    });

    const unsubDelete = stream.on("task:deleted", (payload) => {
      if (!payload?.taskId) return;
      setTasks((prev) => applyRealtimeTaskDelete(prev, payload.taskId));
      setEditingTask((prev) =>
        prev && Number(prev.id) === Number(payload.taskId) ? null : prev
      );
    });

    const unsubReconcile = stream.on("sync:reconcile", () => {
      loadTasks();
    });

    stream.connect();

    return () => {
      unsubStatus();
      unsubCreate();
      unsubUpdate();
      unsubDelete();
      unsubReconcile();
      stream.disconnect();
    };
  }, [activeOrg?.id]);

  // TASK-003: Broadcast event listener for global workspace cache purges
  useEffect(() => {
    function handlePurge() {
      setTasks([]);
      setProjects([]);
      setMembers([]);
      setEditingTask(null);
      setCreateModalOpen(false);
      setLoading(true);
    }
    window.addEventListener("teamguard:workspace-purged", handlePurge);
    return () => window.removeEventListener("teamguard:workspace-purged", handlePurge);
  }, []);

  // TASK-304: Deep-link task navigation from notification drawer
  useEffect(() => {
    async function handleNavigate(e) {
      const taskId = e.detail?.taskId;
      if (!taskId) return;
      let target = tasks.find((t) => t.id === Number(taskId));
      if (!target) {
        try {
          const res = await api.getTask(taskId);
          target = res.task || res;
        } catch {
          // ignore error
        }
      }
      if (target) {
        openTaskDetail(target);
      }
    }
    window.addEventListener("teamguard:navigate-task", handleNavigate);
    return () => window.removeEventListener("teamguard:navigate-task", handleNavigate);
  }, [tasks]);

  // Close column menu on outside click
  useEffect(() => {
    function handleClickOutside() {
      setActiveColumnMenu(null);
    }
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  function toggleColumnMenu(colId) {
    setActiveColumnMenu((prev) => (prev === colId ? null : colId));
  }

  function toggleTaskSelection(taskId) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function handleSelectAllInColumn(colId, colTasks) {
    const ids = colTasks.map((t) => t.id);
    setSelectedTaskIds(new Set(ids));
    setBulkSelectionMode(true);
    setActiveColumnMenu(null);
  }

  async function handleBulkUpdateStatus(newStatus) {
    if (selectedTaskIds.size === 0) return;
    setUpdatingBulkStatus(true);
    try {
      const ids = Array.from(selectedTaskIds);
      await Promise.all(ids.map((id) => api.updateTask(id, { status: newStatus })));
      setTasks((prev) =>
        prev.map((t) => (selectedTaskIds.has(t.id) ? { ...t, status: newStatus } : t))
      );
      const targetLabel = COLUMNS.find((c) => c.id === newStatus)?.label || newStatus;
      onShowNotice({
        type: "success",
        message: `Updated status of ${ids.length} tasks to "${targetLabel}".`,
      });
      setSelectedTaskIds(new Set());
      setBulkSelectionMode(false);
      setActiveColumnMenu(null);
    } catch (err) {
      onShowNotice({ type: "error", message: `Failed to update status: ${err.message}` });
    } finally {
      setUpdatingBulkStatus(false);
    }
  }

  async function handleMoveAllColumnTasks(sourceColId, targetColId, colTasks) {
    if (colTasks.length === 0) return;
    setActiveColumnMenu(null);
    setUpdatingBulkStatus(true);
    try {
      const ids = colTasks.map((t) => t.id);
      await Promise.all(ids.map((id) => api.updateTask(id, { status: targetColId })));
      setTasks((prev) =>
        prev.map((t) => (ids.includes(t.id) ? { ...t, status: targetColId } : t))
      );
      const targetLabel = COLUMNS.find((c) => c.id === targetColId)?.label || targetColId;
      onShowNotice({
        type: "success",
        message: `Moved all ${ids.length} tasks to "${targetLabel}".`,
      });
    } catch (err) {
      onShowNotice({ type: "error", message: `Failed to move column tasks: ${err.message}` });
    } finally {
      setUpdatingBulkStatus(false);
    }
  }

  // Reset pagination page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterProject, filterAssignee, filterStatus, filterPriority, sortBy, pageSize]);

  // US-A11Y-002: Listen for global 'C' key quick create task trigger
  useEffect(() => {
    function handleQuickCreate() {
      if (canCreateTask) {
        setCreateModalOpen(true);
      }
    }
    window.addEventListener("teamguard:quick-create-task", handleQuickCreate);
    return () => window.removeEventListener("teamguard:quick-create-task", handleQuickCreate);
  }, [canCreateTask]);

  function canEditTask(task) {
    if (!task) return false;
    if (task.project?.isArchived) return false;
    if (canUpdateAny) return true;
    if (canUpdateOwn && task.creatorId === user.id) return true;
    if (canUpdateAssigned && task.assigneeId === user.id) return true;
    return false;
  }

  async function openTaskDetail(task) {
    setEditingTask(task);
    try {
      const res = await api.getSubtasks(task.id);
      if (res && res.subtasks) {
        setEditingTask((prev) =>
          prev && prev.id === task.id ? { ...prev, subtasks: res.subtasks } : prev
        );
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, subtasks: res.subtasks } : t))
        );
      }
    } catch {
      // Fallback to task's embedded subtasks
    }
  }

  function handleSubtasksChange(updatedSubtasks) {
    if (!editingTask) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === editingTask.id ? { ...t, subtasks: updatedSubtasks } : t
      )
    );
    setEditingTask((prev) =>
      prev ? { ...prev, subtasks: updatedSubtasks } : null
    );
  }

  function handleCommentsCountChange(taskId, newCount) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, commentsCount: newCount } : t))
    );
    if (editingTask && editingTask.id === taskId) {
      setEditingTask((prev) => ({ ...prev, commentsCount: newCount }));
    }
  }

  // Status transition with optimistic update and rollback (TASK-204)
  async function handleStatusChange(taskId, newStatus, e) {
    if (e) e.stopPropagation();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === newStatus) return;

    if (!canEditTask(task)) {
      onShowNotice({
        type: "error",
        message: `ABAC Denial: You do not have permission to edit this task (assigned to ${task.assignee?.name || "another user"}). Only the assignee or manager can update it.`,
      });
      return;
    }

    const previousTasks = [...tasks];
    // Optimistic UI state update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              completedAt: newStatus === "DONE" ? new Date().toISOString() : null,
            }
          : t
      )
    );

    try {
      const res = await api.updateTask(taskId, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
      onShowNotice({
        type: "success",
        message: `Task moved to "${COLUMNS.find((c) => c.id === newStatus)?.label}"`,
      });
    } catch (err) {
      // Rollback on rejection (HTTP 403 Forbidden / 400 Bad Request)
      setTasks(previousTasks);
      onShowNotice({
        type: "error",
        message: err.message || "Failed to update task status",
      });
    }
  }

  // Native Drag and Drop & Pointer Fallback Event Handlers (TASK-204)
  function handleCardDragStart(e, task) {
    if (!canEditTask(task)) {
      e.preventDefault();
      return;
    }
    wasDraggingRef.current = true;
    draggedTaskRef.current = task;
    if (typeof window !== "undefined") {
      window.__teamguard_dragging_task_id = task.id;
    }
    setDraggingTaskId(task.id);
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", String(task.id));
      e.dataTransfer.setData("text", String(task.id));
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function handleCardDragEnd() {
    dragEnterCountRef.current = {};
    setTimeout(() => {
      wasDraggingRef.current = false;
      draggedTaskRef.current = null;
      if (typeof window !== "undefined") {
        window.__teamguard_dragging_task_id = null;
      }
      setDraggingTaskId(null);
      setDragOverColumn(null);
    }, 150);
  }

  function handleColumnDragEnter(e, colId) {
    e.preventDefault();
    dragEnterCountRef.current[colId] = (dragEnterCountRef.current[colId] || 0) + 1;
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  }

  function handleColumnDragOver(e, colId) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  }

  function handleColumnDragLeave(e, colId) {
    dragEnterCountRef.current[colId] = (dragEnterCountRef.current[colId] || 0) - 1;
    if (dragEnterCountRef.current[colId] <= 0) {
      dragEnterCountRef.current[colId] = 0;
      if (dragOverColumn === colId) {
        setDragOverColumn(null);
      }
    }
  }

  function handleColumnDrop(e, targetColId) {
    e.preventDefault();
    e.stopPropagation();
    dragEnterCountRef.current = {};
    setDragOverColumn(null);
    const taskIdStr =
      e.dataTransfer?.getData("text/plain") ||
      e.dataTransfer?.getData("text") ||
      (draggedTaskRef.current?.id ? String(draggedTaskRef.current.id) : null) ||
      (typeof window !== "undefined" && window.__teamguard_dragging_task_id ? String(window.__teamguard_dragging_task_id) : null) ||
      (draggingTaskId ? String(draggingTaskId) : null);
    if (typeof window !== "undefined") {
      window.__teamguard_dragging_task_id = null;
    }
    draggedTaskRef.current = null;
    setDraggingTaskId(null);
    if (!taskIdStr) return;
    const taskId = Number(taskIdStr);
    handleStatusChange(taskId, targetColId);
  }

  // Seamless pointer & mouse drag support
  function handleCardMouseDown(e, task) {
    if (e.button !== 0 || !canEditTask(task)) return;
    if (e.target.closest("button, select, input, a, .card-action-btn, .status-dropdown")) {
      return;
    }
    const startX = e.clientX;
    const startY = e.clientY;
    let isDraggingPointer = false;

    function onPointerMove(moveEvent) {
      const dx = Math.abs(moveEvent.clientX - startX);
      const dy = Math.abs(moveEvent.clientY - startY);
      if (!isDraggingPointer && (dx > 4 || dy > 4)) {
        isDraggingPointer = true;
        wasDraggingRef.current = true;
        draggedTaskRef.current = task;
        if (typeof window !== "undefined") {
          window.__teamguard_dragging_task_id = task.id;
        }
        setDraggingTaskId(task.id);
      }
      if (isDraggingPointer) {
        const elem = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const colElem = elem?.closest(".kanban-column");
        if (colElem) {
          const colTestId = colElem.getAttribute("data-testid");
          const matchedCol = COLUMNS.find((c) => `kanban-column-${c.id.toLowerCase()}` === colTestId);
          if (matchedCol && dragOverColumn !== matchedCol.id) {
            setDragOverColumn(matchedCol.id);
          }
        } else if (dragOverColumn) {
          setDragOverColumn(null);
        }
      }
    }

    function onPointerUp(upEvent) {
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (isDraggingPointer) {
        const elem = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const colElem = elem?.closest(".kanban-column");
        if (colElem) {
          const colTestId = colElem.getAttribute("data-testid");
          const matchedCol = COLUMNS.find((c) => `kanban-column-${c.id.toLowerCase()}` === colTestId);
          if (matchedCol) {
            console.log("[DnD Pointer Up] Moving task", task.id, "to", matchedCol.id);
            handleStatusChange(task.id, matchedCol.id);
          }
        }
        setTimeout(() => {
          wasDraggingRef.current = false;
          draggedTaskRef.current = null;
          if (typeof window !== "undefined") {
            window.__teamguard_dragging_task_id = null;
          }
          setDraggingTaskId(null);
          setDragOverColumn(null);
        }, 150);
      }
    }

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newProjectId) return;
    try {
      setSubmitting(true);
      const res = await api.createTask({
        title: newTitle.trim(),
        description: newDesc.trim(),
        priority: newPriority,
        projectId: Number(newProjectId),
        assigneeId: user.id,
      });
      setTasks((prev) => [res.task, ...prev]);
      setCreateModalOpen(false);
      setNewTitle("");
      setNewDesc("");
      onShowNotice({ type: "success", message: "Task created successfully" });
    } catch (err) {
      onShowNotice({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  // Slide-Over Task Detail Drawer Handlers (TASK-204)
  async function handleDrawerSave(taskId, payload) {
    const res = await api.updateTask(taskId, payload);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
    setEditingTask(null);
    onShowNotice({ type: "success", message: "Task details updated successfully" });
  }

  async function handleDrawerDelete(taskId) {
    await api.deleteTask(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setEditingTask(null);
    onShowNotice({ type: "success", message: "Task deleted successfully" });
  }

  // Multi-parameter filter engine (TASK-206)
  const filteredTasks = tasks.filter((t) => {
    // 1. Search term (preserved for programmatically dispatched searches)
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const titleMatch = (t.title || "").toLowerCase().includes(q);
      const descMatch = (t.description || "").toLowerCase().includes(q);
      const keyBadge = `${t.project?.key || "PROJ"}-${t.id}`.toLowerCase();
      const keyMatch = keyBadge.includes(q) || String(t.id) === q;
      if (!titleMatch && !descMatch && !keyMatch) return false;
    }

    // 2. Project filter (scoped to selected sidebar project)
    if (filterProject !== "ALL" && String(t.projectId) !== String(filterProject)) {
      return false;
    }

    // 3. Assignee filter
    if (filterAssignee !== "ALL") {
      if (filterAssignee === "unassigned") {
        if (t.assigneeId) return false;
      } else if (String(t.assigneeId) !== String(filterAssignee)) {
        return false;
      }
    }

    // 4. Status filter
    if (filterStatus !== "ALL" && t.status !== filterStatus) {
      return false;
    }

    // 5. Priority filter
    if (filterPriority !== "ALL" && t.priority !== filterPriority) {
      return false;
    }

    return true;
  });

  const PRIORITY_ORDER = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  // Sort tasks engine
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === "priority_desc") {
      return (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0);
    }
    if (sortBy === "priority_asc") {
      return (PRIORITY_ORDER[a.priority] || 0) - (PRIORITY_ORDER[b.priority] || 0);
    }
    if (sortBy === "created_desc") {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
    if (sortBy === "created_asc") {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    }
    if (sortBy === "due_asc") {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    }
    if (sortBy === "due_desc") {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(b.dueDate) - new Date(a.dueDate);
    }
    if (sortBy === "title_asc") {
      return (a.title || "").localeCompare(b.title || "");
    }
    return 0;
  });

  // Pagination calculation for List and Table representations (TASK-206)
  const totalTasks = sortedTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalTasks / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const paginatedTasks = sortedTasks.slice(startIndex, startIndex + pageSize);

  const hasActiveFilters =
    filterAssignee !== "ALL" ||
    filterStatus !== "ALL" ||
    filterPriority !== "ALL" ||
    sortBy !== "default";

  if (loading) {
    return <LoadingView message="Loading tasks…" />;
  }

  return (
    <div className="kanban-view-container">
      {/* Subheader */}
      <div className="kanban-view-header">
        <div className="kanban-header-left">
          <h2>Task Board & Views</h2>
          <p>Search, filter, sort, and manage team deliverables across Board, List, and Table views.</p>
        </div>

        <div className="kanban-header-controls">
          {/* Real-time State Synchronization Badge (TASK-503 / UD-003) */}
          {/* <div
            className={`live-sync-indicator ${syncStatus}`}
            title={`Real-Time SSE Sync: ${syncStatus}`}
            data-testid="live-sync-indicator"
          >
            <span className="live-sync-dot" />
            <span className="live-sync-label">
              {syncStatus === "connected"
                ? "Live Sync Active"
                : syncStatus === "reconnecting"
                ? "Reconnecting..."
                : "Sync Offline"}
            </span>
          </div> */}

          {/* Multi-View Mode Tabs (TASK-205) */}
          <div className="view-mode-tabs" role="tablist" aria-label="Task View Modes">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "board"}
              className={`view-tab-btn ${viewMode === "board" ? "active" : ""}`}
              onClick={() => setViewMode("board")}
              data-testid="view-tab-board"
              title="Kanban Board view with drag-and-drop"
            >
              <Kanban size={15} />
              <span>Board</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "list"}
              className={`view-tab-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
              data-testid="view-tab-list"
              title="Collapsible accordion list view grouped by status"
            >
              <List size={15} />
              <span>List</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "table"}
              className={`view-tab-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              data-testid="view-tab-table"
              title="Dense spreadsheet table view with sortable columns"
            >
              <Table size={15} />
              <span>Table</span>
            </button>
            {/* <button
              type="button"
              role="tab"
              aria-selected={viewMode === "calendar"}
              className={`view-tab-btn ${viewMode === "calendar" ? "active" : ""}`}
              onClick={() => setViewMode("calendar")}
              data-testid="view-tab-calendar"
              title="Interactive monthly calendar scheduling view"
            >
              <CalendarIcon size={15} />
              <span>Calendar</span>
            </button> */}
            {/* <button
              type="button"
              role="tab"
              aria-selected={viewMode === "chat"}
              className={`view-tab-btn ${viewMode === "chat" ? "active" : ""}`}
              onClick={() => setViewMode("chat")}
              data-testid="view-tab-chat"
              title="Project team discussion channel"
            >
              <MessageSquare size={15} />
              <span>Chat</span>
            </button> */}
          </div>

          {canCreateTask && !isSelectedProjectArchived && (
            <button
              type="button"
              className="btn-primary-emerald"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus size={16} />
              <span>Add Task</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="view-error-container" role="alert">
          <AlertCircle size={20} className="text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {/* Search, Filter & Pagination Toolbar (TASK-206) */}
      <div className="tasks-filter-toolbar" data-testid="tasks-filter-toolbar">
        {/* Dropdown Filters */}
        <div className="tasks-dropdown-filters">
          {/* Assignee Filter */}
          <div className="filter-dropdown-group">
            <User size={13} className="filter-icon" />
            <select
              className="toolbar-select"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              data-testid="filter-assignee-select"
              title="Filter by assigned member"
            >
              <option value="ALL">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.name || `User #${m.userId}`}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="filter-dropdown-group">
            <select
              className="toolbar-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              data-testid="filter-status-select"
              title="Filter by task status"
            >
              <option value="ALL">All Statuses</option>
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="REVISION">Revision</option>
              <option value="DONE">Done</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="filter-dropdown-group">
            <select
              className="toolbar-select"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              data-testid="filter-priority-select"
              title="Filter by priority level"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Sort Button next to All Priorities */}
          <div className="filter-dropdown-group">
            <ArrowUpDown size={13} className="filter-icon" />
            <select
              className="toolbar-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              data-testid="toolbar-sort-select"
              title="Sort tasks"
            >
              <option value="default">Sort by</option>
              <option value="priority_desc">Priority (High to Low)</option>
              <option value="priority_asc">Priority (Low to High)</option>
              <option value="created_desc">Added Date (Newest first)</option>
              <option value="created_asc">Added Date (Oldest first)</option>
              <option value="due_asc">Due Date (Earliest first)</option>
              <option value="due_desc">Due Date (Latest first)</option>
              <option value="title_asc">Title (A - Z)</option>
            </select>
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => {
                setSearchTerm("");
                setFilterAssignee("ALL");
                setFilterStatus("ALL");
                setFilterPriority("ALL");
                setSortBy("default");
              }}
              data-testid="btn-reset-filters"
              title="Reset active filters and sort"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Archival Freeze Banner (TASK-204 / US-ABAC-003) */}
      {isSelectedProjectArchived && (
        <div className="archived-project-freeze-banner" role="alert" data-testid="archived-project-banner">
          <div className="archived-banner-icon">
            <Lock size={18} />
          </div>
          <div className="archived-banner-text">
            <div className="archived-banner-title-row">
              <strong className="archived-banner-title">Archival Freeze Active</strong>
              <span className="archived-banner-rule-pill">US-ABAC-003</span>
            </div>
            <p className="archived-banner-description">
              This project is archived. In accordance with TeamGuard ABAC governance, all tasks are locked in read-only mode and cannot be moved, edited, or reordered.
            </p>
          </div>
        </div>
      )}

      {/* View 1: Kanban Board with Native Drag-and-Drop (TASK-204) */}
      {viewMode === "board" && (
        <div className="kanban-columns-grid">
          {COLUMNS.map((col) => {
            const colTasks = sortedTasks.filter((t) => t.status === col.id);
            const isOver = dragOverColumn === col.id;
            return (
              <div
                key={col.id}
                className={`kanban-column ${isOver ? "drag-over-column" : ""}`}
                onDragEnter={(e) => handleColumnDragEnter(e, col.id)}
                onDragOver={(e) => handleColumnDragOver(e, col.id)}
                onDragLeave={(e) => handleColumnDragLeave(e, col.id)}
                onDrop={(e) => handleColumnDrop(e, col.id)}
                data-testid={`kanban-column-${col.id.toLowerCase()}`}
              >
                <div className="kanban-column-header">
                  <div className="kanban-column-title-group">
                    <span className="column-dot" style={{ backgroundColor: col.dotColor }} />
                    <h3>{col.label}</h3>
                    <span className="column-count-badge">{colTasks.length}</span>
                  </div>
                  <div className="kanban-column-actions">
                    {/* Column (...) action button before [+] action button */}
                    <div className="column-menu-wrapper">
                      <button
                        type="button"
                        className="icon-btn-ghost column-more-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleColumnMenu(col.id);
                        }}
                        title={`Column options for ${col.label}`}
                        aria-label={`Column options for ${col.label}`}
                      >
                        <MoreHorizontal size={15} />
                      </button>

                      {activeColumnMenu === col.id && (
                        <div className="column-actions-popover" onClick={(e) => e.stopPropagation()}>
                          <div className="column-popover-header">
                            <span>{col.label} Actions</span>
                          </div>
                          <button
                            type="button"
                            className="column-popover-item"
                            disabled={colTasks.length === 0}
                            onClick={() => handleSelectAllInColumn(col.id, colTasks)}
                          >
                            <CheckSquare size={13} />
                            <span>Select all to update status</span>
                          </button>
                          <div className="column-popover-divider" />
                          <div className="column-popover-section-label">Move all tasks to:</div>
                          {COLUMNS.filter((c) => c.id !== col.id).map((targetCol) => (
                            <button
                              key={targetCol.id}
                              type="button"
                              className="column-popover-item"
                              disabled={colTasks.length === 0 || isSelectedProjectArchived}
                              onClick={() => handleMoveAllColumnTasks(col.id, targetCol.id, colTasks)}
                            >
                              <span className="column-dot-mini" style={{ backgroundColor: targetCol.dotColor }} />
                              <span>{targetCol.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {canCreateTask && !isSelectedProjectArchived && (
                      <button
                        type="button"
                        className="icon-btn-ghost"
                        onClick={() => {
                          setNewTaskStatus(col.id);
                          setCreateModalOpen(true);
                        }}
                        title="Add task in this column"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className="kanban-column-cards column-drop-zone"
                  onDragEnter={(e) => handleColumnDragEnter(e, col.id)}
                  onDragOver={(e) => handleColumnDragOver(e, col.id)}
                  onDragLeave={(e) => handleColumnDragLeave(e, col.id)}
                  onDrop={(e) => handleColumnDrop(e, col.id)}
                >
                  {colTasks.map((task) => {
                    const editable = canEditTask(task);
                    const isDragging = draggingTaskId === task.id;
                    const isSelected = selectedTaskIds.has(task.id);
                    return (
                      <div
                        key={task.id}
                        className={`kanban-card ${editable ? "draggable-card" : "card-non-draggable"} ${isDragging ? "is-dragging" : ""} ${isSelected ? "card-selected" : ""}`}
                        draggable={editable}
                        onDragStart={(e) => handleCardDragStart(e, task)}
                        onDragEnd={handleCardDragEnd}
                        onDragOver={(e) => handleColumnDragOver(e, col.id)}
                        onDrop={(e) => handleColumnDrop(e, col.id)}
                        onMouseDown={(e) => handleCardMouseDown(e, task)}
                        onClick={() => {
                          if (wasDraggingRef.current) return;
                          if (bulkSelectionMode) {
                            toggleTaskSelection(task.id);
                          } else {
                            openTaskDetail(task);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        data-testid={`kanban-card-${task.id}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openTaskDetail(task);
                          }
                        }}
                        title={bulkSelectionMode ? "Click to toggle selection" : "Click to view task details"}
                      >
                        {bulkSelectionMode && (
                          <div className="card-selection-check" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTaskSelection(task.id)}
                              aria-label={`Select task ${task.title}`}
                            />
                          </div>
                        )}

                        <h4 className="kanban-card-title">{task.title}</h4>

                        <div className="kanban-card-footer">
                          <div className="card-meta-left">
                            <div
                              className="card-avatar-wrap"
                              title={task.assignee?.name ? `Assigned to ${task.assignee.name}` : "Unassigned"}
                            >
                              {task.assignee?.avatarUrl ? (
                                <img
                                  src={task.assignee.avatarUrl}
                                  alt={task.assignee.name}
                                  className="card-avatar-img"
                                />
                              ) : task.assignee?.name ? (
                                <span
                                  className="card-avatar-pill"
                                  style={{ backgroundColor: getAvatarColor(task.assignee.name) }}
                                >
                                  {getAvatarInitial(task.assignee.name)}
                                </span>
                              ) : (
                                <span className="card-avatar-unassigned">
                                  <User size={11} />
                                </span>
                              )}
                            </div>

                            {task.dueDate && (
                              <DueDateBadge dueDate={task.dueDate} status={task.status} compact />
                            )}

                            <div className="card-priority-flag" title={`${task.priority} Priority`}>
                              {getPriorityFlag(task.priority)}
                            </div>
                          </div>

                          <div className="card-meta-right">
                            {task.subtasks && task.subtasks.length > 0 && (
                              <span
                                className="subtask-card-badge"
                                title={`Subtasks: ${task.subtasks.filter((s) => s.isCompleted).length}/${task.subtasks.length} completed`}
                              >
                                <CheckSquare size={11} />
                                <span>
                                  {task.subtasks.filter((s) => s.isCompleted).length}/{task.subtasks.length}
                                </span>
                              </span>
                            )}

                            {Number(task.commentsCount) > 0 && (
                              <span
                                className="comment-card-badge"
                                title={`Comments: ${task.commentsCount} discussions`}
                              >
                                <MessageSquare size={11} />
                                <span>{task.commentsCount}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div className="empty-column-placeholder" onDragOver={(e) => handleColumnDragOver(e, col.id)} onDrop={(e) => handleColumnDrop(e, col.id)}>
                      <Inbox size={20} className="empty-column-icon" />
                      <span className="empty-column-title">No tasks in {col.label}</span>
                      <small className="empty-column-subtext">
                        {canCreateTask && !isSelectedProjectArchived ? "Drop tasks here or create one" : "No tasks assigned"}
                      </small>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View 2: Collapsible Accordion List View (TASK-205) */}
      {viewMode === "list" && (
        <TaskListView
          tasks={paginatedTasks}
          projects={projects}
          members={members}
          user={user}
          canEditTask={canEditTask}
          canCreateTask={canCreateTask}
          canDeleteTask={canDeleteTask}
          onOpenDetail={openTaskDetail}
          onStatusChange={handleStatusChange}
          onDeleteTask={handleDrawerDelete}
          onCreateTaskInStatus={() => {
            setCreateModalOpen(true);
          }}
        />
      )}

      {/* View 3: Dense Spreadsheet Table View (TASK-205) */}
      {viewMode === "table" && (
        <TaskTableView
          tasks={paginatedTasks}
          projects={projects}
          members={members}
          user={user}
          canEditTask={canEditTask}
          canDeleteTask={canDeleteTask}
          onOpenDetail={openTaskDetail}
          onStatusChange={handleStatusChange}
          onDeleteTask={handleDrawerDelete}
        />
      )}

      {/* Pagination Bar (TASK-206) for List and Table Views */}
      {(viewMode === "list" || viewMode === "table") && totalTasks > 0 && (
        <div className="tasks-pagination-bar" data-testid="tasks-pagination-bar">
          <div className="pagination-info">
            <span>
              Showing {startIndex + 1}–{Math.min(startIndex + pageSize, totalTasks)} of {totalTasks} {totalTasks === 1 ? "task" : "tasks"}
            </span>
          </div>

          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn"
              disabled={validPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              data-testid="pagination-prev"
            >
              Previous
            </button>

            <span className="pagination-page-indicator">
              Page {validPage} of {totalPages}
            </span>

            <button
              type="button"
              className="pagination-btn"
              disabled={validPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              data-testid="pagination-next"
            >
              Next
            </button>

            <div className="page-size-selector">
              <label>Per page:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                data-testid="pagination-page-size"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Task Detail Drawer (TASK-204) */}
      {editingTask && (
        <TaskDetailDrawer
          task={editingTask}
          projects={projects}
          members={members}
          currentUser={user}
          userPermissions={userPermissions}
          userRoles={user?.roles || []}
          canEdit={canEditTask(editingTask)}
          canAssign={canAssign}
          canManageProjects={canManageProjects}
          canDelete={canDeleteTask}
          onClose={() => setEditingTask(null)}
          onSave={handleDrawerSave}
          onDelete={handleDrawerDelete}
          onSubtasksChange={handleSubtasksChange}
          onCommentsCountChange={(count) => handleCommentsCountChange(editingTask.id, count)}
        />
      )}

      {/* Quick Add Task Modal */}
      {createModalOpen && (
        <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)} role="presentation">
          <div
            ref={createTaskModalRef}
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="create-task-heading">Create New Task</h3>
              <button
                type="button"
                className="icon-btn-ghost"
                onClick={() => setCreateModalOpen(false)}
                aria-label="Close task creation dialog"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="modal-form">
              <div className="form-field">
                <label>Project</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.isArchived}>
                      {p.key ? `[${p.key}] ` : ""}{p.name}{p.isArchived ? " (Archived - Cannot Add Tasks)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Task Title</label>
                <input
                  type="text"
                  placeholder="e.g. Design checkout flow hero"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>Description</label>
                <textarea
                  placeholder="Details and criteria for this task..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="form-field">
                <label>Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-emerald"
                  disabled={submitting}
                >
                  {submitting ? "Creating…" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
