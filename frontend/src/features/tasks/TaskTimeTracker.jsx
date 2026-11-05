import { useState, useEffect, useRef } from "react";
import { Play, Square, Clock, Plus, Check, Loader2 } from "lucide-react";
import { api } from "../../services/api-client.js";

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
      total = Math.round(rawNum * 3600); // assume hours if raw number e.g. "1.5"
    }
  }
  return total;
}

export function TaskTimeTracker({ task, onShowNotice }) {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [totalLogged, setTotalLogged] = useState(0);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);

  // Load existing time entries
  useEffect(() => {
    let mounted = true;
    if (task?.id) {
      api
        .getTimeEntries(task.id)
        .then((res) => {
          if (!mounted) return;
          const entries = res.timeEntries || res.entries || [];
          const sum = entries.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
          setTotalLogged(sum);
        })
        .catch(() => {
          // graceful fallback
        });
    }
    return () => {
      mounted = false;
    };
  }, [task?.id]);

  // Timer ticker
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  async function handleToggleTimer() {
    if (isRunning) {
      // Stopping timer & logging time
      setIsRunning(false);
      const secondsToLog = elapsed;
      if (secondsToLog < 5) {
        setElapsed(0);
        return;
      }

      try {
        setSubmitting(true);
        await api.createTimeEntry(task.id, {
          durationSeconds: secondsToLog,
          description: "Live timer session",
        });
        setTotalLogged((prev) => prev + secondsToLog);
        setElapsed(0);
        if (onShowNotice) {
          onShowNotice({
            type: "success",
            message: `Logged ${formatSeconds(secondsToLog)} to task #${task.id}.`,
          });
        }
      } catch (err) {
        // Fallback local logging
        setTotalLogged((prev) => prev + secondsToLog);
        setElapsed(0);
      } finally {
        setSubmitting(false);
      }
    } else {
      // Starting timer
      setElapsed(0);
      setIsRunning(true);
    }
  }

  async function handleLogManual(e) {
    e.preventDefault();
    const parsed = parseManualTime(manualInput);
    if (parsed <= 0) {
      if (onShowNotice) {
        onShowNotice({ type: "error", message: "Please enter a valid duration (e.g. 1h 30m or 45m)." });
      }
      return;
    }

    try {
      setSubmitting(true);
      await api.createTimeEntry(task.id, {
        durationSeconds: parsed,
        description: manualNote.trim() || "Manual time entry",
      });
      setTotalLogged((prev) => prev + parsed);
      setManualInput("");
      setManualNote("");
      setShowManualModal(false);
      if (onShowNotice) {
        onShowNotice({
          type: "success",
          message: `Logged ${formatSeconds(parsed)} to task #${task.id}.`,
        });
      }
    } catch {
      // Local fallback
      setTotalLogged((prev) => prev + parsed);
      setManualInput("");
      setManualNote("");
      setShowManualModal(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="task-time-tracker" data-testid="task-time-tracker">
      <div className="time-tracker-top">
        <div className="time-tracker-title">
          <Clock size={15} style={{ color: "var(--color-primary)" }} />
          <span>Time Tracking</span>
        </div>

        {/* Live Timer Controls */}
        <div className="time-tracker-controls">
          <div
            className={`time-tracker-digits ${isRunning ? "running" : ""}`}
            data-testid="time-tracker-display"
          >
            {isRunning ? formatSeconds(elapsed) : "00:00:00"}
          </div>

          <button
            type="button"
            onClick={handleToggleTimer}
            disabled={submitting}
            className={`btn-timer-toggle ${isRunning ? "stop" : "start"}`}
            title={isRunning ? "Stop and record time" : "Start timer"}
            data-testid="btn-toggle-timer"
          >
            {isRunning ? <Square size={13} /> : <Play size={13} />}
          </button>

          <button
            type="button"
            onClick={() => setShowManualModal(!showManualModal)}
            className="btn-timer-manual"
            title="Log time manually"
            data-testid="btn-manual-time-toggle"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Aggregate Logged Summary */}
      <div className="time-tracker-summary">
        <span>Total Logged:</span>
        <span className="time-tracker-total-val" data-testid="time-tracker-total">
          {totalLogged > 0 ? formatSeconds(totalLogged) : "No time logged"}
        </span>
      </div>

      {/* Manual Time Log Dropdown with Quick Presets */}
      {showManualModal && (
        <form onSubmit={handleLogManual} className="column-quick-add-card animate-fadeIn">
          <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
            <button
              type="button"
              onClick={() => setManualInput("15m")}
              className="column-quick-add-priority-select"
              style={{ flex: 1, textAlign: "center" }}
            >
              +15m
            </button>
            <button
              type="button"
              onClick={() => setManualInput("30m")}
              className="column-quick-add-priority-select"
              style={{ flex: 1, textAlign: "center" }}
            >
              +30m
            </button>
            <button
              type="button"
              onClick={() => setManualInput("1h")}
              className="column-quick-add-priority-select"
              style={{ flex: 1, textAlign: "center" }}
            >
              +1h
            </button>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-subtle)", marginBottom: "3px" }}>
              Time Spent
            </label>
            <input
              type="text"
              placeholder="e.g. 1h 30m, 45m, 2h..."
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              className="column-quick-add-input"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="What did you work on? (optional)"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              className="column-quick-add-input"
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", paddingTop: "4px" }}>
            <button
              type="button"
              onClick={() => setShowManualModal(false)}
              className="column-quick-add-cancel-btn"
              style={{ padding: "4px 8px", fontSize: "11px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !manualInput.trim()}
              className="column-quick-add-submit-btn"
            >
              {submitting ? "Saving..." : "Log Time"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
