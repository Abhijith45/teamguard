import { useState, useEffect, useMemo } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Key,
  FolderLock,
  Layers,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ChevronDown,
  X,
  Eye,
  EyeOff,
  Clock,
  Terminal,
} from "lucide-react";

/**
 * Interactive Live Policy Inspector Drawer (Milestone 3 / Learning & Security Engine)
 *
 * Provides real-time 6-layer authorization tracing:
 * Layer 1: JWT & Identity Authentication
 * Layer 2: Organization Tenant Resolution & Boundary
 * Layer 3: Membership Status & AccountType Sandboxing
 * Layer 4: Spatial Container (ReBAC) Hierarchical Inheritance
 * Layer 5: Role-Based Access Control (RBAC) & Two-Key Capability Gate
 * Layer 6: Attribute-Based Access Control (ABAC) & Resource Ownership
 */
export function PolicyInspectorDrawer({
  isOpen,
  onClose,
  currentUser,
  currentOrg,
  activeRole,
  userPermissions = new Set(),
}) {
  const [activeTab, setActiveTab] = useState("simulator"); // "simulator" | "live"
  const [liveEvents, setLiveEvents] = useState([]);
  const [selectedLiveEvent, setSelectedLiveEvent] = useState(null);

  // Policy Simulator States
  const [simActor, setSimActor] = useState("team-member"); // super-admin, project-manager, team-member, viewer, guest
  const [simAction, setSimAction] = useState("task:delete");
  const [simSpacePrivacy, setSimSpacePrivacy] = useState("private"); // public, private
  const [simSpaceTier, setSimSpaceTier] = useState("EDIT"); // NONE, VIEW, COMMENT, EDIT, FULL
  const [simTaskOwnership, setSimTaskOwnership] = useState("other"); // self, other
  const [simTaskAssignee, setSimTaskAssignee] = useState("self"); // self, other, unassigned
  const [simProjectArchived, setSimProjectArchived] = useState(false);
  const [simCustomFieldSensitive, setSimCustomFieldSensitive] = useState(false);

  // Subscribe to live API intercepts
  useEffect(() => {
    function handleIntercept(e) {
      const event = e.detail;
      if (!event) return;
      setLiveEvents((prev) => [event, ...prev.slice(0, 24)]);
      setSelectedLiveEvent(event);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("teamguard:api-intercept", handleIntercept);
      return () => window.removeEventListener("teamguard:api-intercept", handleIntercept);
    }
  }, []);

  // Pre-configured persona capabilities
  const personas = {
    "super-admin": {
      name: "Annisa Azizah",
      role: "Super Admin",
      accountType: "MEMBER",
      permissions: [
        "project:create",
        "project:update",
        "project:delete",
        "task:create",
        "task:update",
        "task:update:own",
        "task:update:assigned",
        "task:delete",
        "task:delete:own",
        "space:create",
        "space:manage",
        "roles:manage",
        "audit:read",
      ],
      description: "Full administrative omnipotence across all workspaces and spatial containers.",
    },
    "project-manager": {
      name: "Marcus Vance",
      role: "Project Manager",
      accountType: "MEMBER",
      permissions: [
        "project:create",
        "project:update",
        "task:create",
        "task:update",
        "task:update:own",
        "task:update:assigned",
        "task:delete:own",
        "space:create",
      ],
      description: "Container administrator with scoped project & task editing capabilities.",
    },
    "team-member": {
      name: "Alex Chen",
      role: "Team Member",
      accountType: "MEMBER",
      permissions: [
        "project:read",
        "task:create",
        "task:update:own",
        "task:update:assigned",
        "task:delete:own",
      ],
      description: "Standard contributor subject to Two-Key action gates and creator ownership.",
    },
    viewer: {
      name: "Devon Lane",
      role: "Viewer / Stakeholder",
      accountType: "MEMBER",
      permissions: ["project:read", "task:read", "file:read"],
      description: "Read-only workspace consumer barred from mutation actions.",
    },
    guest: {
      name: "Jordan Lee (External Contractor)",
      role: "Guest Collaborator",
      accountType: "GUEST",
      permissions: ["task:read", "task:update:assigned"],
      description: "Sandboxed third-party identity barred from space root and member directories.",
    },
  };

  const selectedPersona = personas[simActor] || personas["team-member"];

  // Evaluate the 6 layers for simulator
  const evaluationResult = useMemo(() => {
    const isGuest = selectedPersona.accountType === "GUEST";
    const perms = new Set(selectedPersona.permissions);

    // Layer 1: JWT & Identity Authentication
    const layer1 = {
      layer: 1,
      name: "Authentication & Identity",
      badge: "PASS",
      status: 200,
      rule: "Valid signed Bearer JWT token with active User record",
      detail: `Authenticated as "${selectedPersona.name}" (${selectedPersona.accountType}). Token signature valid.`,
    };

    // Layer 2: Organization Tenant Context
    const layer2 = {
      layer: 2,
      name: "Tenant Context & Multi-Tenancy Boundary",
      badge: "PASS",
      status: 200,
      rule: "Active x-organization-id tenant context resolution",
      detail: `Tenant ID: ${currentOrg?.id || 1} (${currentOrg?.name || "Acme Corp"}). Tenant isolation verified.`,
    };

    // Layer 3: Membership Status & AccountType Sandboxing
    let layer3Badge = "PASS";
    let layer3Detail = `Membership ACTIVE as ${selectedPersona.accountType}.`;
    if (isGuest && (simAction.startsWith("space:") || simAction === "members:read")) {
      layer3Badge = "FAIL";
      layer3Detail = "GUEST Sandboxing Rule: Guests cannot view member directories or root space hierarchies.";
    }
    const layer3 = {
      layer: 3,
      name: "Membership Status & AccountType",
      badge: layer3Badge,
      status: layer3Badge === "PASS" ? 200 : 403,
      rule: "Membership active & accountType spatial restrictions",
      detail: layer3Detail,
    };

    // Layer 4: Spatial ReBAC & Container Hierarchy
    let layer4Badge = "PASS";
    let layer4Status = 200;
    let layer4Detail = "";
    const isOwnerOrAdmin = selectedPersona.role === "Super Admin";

    if (isOwnerOrAdmin) {
      layer4Detail = "Super Admin bypass: Omnipotent access across all spatial containers.";
    } else if (isGuest && simAction.startsWith("space:")) {
      layer4Badge = "FAIL";
      layer4Status = 403;
      layer4Detail = "Guest sandbox exclusion: Guests cannot perform Space management operations.";
    } else if (simSpacePrivacy === "public") {
      layer4Detail = "Public Space: Inherited access granted to all active organization members.";
    } else {
      // Private Space
      if (simSpaceTier === "NONE") {
        layer4Badge = "FAIL";
        layer4Status = 404; // Resource-hiding invariant
        layer4Detail = "Private Container Isolation (404 Hidden): Non-member cannot probe container existence.";
      } else {
        const rank = { NONE: 0, VIEW: 1, COMMENT: 2, EDIT: 3, FULL: 4 };
        const requiredRank = simAction.includes("delete") || simAction.includes("manage") ? 4 : 3;
        if (rank[simSpaceTier] < requiredRank) {
          layer4Badge = "FAIL";
          layer4Status = 403;
          layer4Detail = `Insufficient Space Tier: Holds ${simSpaceTier}, but operation requires tier rank ${requiredRank}.`;
        } else {
          layer4Detail = `Private Space Membership verified with access level "${simSpaceTier}".`;
        }
      }
    }
    const layer4 = {
      layer: 4,
      name: "Spatial ReBAC & Container Hierarchy",
      badge: layer4Badge,
      status: layer4Status,
      rule: "Space privacy, tier hierarchy (FULL > EDIT > COMMENT > VIEW) and resource hiding",
      detail: layer4Detail,
    };

    // Layer 5: Dynamic RBAC & Two-Key Capability Gate
    let layer5Badge = "PASS";
    let layer5Status = 200;
    let layer5Detail = "";

    const hasDirectPerm = perms.has(simAction);
    const hasOwnPerm = perms.has(`${simAction}:own`);
    const hasAssignedPerm = perms.has("task:update:assigned");

    if (simAction === "task:delete") {
      if (perms.has("task:delete")) {
        layer5Detail = "Two-Key Gate Key 1: Role holds global 'task:delete' grant.";
      } else if (perms.has("task:delete:own")) {
        layer5Detail = "Two-Key Gate Key 1: Role holds conditional 'task:delete:own' (proceeds to Layer 6 creator check).";
      } else {
        layer5Badge = "FAIL";
        layer5Status = 403;
        layer5Detail = "RBAC Denial: Role lacks both 'task:delete' and 'task:delete:own' capabilities.";
      }
    } else if (simAction === "task:update") {
      if (hasDirectPerm || hasOwnPerm || (hasAssignedPerm && simTaskAssignee === "self")) {
        layer5Detail = `RBAC Capability confirmed for task update (held permissions: ${Array.from(perms).filter(p => p.startsWith("task:update")).join(", ")}).`;
      } else {
        layer5Badge = "FAIL";
        layer5Status = 403;
        layer5Detail = "RBAC Denial: Missing task update permissions.";
      }
    } else if (!hasDirectPerm) {
      layer5Badge = "FAIL";
      layer5Status = 403;
      layer5Detail = `RBAC Denial: Role lacks required atomic permission '${simAction}'.`;
    } else {
      layer5Detail = `RBAC Permission '${simAction}' granted to ${selectedPersona.role}.`;
    }

    const layer5 = {
      layer: 5,
      name: "Dynamic RBAC & Two-Key Capability Gate",
      badge: layer5Badge,
      status: layer5Status,
      rule: "Atomic role permissions evaluation & Two-Key Action capability gate",
      detail: layer5Detail,
    };

    // Layer 6: Fine-Grained ABAC & Resource Ownership
    let layer6Badge = "PASS";
    let layer6Status = 200;
    let layer6Detail = "";

    if (simProjectArchived) {
      layer6Badge = "FAIL";
      layer6Status = 403;
      layer6Detail = "ABAC Archival Freeze (US-ABAC-003): Container is archived; all task mutations locked in read-only mode.";
    } else if (simAction === "task:delete" && !perms.has("task:delete")) {
      // Must satisfy Key 2: Creator ownership
      if (simTaskOwnership !== "self") {
        layer6Badge = "FAIL";
        layer6Status = 403;
        layer6Detail = "Two-Key Gate Key 2 FAILED: User holds 'task:delete:own' but caller is not the task creator.";
      } else {
        layer6Detail = "Two-Key Gate Key 2 PASSED: Caller is confirmed task creator (creatorId === userId).";
      }
    } else if (simAction === "task:update:title" && !perms.has("task:update") && simTaskAssignee === "self") {
      layer6Badge = "FAIL";
      layer6Status = 403;
      layer6Detail = "ABAC Title Lock (US-ABAC-004 AC 4): Assignees with 'task:update:assigned' can update status/description, but title is immutable.";
    } else if (isGuest && simCustomFieldSensitive) {
      layer6Detail = "ABAC Field Masking Active: Custom field with 'hideFromGuests=true' will be dynamically stripped from response.";
    } else {
      layer6Detail = "ABAC Invariants satisfied. Ownership and container attributes allow request execution.";
    }

    const layer6 = {
      layer: 6,
      name: "Fine-Grained ABAC & Resource Ownership",
      badge: layer6Badge,
      status: layer6Status,
      rule: "Contextual attributes (creator, assignee, archival freeze, field masking)",
      detail: layer6Detail,
    };

    // Compute Overall Final Decision
    const layers = [layer1, layer2, layer3, layer4, layer5, layer6];
    const failingLayer = layers.find((l) => l.badge === "FAIL");
    const finalAllowed = !failingLayer;
    const finalStatus = failingLayer ? failingLayer.status : 200;

    let educationalRationale = "";
    if (finalAllowed) {
      educationalRationale = `Authorization SUCCESS (HTTP 200): All 6 layers satisfied. The actor "${selectedPersona.name}" has valid identity, active tenant membership, container clearance, role capability, and passed all ABAC attribute constraints.`;
    } else if (finalStatus === 404) {
      educationalRationale = `Security Invariant (HTTP 404 Not Found): TeamGuard utilizes resource-hiding for private spatial containers. Rather than returning 403 Forbidden (which confirms the existence of a secret container), the system returns 404 Not Found to defeat IDOR and resource enumeration attacks.`;
    } else if (failingLayer.layer === 5 && simAction === "task:delete") {
      educationalRationale = `Two-Key Gate RBAC Failure (HTTP 403 Forbidden): Data destruction requires explicit privilege. Unlike legacy systems where 'edit' permits deletion, TeamGuard decouples modification from deletion, adhering to ClickUp's 'Delete Items: Only if created' security model.`;
    } else if (failingLayer.layer === 6 && simAction === "task:delete") {
      educationalRationale = `Two-Key Gate ABAC Failure (HTTP 403 Forbidden): The user possesses the role capability 'task:delete:own', but because they are not the recorded creator (creatorId != userId), Key 2 fails. A team member cannot delete work created by their peers.`;
    } else if (failingLayer.layer === 6 && simProjectArchived) {
      educationalRationale = `Archival Freeze Immutability (HTTP 403 Forbidden): Under TeamGuard ABAC governance (US-ABAC-003), archiving a project freezes all child tasks into immutable read-only records to guarantee compliance and historical audit integrity.`;
    } else {
      educationalRationale = `Authorization Rejection (HTTP ${finalStatus}): Failed at Layer ${failingLayer.layer} (${failingLayer.name}): ${failingLayer.detail}`;
    }

    return {
      allowed: finalAllowed,
      status: finalStatus,
      failingLayerNumber: failingLayer ? failingLayer.layer : null,
      layers,
      educationalRationale,
    };
  }, [
    simActor,
    simAction,
    simSpacePrivacy,
    simSpaceTier,
    simTaskOwnership,
    simTaskAssignee,
    simProjectArchived,
    simCustomFieldSensitive,
    currentOrg,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-700/80 shadow-2xl flex flex-col h-full text-slate-100">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-100 text-sm">TeamGuard Live Policy Inspector</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Interactive Learning
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Real-time 6-layer authorization trace & educational RBAC/ABAC engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            aria-label="Close Inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900 px-4 pt-2 gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab("simulator")}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === "simulator"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Play className="w-3.5 h-3.5" /> Policy Simulator & Sandbox
          </button>
          <button
            onClick={() => setActiveTab("live")}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition ${
              activeTab === "live"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" /> Live Request Stream ({liveEvents.length})
          </button>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {activeTab === "simulator" ? (
            <>
              {/* Simulator Controls */}
              <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 pb-1 border-b border-slate-800/80">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Scenario Parameters
                  </span>
                  <span className="text-[11px] text-slate-400">Configure actor & object attributes</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Actor Selection */}
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1 font-medium">1. Actor Persona</label>
                    <select
                      value={simActor}
                      onChange={(e) => setSimActor(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="super-admin">Super Admin (Annisa Azizah)</option>
                      <option value="project-manager">Project Manager (Marcus Vance)</option>
                      <option value="team-member">Team Member (Alex Chen)</option>
                      <option value="viewer">Viewer / Stakeholder (Devon Lane)</option>
                      <option value="guest">Guest Collaborator (Jordan Lee)</option>
                    </select>
                  </div>

                  {/* Target Action */}
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1 font-medium">2. Target Action</label>
                    <select
                      value={simAction}
                      onChange={(e) => setSimAction(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="task:delete">Delete Task (task:delete)</option>
                      <option value="task:update">Update Task (task:update)</option>
                      <option value="task:update:title">Update Task Title (ABAC Title Lock)</option>
                      <option value="task:create">Create Task (task:create)</option>
                      <option value="space:create">Create Space (space:create)</option>
                      <option value="space:manage">Manage Private Space</option>
                      <option value="members:read">Access Member Directory</option>
                    </select>
                  </div>

                  {/* Spatial Container Privacy & Tier */}
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1 font-medium">3. Space Privacy & Tier</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={simSpacePrivacy}
                        onChange={(e) => setSimSpacePrivacy(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                      <select
                        value={simSpaceTier}
                        onChange={(e) => setSimSpaceTier(e.target.value)}
                        disabled={simSpacePrivacy === "public"}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                      >
                        <option value="NONE">Not Member</option>
                        <option value="VIEW">VIEW</option>
                        <option value="COMMENT">COMMENT</option>
                        <option value="EDIT">EDIT</option>
                        <option value="FULL">FULL</option>
                      </select>
                    </div>
                  </div>

                  {/* Task Ownership Attributes */}
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1 font-medium">4. Task Creator Ownership</label>
                    <select
                      value={simTaskOwnership}
                      onChange={(e) => setSimTaskOwnership(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="self">Created by Current Actor (creatorId === userId)</option>
                      <option value="other">Created by Another Member (creatorId !== userId)</option>
                    </select>
                  </div>
                </div>

                {/* Additional ABAC Toggles */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={simProjectArchived}
                      onChange={(e) => setSimProjectArchived(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>Project is Archived (US-ABAC-003 Freeze)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={simCustomFieldSensitive}
                      onChange={(e) => setSimCustomFieldSensitive(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>Hide From Guests (Custom Field Masking)</span>
                  </label>
                </div>
              </div>

              {/* Final Decision Banner */}
              <div
                className={`p-4 rounded-lg border flex items-start gap-3 transition-colors ${
                  evaluationResult.allowed
                    ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                    : evaluationResult.status === 404
                    ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                    : "bg-rose-950/30 border-rose-500/40 text-rose-200"
                }`}
              >
                <div className="mt-0.5">
                  {evaluationResult.allowed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : evaluationResult.status === 404 ? (
                    <FolderLock className="w-5 h-5 text-amber-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm font-semibold tracking-wide">
                      {evaluationResult.allowed
                        ? "HTTP 200 OK — AUTHORIZATION GRANTED"
                        : evaluationResult.status === 404
                        ? "HTTP 404 NOT FOUND — RESOURCE HIDDEN"
                        : `HTTP ${evaluationResult.status} FORBIDDEN — ACCESS DENIED`}
                    </strong>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/40 border border-white/10">
                      {simAction}
                    </span>
                  </div>
                  <p className="text-xs mt-1.5 leading-relaxed text-slate-300 font-normal">
                    {evaluationResult.educationalRationale}
                  </p>
                </div>
              </div>

              {/* 6-Layer Interactive Evaluation Tree */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                  6-Layer Architecture Trace
                </h3>
                {evaluationResult.layers.map((layer) => {
                  const isPass = layer.badge === "PASS";
                  const isFail = layer.badge === "FAIL";
                  return (
                    <div
                      key={layer.layer}
                      className={`p-3 rounded-lg border transition ${
                        isFail
                          ? "bg-rose-950/20 border-rose-500/40"
                          : "bg-slate-950/40 border-slate-800/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isPass
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            }`}
                          >
                            L{layer.layer}
                          </span>
                          <span className="text-xs font-medium text-slate-200">{layer.name}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isPass
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {layer.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 pl-7 leading-normal">{layer.detail}</p>
                    </div>
                  );
                })}
              </div>

              {/* Educational Deep Dive Box */}
              <div className="p-3.5 rounded-lg bg-indigo-950/20 border border-indigo-500/30 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                  <HelpCircle className="w-4 h-4" />
                  <span>Enterprise Security Invariants at Play</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-300 text-[11px] leading-relaxed">
                  <li>
                    <strong>Two-Key Action Gate:</strong> Role capability (Key 1) and object ownership (Key 2) are decoupled. Even if a user holds <code className="text-indigo-300">task:delete:own</code>, attempting to delete another member's task fails closed at Layer 6.
                  </li>
                  <li>
                    <strong>Container Hierarchy & Resource Hiding:</strong> Inaccessible private spaces return <code className="text-amber-300">404 Not Found</code> rather than <code className="text-rose-300">403 Forbidden</code>, preventing malicious actor ID probing across tenants or spaces.
                  </li>
                  <li>
                    <strong>Archival Freeze (ABAC):</strong> Once a project is archived, its tasks are locked immutably across the organization to guarantee audit compliance.
                  </li>
                </ul>
              </div>
            </>
          ) : (
            /* Live Request Stream */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Recent Client Network Invocations</span>
                <button
                  onClick={() => setLiveEvents([])}
                  className="hover:text-slate-200 flex items-center gap-1 text-[11px]"
                >
                  <RotateCcw className="w-3 h-3" /> Clear Stream
                </button>
              </div>

              {liveEvents.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No API calls intercepted yet. Perform actions in the app to inspect them live.
                </div>
              ) : (
                liveEvents.map((evt, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-1.5 font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            evt.method === "GET"
                              ? "bg-blue-500/20 text-blue-300"
                              : evt.method === "POST"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : evt.method === "DELETE"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {evt.method}
                        </span>
                        <span className="text-slate-200">{evt.path}</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          evt.ok
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        {evt.status}
                      </span>
                    </div>
                    {evt.error && (
                      <div className="text-rose-400 text-[11px]">Error: {evt.error}</div>
                    )}
                    <div className="text-slate-500 text-[10px] flex items-center gap-2">
                      <Clock className="w-3 h-3" /> {new Date(evt.timestamp).toLocaleTimeString()}
                      {evt.headers?.["x-organization-id"] && (
                        <span>| Tenant: {evt.headers["x-organization-id"]}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
