import test from "node:test";
import assert from "node:assert/strict";
import {
  getQuickActions,
  filterQuickActions,
  flattenSearchResults,
  getNextNavIndex,
  groupFlattenedItems,
} from "./commandPaletteUtils.js";

test("TASK-401 [US-CMD-002 / FE REQ 1]: Quick actions generation and permission filtering", (t) => {
  // 1. Viewer or member without creation permissions
  const viewerActions = getQuickActions({ currentSection: "dashboard", permissions: ["task:read"] });
  assert.ok(viewerActions.length >= 7);
  assert.ok(viewerActions.some((a) => a.id === "nav-dashboard"));
  assert.ok(viewerActions.some((a) => a.id === "nav-tasks"));
  assert.ok(!viewerActions.some((a) => a.id === "action-create-task"));
  assert.ok(!viewerActions.some((a) => a.id === "action-create-project"));

  // 2. Admin with task:create and project:create
  const adminActions = getQuickActions({
    currentSection: "dashboard",
    permissions: ["task:create", "project:create", "member:read"],
  });
  assert.ok(adminActions.some((a) => a.id === "action-create-task"));
  assert.ok(adminActions.some((a) => a.id === "action-create-project"));
});

test("TASK-401 [US-CMD-002 / FE REQ 2]: Quick actions query filtering and fallback slicing", () => {
  const allActions = getQuickActions({ permissions: ["task:create"] });

  // Empty query returns default 5 actions
  const emptyFilter = filterQuickActions(allActions, "");
  assert.equal(emptyFilter.length, 5);

  // Search by exact action title
  const taskFilter = filterQuickActions(allActions, "Kanban");
  assert.ok(taskFilter.length >= 1);
  assert.ok(taskFilter.some((a) => a.id === "nav-tasks"));

  // Search by keyword
  const rbacFilter = filterQuickActions(allActions, "matrix");
  assert.ok(rbacFilter.some((a) => a.id === "nav-roles"));

  // Non-matching query returns empty array
  const noMatch = filterQuickActions(allActions, "xyznonexistent999");
  assert.equal(noMatch.length, 0);
});

test("TASK-401 [US-CMD-001 & US-CMD-002 / FE REQ 3]: Flattening search results across multiple entities", () => {
  const quickActions = [
    { id: "act-1", title: "Create Task", type: "action" },
  ];
  const results = {
    projects: [
      { id: 10, name: "Core Platform", key: "CORE", status: "ACTIVE" },
    ],
    tasks: [
      {
        id: 42,
        title: "Implement Auth Flow",
        status: "IN_PROGRESS",
        project: { key: "AUTH" },
        assignee: { name: "Alice Smith" },
      },
    ],
    members: [
      {
        id: 5,
        name: "Bob Jones",
        email: "bob@acme.com",
        primaryRole: "Admin",
      },
    ],
    files: [
      { id: 7, name: "architecture.pdf", fileType: "pdf", sizeBytes: 204800 },
    ],
  };

  const flattened = flattenSearchResults({ results, quickActions });
  assert.equal(flattened.length, 5);

  // Verify contiguous globalIndex
  assert.equal(flattened[0].globalIndex, 0);
  assert.equal(flattened[0].id, "act-1");
  assert.equal(flattened[1].globalIndex, 1);
  assert.equal(flattened[1].id, "project-10");
  assert.equal(flattened[2].globalIndex, 2);
  assert.equal(flattened[2].id, "task-42");
  assert.equal(flattened[3].globalIndex, 3);
  assert.equal(flattened[3].id, "member-5");
  assert.equal(flattened[4].globalIndex, 4);
  assert.equal(flattened[4].id, "file-7");

  // Verify readable formatted subtitles
  assert.ok(flattened[2].subtitle.includes("AUTH-42"));
  assert.ok(flattened[2].subtitle.includes("Alice Smith"));
  assert.ok(flattened[3].subtitle.includes("bob@acme.com"));
  assert.ok(flattened[4].subtitle.includes("200 KB"));
});

test("TASK-401 [US-CMD-002 / FE REQ 4]: Cyclic keyboard navigation indices with wrap-around boundaries", () => {
  const totalCount = 4; // indices: 0, 1, 2, 3

  // ArrowDown wrap-around
  assert.equal(getNextNavIndex(-1, totalCount, "down"), 0);
  assert.equal(getNextNavIndex(0, totalCount, "down"), 1);
  assert.equal(getNextNavIndex(1, totalCount, "down"), 2);
  assert.equal(getNextNavIndex(2, totalCount, "down"), 3);
  assert.equal(getNextNavIndex(3, totalCount, "down"), 0); // wrap to top

  // ArrowUp wrap-around
  assert.equal(getNextNavIndex(-1, totalCount, "up"), 3);
  assert.equal(getNextNavIndex(0, totalCount, "up"), 3); // wrap to bottom
  assert.equal(getNextNavIndex(3, totalCount, "up"), 2);
  assert.equal(getNextNavIndex(2, totalCount, "up"), 1);
  assert.equal(getNextNavIndex(1, totalCount, "up"), 0);

  // Empty list returns -1
  assert.equal(getNextNavIndex(0, 0, "down"), -1);
  assert.equal(getNextNavIndex(0, 0, "up"), -1);
});

test("TASK-401 [US-CMD-002 / FE REQ 5]: Grouping flattened items preserves continuous globalIndex", () => {
  const items = [
    { id: "act-1", category: "Quick Actions", title: "Action 1", globalIndex: 0 },
    { id: "proj-1", category: "Projects", title: "Project 1", globalIndex: 1 },
    { id: "task-1", category: "Tasks", title: "Task 1", globalIndex: 2 },
    { id: "task-2", category: "Tasks", title: "Task 2", globalIndex: 3 },
  ];

  const groups = groupFlattenedItems(items);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].category, "Quick Actions");
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].globalIndex, 0);

  assert.equal(groups[1].category, "Projects");
  assert.equal(groups[1].items.length, 1);
  assert.equal(groups[1].items[0].globalIndex, 1);

  assert.equal(groups[2].category, "Tasks");
  assert.equal(groups[2].items.length, 2);
  assert.equal(groups[2].items[0].globalIndex, 2);
  assert.equal(groups[2].items[1].globalIndex, 3);
});
