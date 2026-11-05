/**
 * Pure utility functions for the Workspace Release Calendar Grid (TASK-402)
 * Handles 7-column (Mon–Sun) date matrix generation, leap years, padding days,
 * task dueDate mapping, month navigation math, and summary metrics.
 */

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Checks whether a given year is a leap year.
 * @param {number} year
 * @returns {boolean}
 */
export function isLeapYear(year) {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Returns number of days in a given year and month (0-indexed).
 * @param {number} year
 * @param {number} month - 0 to 11
 * @returns {number}
 */
export function getDaysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (m === 1) {
    return isLeapYear(y) ? 29 : 28;
  }
  // Days in 31-day months: Jan(0), Mar(2), May(4), Jul(6), Aug(7), Oct(9), Dec(11)
  if ([0, 2, 4, 6, 7, 9, 11].includes(m)) {
    return 31;
  }
  return 30;
}

/**
 * Normalizes an arbitrary date input (Date, ISO string, or timestamp)
 * into a canonical "YYYY-MM-DD" local calendar date string.
 *
 * @param {Date|string|number|null|undefined} dateInput
 * @returns {string|null}
 */
export function normalizeDateKey(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === "string") {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;

    // Use local date values as fallback for Date objects
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Builds a 7-column (Monday through Sunday) day matrix for the specified year and month.
 * Automatically computes leading padding days from the previous month and
 * trailing padding days from the next month so each row has 7 cells.
 *
 * @param {number} year
 * @param {number} month - 0 to 11
 * @param {Date} [todayDate=new Date()]
 * @returns {Array<Object>} Flat array of day cell objects
 */
export function getCalendarGrid(year, month, todayDate = new Date()) {
  const y = Number(year);
  const m = Number(month);
  const todayKey = normalizeDateKey(todayDate);

  const daysInCurrentMonth = getDaysInMonth(y, m);

  // Determine what day of the week the 1st of the month falls on
  // JS getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const firstDayJs = new Date(y, m, 1).getDay();
  // Mon-Sun offset (Monday is index 0, Sunday is index 6):
  const leadingDaysCount = (firstDayJs + 6) % 7;

  // Previous month details for leading padding
  const prevMonth = m === 0 ? 11 : m - 1;
  const prevYear = m === 0 ? y - 1 : y;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  const grid = [];

  // 1. Leading days from previous month
  for (let i = leadingDaysCount - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const dateKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const colIndex = grid.length % 7;
    grid.push({
      year: prevYear,
      month: prevMonth,
      day: dayNum,
      dateString: dateKey,
      isCurrentMonth: false,
      isPrevMonth: true,
      isNextMonth: false,
      isToday: dateKey === todayKey,
      isWeekend: colIndex === 5 || colIndex === 6,
      colIndex,
      tasks: [],
    });
  }

  // 2. Days of current month
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const colIndex = grid.length % 7;
    grid.push({
      year: y,
      month: m,
      day: d,
      dateString: dateKey,
      isCurrentMonth: true,
      isPrevMonth: false,
      isNextMonth: false,
      isToday: dateKey === todayKey,
      isWeekend: colIndex === 5 || colIndex === 6,
      colIndex,
      tasks: [],
    });
  }

  // 3. Trailing days from next month to complete the 7-column rows
  const remainingCells = (7 - (grid.length % 7)) % 7;
  const nextMonth = m === 11 ? 0 : m + 1;
  const nextYear = m === 11 ? y + 1 : y;

  for (let d = 1; d <= remainingCells; d++) {
    const dateKey = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const colIndex = grid.length % 7;
    grid.push({
      year: nextYear,
      month: nextMonth,
      day: d,
      dateString: dateKey,
      isCurrentMonth: false,
      isPrevMonth: false,
      isNextMonth: true,
      isToday: dateKey === todayKey,
      isWeekend: colIndex === 5 || colIndex === 6,
      colIndex,
      tasks: [],
    });
  }

  return grid;
}

/**
 * Maps tasks to matching calendar day cells by their dueDate.
 *
 * @param {Array<Object>} tasks
 * @param {Array<Object>} grid - From getCalendarGrid
 * @returns {Array<Object>} Grid with populated `tasks` arrays and summary metrics
 */
export function mapTasksToCalendarDays(tasks = [], grid = []) {
  const taskMap = new Map();

  for (const task of tasks || []) {
    if (!task || !task.dueDate) continue;
    const dateKey = normalizeDateKey(task.dueDate);
    if (!dateKey) continue;

    if (!taskMap.has(dateKey)) {
      taskMap.set(dateKey, []);
    }
    taskMap.get(dateKey).push(task);
  }

  return grid.map((cell) => {
    const dayTasks = taskMap.get(cell.dateString) || [];
    // Sort day tasks: URGENT first, then HIGH, MEDIUM, LOW, and completed last
    const sortedTasks = [...dayTasks].sort((a, b) => {
      const isDoneA = a.status === "DONE" ? 1 : 0;
      const isDoneB = b.status === "DONE" ? 1 : 0;
      if (isDoneA !== isDoneB) return isDoneA - isDoneB;

      const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const pA = priorityOrder[a.priority] ?? 2;
      const pB = priorityOrder[b.priority] ?? 2;
      return pA - pB;
    });

    return {
      ...cell,
      tasks: sortedTasks,
      taskCount: sortedTasks.length,
      hasTasks: sortedTasks.length > 0,
      hasDone: sortedTasks.some((t) => t.status === "DONE"),
      hasUrgent: sortedTasks.some((t) => t.priority === "URGENT"),
    };
  });
}

/**
 * Computes adjacent month coordinates for navigation.
 * Handles December -> January and January -> December year boundary rollovers.
 *
 * @param {number} year
 * @param {number} month - 0 to 11
 * @param {"prev"|"next"} direction
 * @returns {{ year: number, month: number }}
 */
export function getAdjacentMonth(year, month, direction) {
  const y = Number(year);
  const m = Number(month);

  if (direction === "prev") {
    if (m === 0) return { year: y - 1, month: 11 };
    return { year: y, month: m - 1 };
  }
  if (direction === "next") {
    if (m === 11) return { year: y + 1, month: 0 };
    return { year: y, month: m + 1 };
  }
  return { year: y, month: m };
}

/**
 * Returns current local date coordinates for the "Today" quick reset button.
 *
 * @param {Date} [referenceDate=new Date()]
 * @returns {{ year: number, month: number, day: number, dateString: string }}
 */
export function getTodayCoordinates(referenceDate = new Date()) {
  const d = new Date(referenceDate);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    dateString: normalizeDateKey(d),
  };
}

/**
 * Formats Month and Year heading (e.g. "October 2026").
 *
 * @param {number} year
 * @param {number} month - 0 to 11
 * @returns {string}
 */
export function formatMonthYear(year, month) {
  const name = MONTH_NAMES[month] || "Month";
  return `${name} ${year}`;
}

/**
 * Computes summary KPI metrics for tasks scheduled in the selected month view.
 *
 * @param {Array<Object>} tasks
 * @param {number} year
 * @param {number} month - 0 to 11
 * @param {Date} [todayDate=new Date()]
 * @returns {{ totalScheduled: number, completed: number, inProgress: number, overdue: number, urgentCount: number }}
 */
export function getCalendarMetrics(tasks = [], year, month, todayDate = new Date()) {
  const y = Number(year);
  const m = Number(month);
  const todayKey = normalizeDateKey(todayDate);

  let totalScheduled = 0;
  let completed = 0;
  let inProgress = 0;
  let overdue = 0;
  let urgentCount = 0;

  for (const t of tasks || []) {
    if (!t || !t.dueDate) continue;
    const dateKey = normalizeDateKey(t.dueDate);
    if (!dateKey) continue;

    const [tYearStr, tMonthStr] = dateKey.split("-");
    const tYear = Number(tYearStr);
    const tMonth = Number(tMonthStr) - 1;

    if (tYear === y && tMonth === m) {
      totalScheduled++;

      if (t.status === "DONE") {
        completed++;
      } else {
        inProgress++;
        if (todayKey && dateKey < todayKey) {
          overdue++;
        }
      }

      if (t.priority === "URGENT" || t.priority === "HIGH") {
        urgentCount++;
      }
    }
  }

  return {
    totalScheduled,
    completed,
    inProgress,
    overdue,
    urgentCount,
  };
}

/**
 * Client-side filter helper for calendar tasks.
 *
 * @param {Array<Object>} tasks
 * @param {Object} filters
 * @param {number|string} [filters.projectId="all"]
 * @param {string} [filters.statusFilter="all"] - "all", "active", "done"
 * @param {string} [filters.priorityFilter="all"] - "all", "URGENT", "HIGH", "MEDIUM", "LOW"
 * @param {number|string|null} [filters.assigneeId="all"] - "all", "me", number
 * @param {number} [filters.currentUserId]
 * @returns {Array<Object>}
 */
export function filterCalendarTasks(tasks = [], filters = {}) {
  const {
    projectId = "all",
    statusFilter = "all",
    priorityFilter = "all",
    assigneeId = "all",
    currentUserId,
  } = filters;

  return (tasks || []).filter((task) => {
    // Project filter
    if (projectId && projectId !== "all") {
      if (Number(task.projectId) !== Number(projectId)) return false;
    }

    // Status filter
    if (statusFilter === "done" && task.status !== "DONE") return false;
    if (statusFilter === "active" && task.status === "DONE") return false;

    // Priority filter
    if (priorityFilter && priorityFilter !== "all") {
      if (task.priority !== priorityFilter) return false;
    }

    // Assignee filter
    if (assigneeId === "me" && currentUserId) {
      if (Number(task.assigneeId) !== Number(currentUserId)) return false;
    } else if (assigneeId && assigneeId !== "all") {
      if (Number(task.assigneeId) !== Number(assigneeId)) return false;
    }

    return true;
  });
}
/**
 * Returns 7 days for the week containing referenceDate (Monday through Sunday).
 * @param {Date|string} [referenceDate=new Date()]
 * @param {Date|string} [todayDate=new Date()]
 * @returns {Array<Object>} 7 day objects with full week metadata
 */
export function getWeekDays(referenceDate = new Date(), todayDate = new Date()) {
  const d = new Date(referenceDate);
  const todayKey = normalizeDateKey(todayDate);
  const dayOfWeek = d.getDay();
  const monOffset = (dayOfWeek + 6) % 7;

  const monday = new Date(d);
  monday.setDate(d.getDate() - monOffset);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const dateKey = normalizeDateKey(current);
    days.push({
      date: current,
      year: current.getFullYear(),
      month: current.getMonth(),
      day: current.getDate(),
      dateString: dateKey,
      weekdayName: WEEKDAYS[i],
      weekdayFull: WEEKDAYS_FULL[i],
      isToday: dateKey === todayKey,
      isWeekend: i === 5 || i === 6,
      colIndex: i,
      tasks: [],
    });
  }
  return days;
}

/**
 * Returns adjacent week reference date.
 * @param {Date|string} referenceDate
 * @param {"prev"|"next"} direction
 * @returns {Date}
 */
export function getAdjacentWeek(referenceDate, direction) {
  const d = new Date(referenceDate);
  const diff = direction === "prev" ? -7 : 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Returns adjacent day reference date.
 * @param {Date|string} referenceDate
 * @param {"prev"|"next"} direction
 * @returns {Date}
 */
export function getAdjacentDay(referenceDate, direction) {
  const d = new Date(referenceDate);
  const diff = direction === "prev" ? -1 : 1;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Formats a clean date range label for a week (e.g. "Nov 2 – Nov 8, 2026").
 * @param {Date|string} start
 * @param {Date|string} end
 * @returns {string}
 */
export function formatWeekRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const sMonth = MONTH_NAMES[s.getMonth()]?.slice(0, 3) || "";
  const eMonth = MONTH_NAMES[e.getMonth()]?.slice(0, 3) || "";
  const sYear = s.getFullYear();
  const eYear = e.getFullYear();

  if (sYear === eYear && sMonth === eMonth) {
    return `${sMonth} ${s.getDate()} – ${e.getDate()}, ${sYear}`;
  }
  if (sYear === eYear) {
    return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${sYear}`;
  }
  return `${sMonth} ${s.getDate()}, ${sYear} – ${eMonth} ${e.getDate()}, ${eYear}`;
}

/**
 * Formats a single day date header (e.g. "Wednesday, November 4, 2026").
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDayDate(date) {
  const d = new Date(date);
  const weekday = WEEKDAYS_FULL[(d.getDay() + 6) % 7] || "";
  const month = MONTH_NAMES[d.getMonth()] || "";
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Extracts tasks that do not have a scheduled due date.
 * @param {Array<Object>} tasks
 * @returns {Array<Object>}
 */
export function getUnscheduledTasks(tasks = []) {
  return (tasks || []).filter((t) => !t.dueDate);
}

/**
 * Groups tasks chronologically for Agenda / Feed view.
 * @param {Array<Object>} tasks
 * @param {Date|string} [todayDate=new Date()]
 * @returns {Array<{ key: string, title: string, tasks: Array<Object> }>}
 */
export function groupTasksForAgenda(tasks = [], todayDate = new Date()) {
  const todayKey = normalizeDateKey(todayDate);
  const today = new Date(todayDate);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = normalizeDateKey(tomorrow);

  const groups = {
    overdue: { key: "overdue", title: "Overdue Deliverables", tasks: [] },
    today: { key: "today", title: "Due Today", tasks: [] },
    tomorrow: { key: "tomorrow", title: "Due Tomorrow", tasks: [] },
    upcoming: { key: "upcoming", title: "Next 7 Days", tasks: [] },
    later: { key: "later", title: "Later Releases", tasks: [] },
    unscheduled: { key: "unscheduled", title: "Unscheduled Tasks", tasks: [] },
  };

  const in7Days = new Date(today);
  in7Days.setDate(today.getDate() + 7);
  const in7DaysKey = normalizeDateKey(in7Days);

  for (const t of tasks || []) {
    if (!t.dueDate) {
      groups.unscheduled.tasks.push(t);
      continue;
    }
    const dKey = normalizeDateKey(t.dueDate);
    if (!dKey) {
      groups.unscheduled.tasks.push(t);
      continue;
    }

    if (t.status !== "DONE" && dKey < todayKey) {
      groups.overdue.tasks.push(t);
    } else if (dKey === todayKey) {
      groups.today.tasks.push(t);
    } else if (dKey === tomorrowKey) {
      groups.tomorrow.tasks.push(t);
    } else if (dKey > tomorrowKey && dKey <= in7DaysKey) {
      groups.upcoming.tasks.push(t);
    } else {
      groups.later.tasks.push(t);
    }
  }

  Object.values(groups).forEach((grp) => {
    grp.tasks.sort((a, b) => {
      const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const pA = priorityOrder[a.priority] ?? 2;
      const pB = priorityOrder[b.priority] ?? 2;
      if (pA !== pB) return pA - pB;
      return (a.dueDate || "").localeCompare(b.dueDate || "");
    });
  });

  return [
    groups.overdue,
    groups.today,
    groups.tomorrow,
    groups.upcoming,
    groups.later,
    groups.unscheduled,
  ].filter((g) => g.tasks.length > 0);
}
