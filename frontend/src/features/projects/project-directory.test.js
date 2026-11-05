import test from "node:test";
import assert from "node:assert/strict";

function filterProjects({ projects, query = "", selectedSpaceId = "ALL", showArchived = false }) {
  const q = query.trim().toLowerCase();
  return projects.filter((p) => {
    if (!showArchived && p.isArchived) return false;
    if (selectedSpaceId !== "ALL") {
      if (selectedSpaceId === "GENERAL" && p.spaceId) return false;
      if (selectedSpaceId !== "GENERAL" && String(p.spaceId) !== String(selectedSpaceId)) return false;
    }
    if (!q) return true;
    const nameMatch = (p.name || "").toLowerCase().includes(q);
    const keyMatch = (p.key || "").toLowerCase().includes(q);
    const descMatch = (p.description || "").toLowerCase().includes(q);
    return nameMatch || keyMatch || descMatch;
  });
}

test("TASK-DIR-001 [Filtering]: Filters out archived projects by default", () => {
  const projects = [
    { id: 1, name: "Active Proj", key: "ACT", isArchived: false },
    { id: 2, name: "Archived Proj", key: "ARC", isArchived: true },
  ];

  const result = filterProjects({ projects, showArchived: false });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);

  const withArchived = filterProjects({ projects, showArchived: true });
  assert.equal(withArchived.length, 2);
});

test("TASK-DIR-002 [Search]: Matches project name, key, and description case-insensitively", () => {
  const projects = [
    { id: 1, name: "Checkout Service", key: "CHK", description: "Stripe flows", isArchived: false },
    { id: 2, name: "Authentication", key: "AUTH", description: "JWT rotation", isArchived: false },
    { id: 3, name: "Mobile App", key: "MOB", description: "React Native", isArchived: false },
  ];

  assert.equal(filterProjects({ projects, query: "chk" }).length, 1);
  assert.equal(filterProjects({ projects, query: "auth" }).length, 1);
  assert.equal(filterProjects({ projects, query: "stripe" }).length, 1);
  assert.equal(filterProjects({ projects, query: "xyz" }).length, 0);
});

test("TASK-DIR-003 [Space Grouping]: Scopes projects to specific Space container", () => {
  const projects = [
    { id: 1, name: "Backend API", spaceId: 10, isArchived: false },
    { id: 2, name: "Frontend Web", spaceId: 10, isArchived: false },
    { id: 3, name: "Unassigned Project", spaceId: null, isArchived: false },
  ];

  assert.equal(filterProjects({ projects, selectedSpaceId: 10 }).length, 2);
  assert.equal(filterProjects({ projects, selectedSpaceId: "GENERAL" }).length, 1);
  assert.equal(filterProjects({ projects, selectedSpaceId: "ALL" }).length, 3);
});
