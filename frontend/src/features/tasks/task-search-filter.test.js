import test from "node:test";
import assert from "node:assert/strict";

// Frontend unit test suite for TASK-206: Task Search, Filtering, Sorting & Pagination

function filterTasks(tasks, { searchTerm = "", filterProject = "ALL", filterAssignee = "ALL", filterStatus = "ALL", filterPriority = "ALL" } = {}) {
  return tasks.filter((t) => {
    // 1. Search term
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const titleMatch = (t.title || "").toLowerCase().includes(q);
      const descMatch = (t.description || "").toLowerCase().includes(q);
      const keyBadge = `${t.project?.key || "PROJ"}-${t.id}`.toLowerCase();
      const keyMatch = keyBadge.includes(q) || String(t.id) === q;
      if (!titleMatch && !descMatch && !keyMatch) return false;
    }

    // 2. Project filter
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
}

function paginateTasks(tasks, page = 1, pageSize = 10) {
  const total = tasks.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const validPage = Math.min(page, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const items = tasks.slice(startIndex, startIndex + pageSize);

  return {
    items,
    total,
    totalPages,
    currentPage: validPage,
    startIndex,
    endIndex: Math.min(startIndex + pageSize, total),
  };
}

const sampleTasks = [
  { id: 101, title: "Design authentication hero", description: "Figma wireframes", status: "TODO", priority: "HIGH", projectId: 1, project: { key: "AUTH" }, assigneeId: 10 },
  { id: 102, title: "Implement rate limiter", description: "Express middleware with redis", status: "IN_PROGRESS", priority: "URGENT", projectId: 1, project: { key: "AUTH" }, assigneeId: 10 },
  { id: 103, title: "Create checkout flow", description: "Stripe element tokens", status: "TODO", priority: "MEDIUM", projectId: 2, project: { key: "PAY" }, assigneeId: null },
  { id: 104, title: "Write audit tests", description: "Verify immutable logs", status: "DONE", priority: "LOW", projectId: 2, project: { key: "PAY" }, assigneeId: 20 },
  { id: 105, title: "Security headers configuration", description: "Helmet CSP and HSTS", status: "DONE", priority: "HIGH", projectId: 1, project: { key: "AUTH" }, assigneeId: null },
];

test("TASK-206 [FE REQ 1 / Search]: Case-insensitive search matches title, description, and JIRA key badge", () => {
  // Title match
  const resTitle = filterTasks(sampleTasks, { searchTerm: "Hero" });
  assert.equal(resTitle.length, 1);
  assert.equal(resTitle[0].id, 101);

  // Description match
  const resDesc = filterTasks(sampleTasks, { searchTerm: "redis" });
  assert.equal(resDesc.length, 1);
  assert.equal(resDesc[0].id, 102);

  // JIRA Key badge match
  const resKey = filterTasks(sampleTasks, { searchTerm: "PAY-103" });
  assert.equal(resKey.length, 1);
  assert.equal(resKey[0].id, 103);
});

test("TASK-206 [FE REQ 2 / Project Filter]: Filters tasks strictly by project ID", () => {
  const resProject2 = filterTasks(sampleTasks, { filterProject: "2" });
  assert.equal(resProject2.length, 2);
  for (const t of resProject2) {
    assert.equal(t.projectId, 2);
  }
});

test("TASK-206 [FE REQ 3 / Assignee Filter]: Filters assigned member or unassigned tasks", () => {
  // Assigned to User 10
  const resUser10 = filterTasks(sampleTasks, { filterAssignee: "10" });
  assert.equal(resUser10.length, 2);

  // Unassigned
  const resUnassigned = filterTasks(sampleTasks, { filterAssignee: "unassigned" });
  assert.equal(resUnassigned.length, 2);
  for (const t of resUnassigned) {
    assert.equal(t.assigneeId, null);
  }
});

test("TASK-206 [FE REQ 4 / Combined Filter]: Intersects status and priority filters", () => {
  const resCombined = filterTasks(sampleTasks, { filterStatus: "TODO", filterPriority: "HIGH" });
  assert.equal(resCombined.length, 1);
  assert.equal(resCombined[0].id, 101);
});

test("TASK-206 [FE REQ 5 / Pagination]: Accurately chunks items into pages and computes metadata", () => {
  const tasks = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, title: `Task ${i + 1}` }));

  // Page 1 with pageSize 10
  const p1 = paginateTasks(tasks, 1, 10);
  assert.equal(p1.items.length, 10);
  assert.equal(p1.items[0].id, 1);
  assert.equal(p1.items[9].id, 10);
  assert.equal(p1.totalPages, 3);
  assert.equal(p1.total, 25);
  assert.equal(p1.startIndex, 0);
  assert.equal(p1.endIndex, 10);

  // Page 3 with pageSize 10
  const p3 = paginateTasks(tasks, 3, 10);
  assert.equal(p3.items.length, 5);
  assert.equal(p3.items[0].id, 21);
  assert.equal(p3.items[4].id, 25);
  assert.equal(p3.startIndex, 20);
  assert.equal(p3.endIndex, 25);
});
