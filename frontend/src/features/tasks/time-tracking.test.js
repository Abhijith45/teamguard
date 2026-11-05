import test from "node:test";
import assert from "node:assert/strict";

function formatSeconds(totalSec) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function parseManualTime(str) {
  if (!str) return 0;
  let total = 0;
  const hourMatch = str.match(/(\d+)\s*h/i);
  const minMatch = str.match(/(\d+)\s*m/i);
  const secMatch = str.match(/(\d+)\s*s/i);

  if (hourMatch) total += parseInt(hourMatch[1], 10) * 3600;
  if (minMatch) total += parseInt(minMatch[1], 10) * 60;
  if (secMatch) total += parseInt(secMatch[1], 10);

  if (!hourMatch && !minMatch && !secMatch) {
    const rawNum = parseFloat(str);
    if (!isNaN(rawNum)) {
      total = Math.round(rawNum * 3600);
    }
  }
  return total;
}

test("TASK-TIME-001 [Formatting]: Formats durations into human-readable strings", () => {
  assert.equal(formatSeconds(45), "45s");
  assert.equal(formatSeconds(90), "1m 30s");
  assert.equal(formatSeconds(3600), "1h 0m 0s");
  assert.equal(formatSeconds(5400), "1h 30m 0s");
  assert.equal(formatSeconds(3665), "1h 1m 5s");
});

test("TASK-TIME-002 [Parsing]: Accurately parses human time strings into seconds", () => {
  assert.equal(parseManualTime("1h 30m"), 5400);
  assert.equal(parseManualTime("45m"), 2700);
  assert.equal(parseManualTime("2h"), 7200);
  assert.equal(parseManualTime("30s"), 30);
  assert.equal(parseManualTime("1h 15m 20s"), 4520);
  assert.equal(parseManualTime("2.5"), 9000); // 2.5 hours
  assert.equal(parseManualTime(""), 0);
  assert.equal(parseManualTime(null), 0);
});
