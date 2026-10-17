import { getAccessToken, getActiveOrgId, getApiBase } from "./api-client.js";
import { parseSseChunk, calculateReconnectionBackoff } from "../features/sync/syncUtils.js";

/**
 * EventStreamClient: Fetch-based Server-Sent Events (SSE) streaming client.
 *
 * Solves browser EventSource limitations by using native fetch + ReadableStream,
 * enabling authenticated headers (Authorization Bearer & x-organization-id).
 *
 * Features:
 * - Real-time event subscription with typed listeners
 * - Last-Event-ID cursor tracking and automatic reconnection replay
 * - Exponential backoff auto-reconnect on network drops
 * - Graceful connection lifecycle and resource cleanup via AbortController
 */
export class EventStreamClient {
  constructor(options = {}) {
    this.options = options;
    this.status = "disconnected"; // "disconnected" | "connecting" | "connected" | "reconnecting"
    this.lastEventId = null;
    this.reconnectAttempts = 0;
    this.abortController = null;
    this.reconnectTimer = null;
    this.listeners = new Map(); // Map<eventType, Set<Function>>
    this.statusListeners = new Set();
    this.isExplicitlyClosed = false;
  }

  getStatus() {
    return this.status;
  }

  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      for (const cb of this.statusListeners) {
        try {
          cb(newStatus);
        } catch (err) {
          console.error("[EventStreamClient] Status callback error:", err);
        }
      }
    }
  }

  onStatusChange(callback) {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  on(eventType, handler) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(handler);
    return () => this.off(eventType, handler);
  }

  off(eventType, handler) {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  emit(eventType, data, eventId) {
    // Specific event listeners
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data, eventId);
        } catch (err) {
          console.error(`[EventStreamClient] Error in listener for "${eventType}":`, err);
        }
      }
    }

    // Wildcard listeners
    const wildcardHandlers = this.listeners.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler({ event: eventType, data, eventId });
        } catch (err) {
          console.error(`[EventStreamClient] Error in wildcard listener:`, err);
        }
      }
    }
  }

  async connect() {
    this.isExplicitlyClosed = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const token = getAccessToken();
    const orgId = getActiveOrgId();

    if (!token || !orgId) {
      this.setStatus("disconnected");
      return;
    }

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.setStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      const baseUrl = getApiBase();
      const url = new URL(`${baseUrl}/events/stream`);
      if (this.options.projectId) {
        url.searchParams.set("projectId", String(this.options.projectId));
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        "x-organization-id": String(orgId),
        Accept: "text/event-stream",
      };

      if (this.lastEventId) {
        headers["Last-Event-ID"] = this.lastEventId;
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE stream connection failed with HTTP ${response.status}`);
      }

      this.setStatus("connected");
      this.reconnectAttempts = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let doubleNewlineIndex;
        while ((doubleNewlineIndex = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, doubleNewlineIndex);
          buffer = buffer.slice(doubleNewlineIndex + 2);

          if (!chunk.trim() || chunk.startsWith(":")) {
            // Heartbeat ping comment (: ping), connection is alive
            continue;
          }

          const parsed = parseSseChunk(chunk);
          if (parsed) {
            if (parsed.id) {
              this.lastEventId = parsed.id;
            }
            this.emit(parsed.event, parsed.data, parsed.id);
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError" || this.isExplicitlyClosed) {
        this.setStatus("disconnected");
        return;
      }
      console.warn("[EventStreamClient] Stream connection interrupted:", err.message);
    }

    // Attempt reconnection if not explicitly closed
    if (!this.isExplicitlyClosed) {
      this.scheduleReconnect();
    } else {
      this.setStatus("disconnected");
    }
  }

  scheduleReconnect() {
    this.setStatus("reconnecting");
    const delay = calculateReconnectionBackoff(this.reconnectAttempts++);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setStatus("disconnected");
  }
}

let activeClient = null;

/**
 * Returns or creates the singleton event stream client for the workspace.
 */
export function getWorkspaceEventStream(options = {}) {
  if (!activeClient) {
    activeClient = new EventStreamClient(options);
  }
  return activeClient;
}
