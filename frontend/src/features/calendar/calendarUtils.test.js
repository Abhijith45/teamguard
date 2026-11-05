import test from "node:test";
import assert from "node:assert/strict";
import {
  WEEKDAYS,
  MONTH_NAMES,
  isLeapYear,
  getDaysInMonth,
  normalizeDateKey,
  getCalendarGrid,
  mapTasksToCalendarDays,
  getAdjacentMonth,
  getTodayCoordinates,
  formatMonthYear,
  getCalendarMetrics,
  filterCalendarTasks,
  getWeekDays,
  getAdjacentWeek,
  getAdjacentDay,
  formatWeekRange,
  formatDayDate,
  getUnscheduledTasks,
  groupTasksForAgenda,
} from "./calendarUtils.js";

test("TASK-402 [US-CAL-001 / Calendar Grid Math]: Leap year and days in month calculation", () => {
  // Leap year rules
  assert.equal(isLeapYear(2024), true, "2024 is a leap year (divisible by 4)");
  assert.equal(isLeapYear(2025), false, "2025 is not a leap year");
  assert.equal(isLeapYear(2026), false, "2026 is not a leap year");
  assert.equal(isLeapYear(2000), true, "2000 is a leap year (divisible by 400)");
  assert.equal(isLeapYear(1900), false, "1900 is not a leap year (divisible by 100, not 400)");

  // Days in February across leap and non-leap years
  assert.equal(getDaysInMonth(2024, 1), 29, "Feb 2024 has 29 days");
  assert.equal(getDaysInMonth(2025, 1), 28, "Feb 2025 has 28 days");
  assert.equal(getDaysInMonth(2026, 1), 28, "Feb 2026 has 28 days");

  // Standard months
  assert.equal(getDaysInMonth(2026, 0), 31, "January has 31 days");
  assert.equal(getDaysInMonth(2026, 3), 30, "April has 30 days");
  assert.equal(getDaysInMonth(2026, 9), 31, "October has 31 days");
});

test("TASK-402 [US-CAL-001 / 7-Column Grid]: Builds clean Monday-to-Sunday 7-column monthly grid", () => {
  // October 2026 (1st is a Thursday)
  // Mon(0), Tue(1), Wed(2), Thu(3), Fri(4), Sat(5), Sun(6)
  const grid = getCalendarGrid(2026, 9, new Date("2026-10-17T00:00:00.000Z"));

  // Must be divisible by 7
  assert.equal(grid.length % 7, 0, "Grid must consist of complete 7-day rows");
  assert.ok(grid.length === 35 || grid.length === 42, "Grid should have 5 or 6 complete weeks");

  // Check 7 column weekdays
  assert.equal(WEEKDAYS.length, 7);
  assert.equal(WEEKDAYS[0], "Mon");
  assert.equal(WEEKDAYS[6], "Sun");

  // Leading days: Oct 1 is Thursday (index 3 in Mon-Sun).
  // Thus indices 0, 1, 2 must be from previous month (September 28, 29, 30).
  assert.equal(grid[0].day, 28);
  assert.equal(grid[0].isCurrentMonth, false);
  assert.equal(grid[0].isPrevMonth, true);
  assert.equal(grid[0].colIndex, 0);

  assert.equal(grid[2].day, 30);
  assert.equal(grid[2].isCurrentMonth, false);

  // October 1st starts at index 3
  assert.equal(grid[3].day, 1);
  assert.equal(grid[3].isCurrentMonth, true);
  assert.equal(grid[3].dateString, "2026-10-01");
  assert.equal(grid[3].colIndex, 3);

  // Today marker (Oct 17, 2026)
  const todayCell = grid.find((c) => c.dateString === "2026-10-17");
  assert.ok(todayCell, "October 17 cell must exist in grid");
  assert.equal(todayCell.isToday, true, "October 17 must be marked as isToday");
  assert.equal(todayCell.isCurrentMonth, true);

  // Weekend markers
  const saturday = grid.find((c) => c.colIndex === 5);
  const sunday = grid.find((c) => c.colIndex === 6);
  assert.equal(saturday.isWeekend, true);
  assert.equal(sunday.isWeekend, true);
});

test("TASK-402 [US-CAL-001 / Task Mapping]: Maps tasks to calendar day cells by dueDate", () => {
  const grid = getCalendarGrid(2026, 9, new Date("2026-10-17T00:00:00.000Z"));
  const tasks = [
    {
      id: 101,
      title: "Deploy V2 Gateway",
      dueDate: "2026-10-17T18:00:00.000Z",
      status: "IN_PROGRESS",
      priority: "URGENT",
      projectId: 1,
    },
    {
      id: 102,
      title: "Security Compliance Review",
      dueDate: "2026-10-17T20:00:00.000Z",
      status: "TODO",
      priority: "HIGH",
      projectId: 1,
    },
    {
      id: 103,
      title: "Design System Tokens",
      dueDate: "2026-10-24T12:00:00.000Z",
      status: "DONE",
      priority: "MEDIUM",
      projectId: 2,
    },
    {
      id: 104,
      title: "Unscheduled Task",
      dueDate: null, // Should not crash and not map
      status: "TODO",
    },
  ];

  const mappedGrid = mapTasksToCalendarDays(tasks, grid);

  // Verify Oct 17 day cell
  const oct17 = mappedGrid.find((c) => c.dateString === "2026-10-17");
  assert.ok(oct17);
  assert.equal(oct17.tasks.length, 2);
  assert.equal(oct17.taskCount, 2);
  assert.equal(oct17.hasTasks, true);
  assert.equal(oct17.hasUrgent, true);
  // Verify urgent task sorted first
  assert.equal(oct17.tasks[0].id, 101);

  // Verify Oct 24 day cell
  const oct24 = mappedGrid.find((c) => c.dateString === "2026-10-24");
  assert.ok(oct24);
  assert.equal(oct24.tasks.length, 1);
  assert.equal(oct24.tasks[0].id, 103);
  assert.equal(oct24.hasDone, true);

  // Verify day without tasks
  const oct18 = mappedGrid.find((c) => c.dateString === "2026-10-18");
  assert.equal(oct18.tasks.length, 0);
  assert.equal(oct18.hasTasks, false);
});

test("TASK-402 [US-CAL-002 / Month Navigation & Reset]: Adjacent month transitions & Today coordinates", () => {
  // Normal month transition
  assert.deepEqual(getAdjacentMonth(2026, 9, "prev"), { year: 2026, month: 8 });
  assert.deepEqual(getAdjacentMonth(2026, 9, "next"), { year: 2026, month: 10 });

  // Year rollover (December -> January)
  assert.deepEqual(getAdjacentMonth(2026, 11, "next"), { year: 2027, month: 0 });

  // Year rollover (January -> December)
  assert.deepEqual(getAdjacentMonth(2026, 0, "prev"), { year: 2025, month: 11 });

  // Month Year heading formatter
  assert.equal(formatMonthYear(2026, 9), "October 2026");
  assert.equal(formatMonthYear(2024, 1), "February 2024");

  // Today coordinates
  const fixedDate = new Date("2026-10-17T13:00:00.000Z");
  const todayCoords = getTodayCoordinates(fixedDate);
  assert.equal(todayCoords.year, 2026);
  assert.equal(todayCoords.month, 9); // October = 9
  assert.equal(todayCoords.day, 17);
  assert.equal(todayCoords.dateString, "2026-10-17");
});

test("TASK-402 [US-CAL-001 / Metrics & Filtering]: Computes monthly summary metrics and filters", () => {
  const referenceToday = new Date("2026-10-17T00:00:00.000Z");
  const tasks = [
    {
      id: 1,
      projectId: 10,
      title: "Past Overdue Task",
      dueDate: "2026-10-05T00:00:00.000Z",
      status: "TODO",
      priority: "HIGH",
      assigneeId: 4,
    },
    {
      id: 2,
      projectId: 10,
      title: "Completed Task",
      dueDate: "2026-10-10T00:00:00.000Z",
      status: "DONE",
      priority: "MEDIUM",
      assigneeId: 4,
    },
    {
      id: 3,
      projectId: 20,
      title: "Today Urgent Task",
      dueDate: "2026-10-17T00:00:00.000Z",
      status: "IN_PROGRESS",
      priority: "URGENT",
      assigneeId: 99,
    },
    {
      id: 4,
      projectId: 10,
      title: "Next Month Task",
      dueDate: "2026-11-05T00:00:00.000Z",
      status: "TODO",
      priority: "LOW",
      assigneeId: 4,
    },
  ];

  // 1. Month metrics (October 2026)
  const metrics = getCalendarMetrics(tasks, 2026, 9, referenceToday);
  assert.equal(metrics.totalScheduled, 3, "Only October tasks counted");
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.inProgress, 2);
  assert.equal(metrics.overdue, 1, "Task 1 (Oct 5) is before today and incomplete");
  assert.equal(metrics.urgentCount, 2);

  // 2. Client-side filtering by project
  const filteredByProj = filterCalendarTasks(tasks, { projectId: 20 });
  assert.equal(filteredByProj.length, 1);
  assert.equal(filteredByProj[0].id, 3);

  // 3. Client-side filtering by status
  const activeTasks = filterCalendarTasks(tasks, { statusFilter: "active" });
  assert.equal(activeTasks.length, 3);
  assert.ok(!activeTasks.some((t) => t.status === "DONE"));

  // 4. Client-side filtering by current user
  const myTasks = filterCalendarTasks(tasks, { assigneeId: "me", currentUserId: 4 });
  assert.equal(myTasks.length, 3);
  assert.ok(myTasks.every((t) => t.assigneeId === 4));
});
test("TASK-402 [Phase 1 / Week & Day Math]: Generates 7-day week matrix and navigates weeks/days", () => {
  // Wednesday, Oct 14, 2026
  const refWednesday = new Date("2026-10-14T12:00:00.000Z");
  const todayDate = new Date("2026-10-14T00:00:00.000Z");
  const weekDays = getWeekDays(refWednesday, todayDate);

  assert.equal(weekDays.length, 7, "Week must have exactly 7 days");
  assert.equal(weekDays[0].weekdayName, "Mon");
  assert.equal(weekDays[0].day, 12, "Monday of that week is Oct 12");
  assert.equal(weekDays[6].weekdayName, "Sun");
  assert.equal(weekDays[6].day, 18, "Sunday of that week is Oct 18");
  assert.equal(weekDays[2].isToday, true, "Wednesday Oct 14 is marked isToday");

  // Format week range
  const rangeStr = formatWeekRange(weekDays[0].date, weekDays[6].date);
  assert.equal(rangeStr, "Oct 12 – 18, 2026");

  // Navigate adjacent week
  const nextWeek = getAdjacentWeek(refWednesday, "next");
  assert.equal(nextWeek.getDate(), 21);
  const prevWeek = getAdjacentWeek(refWednesday, "prev");
  assert.equal(prevWeek.getDate(), 7);

  // Navigate adjacent day
  const nextDay = getAdjacentDay(refWednesday, "next");
  assert.equal(nextDay.getDate(), 15);
  const prevDay = getAdjacentDay(refWednesday, "prev");
  assert.equal(prevDay.getDate(), 13);

  // Format day date
  const dayStr = formatDayDate(refWednesday);
  assert.equal(dayStr, "Wednesday, October 14, 2026");
});

test("TASK-402 [Phase 1 / Unscheduled & Agenda Grouping]: Filters unscheduled tasks and builds chronological agenda feed", () => {
  const refToday = new Date("2026-10-14T00:00:00.000Z");
  const testTasks = [
    { id: 1, title: "Unscheduled 1", dueDate: null, status: "TODO", priority: "MEDIUM" },
    { id: 2, title: "Unscheduled 2", dueDate: undefined, status: "TODO", priority: "HIGH" },
    { id: 3, title: "Overdue Item", dueDate: "2026-10-10T12:00:00.000Z", status: "TODO", priority: "URGENT" },
    { id: 4, title: "Today Release", dueDate: "2026-10-14T15:00:00.000Z", status: "IN_PROGRESS", priority: "HIGH" },
    { id: 5, title: "Tomorrow Delivery", dueDate: "2026-10-15T09:00:00.000Z", status: "TODO", priority: "MEDIUM" },
    { id: 6, title: "Upcoming Sprint Review", dueDate: "2026-10-18T18:00:00.000Z", status: "TODO", priority: "LOW" },
    { id: 7, title: "Next Month Feature", dueDate: "2026-11-20T12:00:00.000Z", status: "TODO", priority: "LOW" },
  ];

  // 1. Unscheduled tasks extraction
  const unscheduled = getUnscheduledTasks(testTasks);
  assert.equal(unscheduled.length, 2);
  assert.equal(unscheduled[0].id, 1);
  assert.equal(unscheduled[1].id, 2);

  // 2. Agenda grouping
  const agendaGroups = groupTasksForAgenda(testTasks, refToday);
  assert.ok(agendaGroups.length >= 4);

  const overdueGroup = agendaGroups.find((g) => g.key === "overdue");
  assert.ok(overdueGroup);
  assert.equal(overdueGroup.tasks.length, 1);
  assert.equal(overdueGroup.tasks[0].id, 3);

  const todayGroup = agendaGroups.find((g) => g.key === "today");
  assert.ok(todayGroup);
  assert.equal(todayGroup.tasks.length, 1);
  assert.equal(todayGroup.tasks[0].id, 4);

  const tomorrowGroup = agendaGroups.find((g) => g.key === "tomorrow");
  assert.ok(tomorrowGroup);
  assert.equal(tomorrowGroup.tasks.length, 1);
  assert.equal(tomorrowGroup.tasks[0].id, 5);
});
