import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { ApiFault } from "./remote-browser-core";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type RemoteBrowserDebugEventSource = "webContents" | "debugger" | "system";

export interface RemoteBrowserDebugEvent {
  readonly seq: number;
  readonly eventId: string;
  readonly tabId: string;
  readonly documentId: string;
  readonly timestamp: number;
  readonly source: RemoteBrowserDebugEventSource;
  readonly type: string;
  readonly payload: JsonValue;
}

export interface RemoteBrowserCaptureOptions {
  console: boolean;
  navigation: boolean;
  runtime: boolean;
  network: boolean;
  page: boolean;
  log: boolean;
  crashes: boolean;
  /** Optional allow-list. A trailing `*` performs a prefix match. */
  types?: readonly string[];
}

export type RemoteBrowserCaptureInput =
  | boolean
  | readonly string[]
  | Partial<RemoteBrowserCaptureOptions>;

export type RemoteBrowserDebugSessionStatus = "active" | "stopped";

export interface RemoteBrowserDebugSession {
  readonly sessionId: string;
  readonly tabId: string;
  readonly status: RemoteBrowserDebugSessionStatus;
  readonly capture: RemoteBrowserCaptureOptions;
  readonly startedAt: number;
  readonly stoppedAt?: number;
  readonly eventCount: number;
  readonly droppedEventCount: number;
  readonly debuggerAttached: boolean;
}

export interface RemoteBrowserNetworkRequest {
  readonly requestId: string;
  readonly url?: string;
  readonly method?: string;
  readonly startedAt: number;
}

export interface RemoteBrowserRetainedResponseBody {
  readonly sessionId: string;
  readonly requestId: string;
  readonly url?: string;
  readonly status?: number;
  readonly mimeType?: string;
  readonly body: string;
  readonly base64Encoded: boolean;
  readonly bytes: number;
  readonly originalBytes: number;
  readonly truncated: boolean;
  readonly capturedAt: number;
}

export interface RemoteBrowserTabActivity {
  readonly tabId: string;
  readonly documentId: string;
  readonly pendingNetwork: number;
  readonly pendingRequests: readonly RemoteBrowserNetworkRequest[];
  readonly lastNetworkActivity: number | null;
  readonly lastRuntimeError: RemoteBrowserDebugEvent | null;
  readonly debuggerAttached: boolean;
  readonly activeSessions: number;
}

export interface RemoteBrowserEventBounds {
  readonly oldestSeq: number | null;
  readonly newestSeq: number | null;
  readonly size: number;
  readonly droppedCount: number;
}

const TAB_EVENT_LIMIT = 2_000;
const SESSION_EVENT_LIMIT = 4_000;
const RETAINED_STOPPED_SESSIONS = 25;
const MAX_ACTIVE_SESSIONS = 16;
const DEFAULT_EVENT_PAGE_SIZE = 200;
const MAX_EVENT_PAGE_SIZE = 1_000;
const MAX_STRING_LENGTH = 16_384;
const MAX_OBJECT_KEYS = 100;
const MAX_ARRAY_ITEMS = 200;
const MAX_JSON_DEPTH = 7;
const MAX_PAYLOAD_LENGTH = 128 * 1024;
const MAX_RETAINED_BODY_BYTES_PER_SESSION = 32 * 1024 * 1024;
const MAX_RETAINED_BODIES_PER_SESSION = 100;
const MAX_RETAINED_BODY_BYTES_GLOBAL = 64 * 1024 * 1024;

const DEFAULT_CAPTURE: RemoteBrowserCaptureOptions = Object.freeze({
  console: true,
  navigation: true,
  runtime: true,
  network: true,
  page: true,
  log: true,
  crashes: true,
});

class EventBuffer {
  private readonly values: RemoteBrowserDebugEvent[] = [];
  private dropped = 0;

  constructor(private readonly capacity: number) {}

  push(value: RemoteBrowserDebugEvent): void {
    this.values.push(value);
    if (this.values.length > this.capacity) {
      const removed = this.values.length - this.capacity;
      this.values.splice(0, removed);
      this.dropped += removed;
    }
  }

  toArray(): readonly RemoteBrowserDebugEvent[] {
    return this.values.slice();
  }

  find(eventId: string): RemoteBrowserDebugEvent | undefined {
    return this.values.find((event) => event.eventId === eventId);
  }

  get size(): number {
    return this.values.length;
  }

  get oldestSeq(): number | null {
    return this.values[0]?.seq ?? null;
  }

  get newestSeq(): number | null {
    return this.values.at(-1)?.seq ?? null;
  }

  get droppedCount(): number {
    return this.dropped;
  }
}

interface MutableSession {
  sessionId: string;
  tabId: string;
  status: RemoteBrowserDebugSessionStatus;
  capture: RemoteBrowserCaptureOptions;
  startedAt: number;
  stoppedAt?: number;
  events: EventBuffer;
  responseBodyMaxBytes?: number;
  responseBodies: Map<string, RemoteBrowserRetainedResponseBody>;
  responseBodyBytes: number;
}

// Event history for a tab is owned independently of any single WebContents so
// that rebuilding the renderer (e.g. the internal/external navigation
// transition) does not discard previously captured events. The observed
// TabState swaps its `wc`/listeners while continuing to reference the shared
// history object.
interface TabHistory {
  tabId: string;
  nextSeq: number;
  events: EventBuffer;
  lastNetworkActivity: number | null;
  lastRuntimeError: RemoteBrowserDebugEvent | null;
  lastSeen: number;
}

interface TabState {
  tabId: string;
  wc: WebContents;
  history: TabHistory;
  documentId: string;
  cleanup: Array<() => void>;
  pendingNetwork: Map<string, RemoteBrowserNetworkRequest>;
  networkResponses: Map<string, { url?: string; status?: number; mimeType?: string }>;
  capturingBodies: Set<string>;
  debuggerAttached: boolean;
  debuggerOwned: boolean;
  debuggerConfigured: boolean;
  attachPromise?: Promise<boolean>;
  commandUsers: number;
  detachTimer?: ReturnType<typeof setTimeout>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function describeError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function jsonSafe(value: unknown): JsonValue {
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number): JsonValue => {
    if (current === null) return null;
    if (typeof current === "string") {
      return current.length <= MAX_STRING_LENGTH
        ? current
        : `${current.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
    }
    if (typeof current === "number") return Number.isFinite(current) ? current : String(current);
    if (typeof current === "boolean") return current;
    if (typeof current === "bigint") return current.toString();
    if (typeof current === "undefined") return null;
    if (typeof current === "symbol" || typeof current === "function") return String(current);
    if (depth >= MAX_JSON_DEPTH) return "[max-depth]";

    if (current instanceof Error) return visit(describeError(current), depth + 1);
    if (current instanceof Date) return current.toISOString();
    if (Buffer.isBuffer(current)) {
      return `[Buffer ${current.byteLength} bytes]`;
    }

    if (typeof current === "object") {
      if (seen.has(current)) return "[circular]";
      seen.add(current);

      if (Array.isArray(current)) {
        const result = current.slice(0, MAX_ARRAY_ITEMS).map((item) => visit(item, depth + 1));
        if (current.length > MAX_ARRAY_ITEMS) result.push(`[${current.length - MAX_ARRAY_ITEMS} more]`);
        return result;
      }

      const result: Record<string, JsonValue> = {};
      const entries = Object.entries(current as Record<string, unknown>);
      for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
        result[key] = visit(item, depth + 1);
      }
      if (entries.length > MAX_OBJECT_KEYS) {
        result.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
      }
      return result;
    }

    return String(current);
  };

  const result = visit(value, 0);
  let encoded: string;
  try {
    encoded = JSON.stringify(result);
  } catch {
    return { error: "Payload could not be serialized" };
  }
  if (encoded.length <= MAX_PAYLOAD_LENGTH) return result;
  return {
    truncated: true,
    originalLength: encoded.length,
    preview: encoded.slice(0, MAX_PAYLOAD_LENGTH),
  };
}

function normalizeCapture(input?: RemoteBrowserCaptureInput): RemoteBrowserCaptureOptions {
  if (input === false) {
    return {
      console: false,
      navigation: false,
      runtime: false,
      network: false,
      page: false,
      log: false,
      crashes: false,
    };
  }
  if (input === true || input === undefined) return { ...DEFAULT_CAPTURE };
  if (Array.isArray(input)) return { ...DEFAULT_CAPTURE, types: input.slice() };
  const options = input as Partial<RemoteBrowserCaptureOptions>;
  return {
    ...DEFAULT_CAPTURE,
    ...options,
    types: options.types?.slice(),
  };
}

function matchesType(type: string, filters?: readonly string[]): boolean {
  if (!filters || filters.length === 0) return true;
  return filters.some((filter) =>
    filter.endsWith("*") ? type.startsWith(filter.slice(0, -1)) : type === filter,
  );
}

function captureAllows(capture: RemoteBrowserCaptureOptions, event: RemoteBrowserDebugEvent): boolean {
  if (!matchesType(event.type, capture.types)) return false;
  if (event.type === "console-message" || event.type === "Runtime.consoleAPICalled") {
    return capture.console;
  }
  if (event.type.startsWith("Runtime.")) return capture.runtime;
  if (event.type.startsWith("Network.")) return capture.network;
  if (event.type.startsWith("Page.")) return capture.page;
  if (event.type.startsWith("Log.")) return capture.log;
  if (
    event.type === "did-start-navigation" ||
    event.type === "did-navigate" ||
    event.type === "did-navigate-in-page" ||
    event.type === "did-fail-load"
  ) {
    return capture.navigation;
  }
  if (event.type === "render-process-gone" || event.type === "destroyed") {
    return capture.crashes;
  }
  // Session/debugger health events are always retained so a degraded capture is diagnosable.
  return true;
}

function publicSession(session: MutableSession, attached: boolean): RemoteBrowserDebugSession {
  return {
    sessionId: session.sessionId,
    tabId: session.tabId,
    status: session.status,
    capture: { ...session.capture, types: session.capture.types?.slice() },
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    eventCount: session.events.size,
    droppedEventCount: session.events.droppedCount,
    debuggerAttached: attached,
  };
}

function truncateUtf8(text: string, maxBytes: number): {
  text: string;
  bytes: number;
  originalBytes: number;
  truncated: boolean;
} {
  const originalBytes = Buffer.byteLength(text, "utf8");
  if (originalBytes <= maxBytes) {
    return { text, bytes: originalBytes, originalBytes, truncated: false };
  }
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, middle), "utf8") <= maxBytes) low = middle;
    else high = middle - 1;
  }
  if (low > 0 && /[\uD800-\uDBFF]/.test(text[low - 1])) low -= 1;
  const selected = text.slice(0, low);
  return {
    text: selected,
    bytes: Buffer.byteLength(selected, "utf8"),
    originalBytes,
    truncated: true,
  };
}

function emitterOf(value: unknown): NodeJS.EventEmitter {
  return value as NodeJS.EventEmitter;
}

export class RemoteBrowserDebugger {
  private readonly tabs = new Map<string, TabState>();
  private readonly histories = new Map<string, TabHistory>();
  private readonly sessions = new Map<string, MutableSession>();

  observeTab(tabId: string, wc: WebContents): void {
    if (!tabId) throw new ApiFault("VALIDATION_ERROR", "tabId is required");

    const existing = this.tabs.get(tabId);
    if (existing?.wc === wc) return;
    // A rebuilt WebContents (internal/external transition) replaces the
    // observed state but must preserve the tab's captured event history.
    if (existing) this.removeObservedState(existing, true);

    let history = this.histories.get(tabId);
    if (!history) {
      history = {
        tabId,
        nextSeq: 1,
        events: new EventBuffer(TAB_EVENT_LIMIT),
        lastNetworkActivity: null,
        lastRuntimeError: null,
        lastSeen: Date.now(),
      };
      this.histories.set(tabId, history);
      this.pruneHistories();
    } else {
      history.lastSeen = Date.now();
    }

    const state: TabState = {
      tabId,
      wc,
      history,
      documentId: `doc_${randomUUID()}`,
      cleanup: [],
      pendingNetwork: new Map(),
      networkResponses: new Map(),
      capturingBodies: new Set(),
      debuggerAttached: false,
      debuggerOwned: false,
      debuggerConfigured: false,
      commandUsers: 0,
    };
    this.tabs.set(tabId, state);

    const on = (target: unknown, eventName: string, listener: (...args: unknown[]) => void): void => {
      const emitter = emitterOf(target);
      emitter.on(eventName, listener);
      state.cleanup.push(() => emitter.removeListener(eventName, listener));
    };

    on(wc, "console-message", (...args) => {
      const details = asRecord(args[0]);
      this.record(state, "webContents", "console-message", details ?? {
        level: args[1],
        message: args[2],
        lineNumber: args[3],
        sourceId: args[4],
      });
    });

    on(wc, "did-start-navigation", (...args) => {
      const details = asRecord(args[0]);
      const isSameDocument = details
        ? asBoolean(details.isSameDocument)
        : asBoolean(args[2]);
      const isMainFrame = details ? asBoolean(details.isMainFrame) : asBoolean(args[3]);
      if (isMainFrame !== false && !isSameDocument) {
        state.documentId = `doc_${randomUUID()}`;
        state.pendingNetwork.clear();
        state.networkResponses.clear();
        state.capturingBodies.clear();
      }
      this.record(state, "webContents", "did-start-navigation", details ?? {
        url: args[1],
        isInPlace: args[2],
        isMainFrame: args[3],
        frameProcessId: args[4],
        frameRoutingId: args[5],
      });
    });

    on(wc, "did-navigate", (...args) => {
      this.record(state, "webContents", "did-navigate", asRecord(args[1]) ?? {
        url: args[1],
        httpResponseCode: args[2],
        httpStatusText: args[3],
      });
    });

    on(wc, "did-navigate-in-page", (...args) => {
      this.record(state, "webContents", "did-navigate-in-page", asRecord(args[1]) ?? {
        url: args[1],
        isMainFrame: args[2],
        frameProcessId: args[3],
        frameRoutingId: args[4],
      });
    });

    on(wc, "did-fail-load", (...args) => {
      this.record(state, "webContents", "did-fail-load", asRecord(args[1]) ?? {
        errorCode: args[1],
        errorDescription: args[2],
        validatedURL: args[3],
        isMainFrame: args[4],
        frameProcessId: args[5],
        frameRoutingId: args[6],
      });
    });

    on(wc, "render-process-gone", (...args) => {
      state.pendingNetwork.clear();
      state.networkResponses.clear();
      state.capturingBodies.clear();
      this.record(state, "webContents", "render-process-gone", args[1] ?? {});
    });

    on(wc, "devtools-opened", () => {
      if (this.activeSessionsForTab(tabId).length > 0) {
        this.record(state, "system", "debugger.devtools-conflict", {
          message: "DevTools was opened while a remote debug session was active",
        });
      }
    });

    on(wc, "destroyed", () => {
      state.pendingNetwork.clear();
      state.networkResponses.clear();
      state.capturingBodies.clear();
      this.record(state, "webContents", "destroyed", {});
      this.closeSessionsForTab(tabId, "target-destroyed");
      this.removeObservedState(state, false);
    });

    on(wc.debugger, "message", (...args) => {
      const method = asString(args[1]);
      if (!method) return;
      this.handleDebuggerMessage(state, method, args[2], asString(args[3]));
    });

    on(wc.debugger, "detach", (...args) => {
      state.debuggerAttached = false;
      state.debuggerOwned = false;
      state.debuggerConfigured = false;
      state.pendingNetwork.clear();
      state.capturingBodies.clear();
      this.record(state, "system", "debugger.detached", {
        reason: args[1] ?? "unknown",
      });
    });

    if (this.activeSessionsForTab(tabId).length > 0) {
      void this.ensureDebuggerAttached(state);
    }
  }

  unobserveTab(tabId: string): void {
    const state = this.tabs.get(tabId);
    if (!state) return;
    this.closeSessionsForTab(tabId, "tab-unobserved");
    this.removeObservedState(state, true);
    this.histories.delete(tabId);
  }

  async startSession(
    tabId: string,
    capture?: RemoteBrowserCaptureInput,
  ): Promise<RemoteBrowserDebugSession> {
    const activeCount = Array.from(this.sessions.values()).filter(
      (session) => session.status === "active",
    ).length;
    if (activeCount >= MAX_ACTIVE_SESSIONS) {
      throw new ApiFault("RATE_LIMITED", `At most ${MAX_ACTIVE_SESSIONS} debug sessions may be active`);
    }
    const state = this.requireTab(tabId);
    const session: MutableSession = {
      sessionId: `session_${randomUUID()}`,
      tabId,
      status: "active",
      capture: normalizeCapture(capture),
      startedAt: Date.now(),
      events: new EventBuffer(SESSION_EVENT_LIMIT),
      responseBodies: new Map(),
      responseBodyBytes: 0,
    };
    this.sessions.set(session.sessionId, session);
    this.record(state, "system", "session.started", { sessionId: session.sessionId });
    await this.ensureDebuggerAttached(state);
    return publicSession(session, state.debuggerAttached);
  }

  listSessions(): RemoteBrowserDebugSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((session) => publicSession(session, this.isDebuggerAttached(session.tabId)));
  }

  getSession(sessionId: string): RemoteBrowserDebugSession | undefined {
    const session = this.sessions.get(sessionId);
    return session
      ? publicSession(session, this.isDebuggerAttached(session.tabId))
      : undefined;
  }

  getSessionEvents(
    sessionId: string,
    after?: number | string,
    limit = DEFAULT_EVENT_PAGE_SIZE,
    types?: readonly string[],
  ): RemoteBrowserDebugEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) throw new ApiFault("NOT_FOUND", `Debug session '${sessionId}' was not found`);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ApiFault("VALIDATION_ERROR", "limit must be a positive integer");
    }
    const safeLimit = Math.min(limit, MAX_EVENT_PAGE_SIZE);
    let afterSeq: number | undefined;
    if (typeof after === "number") {
      if (!Number.isFinite(after) || after < 0) {
        throw new ApiFault("VALIDATION_ERROR", "after must be a non-negative seq or eventId");
      }
      afterSeq = after;
      const oldest = session.events.oldestSeq;
      if (after > 0 && oldest !== null && after < oldest - 1) {
        throw new ApiFault("CURSOR_EXPIRED", "The requested event cursor was evicted", {
          after,
          oldestSeq: oldest,
          newestSeq: session.events.newestSeq,
        }, 410);
      }
    } else if (typeof after === "string" && after.length > 0) {
      const cursor = session.events.find(after);
      if (!cursor) {
        throw new ApiFault("CURSOR_EXPIRED", `Event cursor '${after}' is not in this session`, {
          eventId: after,
          oldestSeq: session.events.oldestSeq,
          newestSeq: session.events.newestSeq,
        }, 410);
      }
      afterSeq = cursor.seq;
    }

    return session.events
      .toArray()
      .filter((event) => afterSeq === undefined || event.seq > afterSeq)
      .filter((event) => matchesType(event.type, types))
      .slice(0, safeLimit);
  }

  getSessionEventBounds(sessionId: string): RemoteBrowserEventBounds {
    const session = this.sessions.get(sessionId);
    if (!session) throw new ApiFault("NOT_FOUND", `Debug session '${sessionId}' was not found`);
    return {
      oldestSeq: session.events.oldestSeq,
      newestSeq: session.events.newestSeq,
      size: session.events.size,
      droppedCount: session.events.droppedCount,
    };
  }

  getRecentSessionEvents(
    sessionId: string,
    limit = DEFAULT_EVENT_PAGE_SIZE,
    types?: readonly string[],
  ): RemoteBrowserDebugEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) throw new ApiFault("NOT_FOUND", `Debug session '${sessionId}' was not found`);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_EVENT_PAGE_SIZE) {
      throw new ApiFault("VALIDATION_ERROR", `limit must be between 1 and ${MAX_EVENT_PAGE_SIZE}`);
    }
    return session.events
      .toArray()
      .filter((event) => matchesType(event.type, types))
      .slice(-limit);
  }

  resolveSessionCursor(sessionId: string, cursor: number | string): number {
    const session = this.sessions.get(sessionId);
    if (!session) throw new ApiFault("NOT_FOUND", `Debug session '${sessionId}' was not found`);
    if (typeof cursor === "number") {
      if (!Number.isSafeInteger(cursor) || cursor < 0) {
        throw new ApiFault("VALIDATION_ERROR", "cursor must be a non-negative safe integer");
      }
      return cursor;
    }
    const event = session.events.find(cursor);
    if (!event) {
      throw new ApiFault("CURSOR_EXPIRED", `Event cursor '${cursor}' is not in this session`, {
        eventId: cursor,
        oldestSeq: session.events.oldestSeq,
        newestSeq: session.events.newestSeq,
      }, 410);
    }
    return event.seq;
  }

  configureResponseBodyCapture(sessionId: string, maxBytes: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new ApiFault("NOT_FOUND", `Debug session '${sessionId}' was not found`);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10 * 1024 * 1024) {
      throw new ApiFault("VALIDATION_ERROR", "maxBytes must be between 1 and 10485760");
    }
    session.responseBodyMaxBytes = maxBytes;
  }

  getRetainedResponseBody(
    sessionId: string,
    requestId: string,
  ): RemoteBrowserRetainedResponseBody | undefined {
    return this.sessions.get(sessionId)?.responseBodies.get(requestId);
  }

  async stopSession(sessionId: string): Promise<RemoteBrowserDebugSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (session.status === "stopped") {
      return publicSession(session, this.isDebuggerAttached(session.tabId));
    }

    const state = this.tabs.get(session.tabId);
    if (state) this.record(state, "system", "session.stopped", { sessionId });
    session.status = "stopped";
    session.stoppedAt = Date.now();

    if (state && this.activeSessionsForTab(session.tabId).length === 0) {
      if (state.attachPromise) await state.attachPromise.catch(() => false);
      if (state.commandUsers === 0) this.detachDebugger(state, "last-session-stopped");
    }
    this.pruneStoppedSessions();
    return publicSession(session, this.isDebuggerAttached(session.tabId));
  }

  getActivity(tabId: string): RemoteBrowserTabActivity | undefined {
    const state = this.tabs.get(tabId);
    if (!state) return undefined;
    return {
      tabId,
      documentId: state.documentId,
      pendingNetwork: state.pendingNetwork.size,
      pendingRequests: Array.from(state.pendingNetwork.values()),
      lastNetworkActivity: state.history.lastNetworkActivity,
      lastRuntimeError: state.history.lastRuntimeError,
      debuggerAttached: this.debuggerIsAttached(state),
      activeSessions: this.activeSessionsForTab(tabId).length,
    };
  }

  getTabEvents(
    tabId: string,
    after = 0,
    limit = DEFAULT_EVENT_PAGE_SIZE,
    types?: readonly string[],
  ): RemoteBrowserDebugEvent[] {
    const state = this.requireTab(tabId);
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new ApiFault("VALIDATION_ERROR", "after must be a non-negative sequence");
    }
    const safeLimit = Math.min(Math.max(1, limit), MAX_EVENT_PAGE_SIZE);
    return state.history.events
      .toArray()
      .filter((event) => event.seq > after)
      .filter((event) => matchesType(event.type, types))
      .slice(0, safeLimit);
  }

  getLatestSequence(tabId: string): number {
    const state = this.requireTab(tabId);
    return state.history.events.toArray().at(-1)?.seq ?? 0;
  }

  async sendCommand<T = unknown>(
    tabId: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    if (!method) throw new ApiFault("VALIDATION_ERROR", "Debugger command method is required");
    const state = this.requireTab(tabId);
    if (state.detachTimer) {
      clearTimeout(state.detachTimer);
      state.detachTimer = undefined;
    }
    state.commandUsers += 1;
    try {
      const attached = await this.ensureDebuggerAttached(state);
      if (!attached || !this.debuggerIsAttached(state)) {
        throw new ApiFault("SERVICE_UNAVAILABLE", `Debugger is unavailable for tab '${tabId}'`);
      }
      try {
        return (await state.wc.debugger.sendCommand(method, params)) as T;
      } catch (error) {
        this.record(state, "system", "debugger.command-failed", {
          method,
          error: describeError(error),
        });
        throw new ApiFault("BAD_GATEWAY", `Debugger command '${method}' failed`, {
          method,
          error: describeError(error),
        });
      }
    } finally {
      state.commandUsers = Math.max(0, state.commandUsers - 1);
      if (state.commandUsers === 0 && this.activeSessionsForTab(tabId).length === 0) {
        state.detachTimer = setTimeout(() => {
          state.detachTimer = undefined;
          if (state.commandUsers === 0 && this.activeSessionsForTab(tabId).length === 0) {
            this.detachDebugger(state, "command-idle");
          }
        }, 250);
      }
    }
  }

  findEvent(eventId: string): RemoteBrowserDebugEvent | undefined {
    for (const state of this.tabs.values()) {
      const event = state.history.events.find(eventId);
      if (event) return event;
    }
    for (const session of this.sessions.values()) {
      const event = session.events.find(eventId);
      if (event) return event;
    }
    return undefined;
  }

  private requireTab(tabId: string): TabState {
    const state = this.tabs.get(tabId);
    if (!state || state.wc.isDestroyed()) {
      throw new ApiFault("TAB_NOT_FOUND", `Tab '${tabId}' is not being observed`);
    }
    return state;
  }

  private record(
    state: TabState,
    source: RemoteBrowserDebugEventSource,
    type: string,
    payload: unknown,
  ): RemoteBrowserDebugEvent {
    const event: RemoteBrowserDebugEvent = Object.freeze({
      seq: state.history.nextSeq++,
      eventId: `event_${randomUUID()}`,
      tabId: state.tabId,
      documentId: state.documentId,
      timestamp: Date.now(),
      source,
      type,
      payload: jsonSafe(payload),
    });
    state.history.events.push(event);
    for (const session of this.activeSessionsForTab(state.tabId)) {
      if (captureAllows(session.capture, event)) session.events.push(event);
    }
    return event;
  }

  private handleDebuggerMessage(
    state: TabState,
    method: string,
    params: unknown,
    protocolSessionId?: string,
  ): void {
    const details = asRecord(params);
    if (method === "Network.requestWillBeSent") {
      const requestId = asString(details?.requestId);
      if (requestId) {
        const request = asRecord(details?.request);
        state.pendingNetwork.set(requestId, {
          requestId,
          url: asString(request?.url),
          method: asString(request?.method),
          startedAt: Date.now(),
        });
      }
      state.history.lastNetworkActivity = Date.now();
    } else if (method === "Network.responseReceived") {
      const requestId = asString(details?.requestId);
      const response = asRecord(details?.response);
      if (requestId) {
        state.networkResponses.set(requestId, {
          url: asString(response?.url),
          status: typeof response?.status === "number" ? response.status : undefined,
          mimeType: asString(response?.mimeType),
        });
        while (state.networkResponses.size > 2_000) {
          const oldest = state.networkResponses.keys().next().value as string | undefined;
          if (!oldest) break;
          state.networkResponses.delete(oldest);
        }
      }
      state.history.lastNetworkActivity = Date.now();
    } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
      const requestId = asString(details?.requestId);
      if (requestId) state.pendingNetwork.delete(requestId);
      if (requestId && method === "Network.loadingFinished") {
        void this.captureResponseBody(state, requestId);
      }
      state.history.lastNetworkActivity = Date.now();
    }

    const payload = protocolSessionId
      ? { protocolSessionId, params }
      : params;
    const event = this.record(state, "debugger", method, payload ?? {});
    if (method === "Runtime.exceptionThrown") state.history.lastRuntimeError = event;
  }

  private async captureResponseBody(state: TabState, requestId: string): Promise<void> {
    const sessions = this.activeSessionsForTab(state.tabId).filter(
      (session) => session.responseBodyMaxBytes !== undefined,
    );
    if (sessions.length === 0 || state.capturingBodies.has(requestId)) return;
    if (!this.debuggerIsAttached(state)) return;
    state.capturingBodies.add(requestId);
    state.commandUsers += 1;
    try {
      const response = (await state.wc.debugger.sendCommand("Network.getResponseBody", {
        requestId,
      })) as { body?: unknown; base64Encoded?: unknown };
      const rawBody = typeof response.body === "string" ? response.body : "";
      const base64Encoded = response.base64Encoded === true;
      const metadata = state.networkResponses.get(requestId) ?? {};
      for (const session of sessions) {
        const maxBytes = session.responseBodyMaxBytes ?? 1;
        let body: string;
        let bytes: number;
        let originalBytes: number;
        let truncated: boolean;
        if (base64Encoded) {
          const decoded = Buffer.from(rawBody, "base64");
          originalBytes = decoded.byteLength;
          const selected = decoded.subarray(0, maxBytes);
          body = selected.toString("base64");
          bytes = selected.byteLength;
          truncated = bytes < originalBytes;
        } else {
          const selected = truncateUtf8(rawBody, maxBytes);
          body = selected.text;
          bytes = selected.bytes;
          originalBytes = selected.originalBytes;
          truncated = selected.truncated;
        }
        const retained: RemoteBrowserRetainedResponseBody = {
          sessionId: session.sessionId,
          requestId,
          ...metadata,
          body,
          base64Encoded,
          bytes,
          originalBytes,
          truncated,
          capturedAt: Date.now(),
        };
        const previous = session.responseBodies.get(requestId);
        if (previous) session.responseBodyBytes -= previous.bytes;
        session.responseBodies.delete(requestId);
        session.responseBodies.set(requestId, retained);
        session.responseBodyBytes += retained.bytes;
        while (
          session.responseBodies.size > MAX_RETAINED_BODIES_PER_SESSION ||
          session.responseBodyBytes > MAX_RETAINED_BODY_BYTES_PER_SESSION
        ) {
          const oldestId = session.responseBodies.keys().next().value as string | undefined;
          if (!oldestId) break;
          const oldest = session.responseBodies.get(oldestId);
          if (oldest) session.responseBodyBytes -= oldest.bytes;
          session.responseBodies.delete(oldestId);
        }
        this.enforceGlobalResponseBodyLimit();
      }
    } catch (error) {
      this.record(state, "system", "network.body-capture-failed", {
        requestId,
        error: describeError(error),
      });
    } finally {
      state.capturingBodies.delete(requestId);
      state.commandUsers = Math.max(0, state.commandUsers - 1);
      if (state.commandUsers === 0 && this.activeSessionsForTab(state.tabId).length === 0) {
        this.detachDebugger(state, "response-body-capture-complete");
      }
    }
  }

  private enforceGlobalResponseBodyLimit(): void {
    const totalBytes = (): number =>
      Array.from(this.sessions.values()).reduce(
        (total, session) => total + session.responseBodyBytes,
        0,
      );
    while (totalBytes() > MAX_RETAINED_BODY_BYTES_GLOBAL) {
      let oldestSession: MutableSession | undefined;
      let oldestId: string | undefined;
      let oldestCapturedAt = Number.POSITIVE_INFINITY;
      for (const session of this.sessions.values()) {
        for (const [requestId, body] of session.responseBodies) {
          if (body.capturedAt < oldestCapturedAt) {
            oldestCapturedAt = body.capturedAt;
            oldestSession = session;
            oldestId = requestId;
          }
        }
      }
      if (!oldestSession || !oldestId) break;
      const body = oldestSession.responseBodies.get(oldestId);
      if (body) oldestSession.responseBodyBytes -= body.bytes;
      oldestSession.responseBodies.delete(oldestId);
    }
  }

  private async ensureDebuggerAttached(state: TabState): Promise<boolean> {
    if (state.wc.isDestroyed()) return false;
    if (state.attachPromise) return state.attachPromise;
    if (this.debuggerIsAttached(state) && state.debuggerConfigured) return true;

    const attachPromise = (async () => {
      try {
        let newlyAttached = false;
        if (!state.wc.debugger.isAttached()) {
          state.wc.debugger.attach("1.3");
          state.debuggerOwned = true;
          newlyAttached = true;
        }
        state.debuggerAttached = state.wc.debugger.isAttached();
        if (!state.debuggerAttached) throw new Error("Debugger attach returned without attaching");
        if (newlyAttached) {
          this.record(state, "system", "debugger.attached", { protocolVersion: "1.3" });
        }

        const enableCommands: Array<[string, Record<string, unknown>?]> = [
          ["Runtime.enable"],
          ["Network.enable"],
          ["Page.enable"],
          ["Page.setLifecycleEventsEnabled", { enabled: true }],
          ["Log.enable"],
        ];
        for (const [method, params] of enableCommands) {
          try {
            await state.wc.debugger.sendCommand(method, params);
          } catch (error) {
            this.record(state, "system", "debugger.domain-enable-failed", {
              method,
              error: describeError(error),
            });
          }
        }
        state.debuggerConfigured = true;
        return this.debuggerIsAttached(state);
      } catch (error) {
        state.debuggerAttached = false;
        state.debuggerOwned = false;
        state.debuggerConfigured = false;
        this.record(state, "system", "debugger.attach-failed", {
          message: "Unable to attach; DevTools or another debugger may already own the target",
          error: describeError(error),
        });
        return false;
      }
    })();
    state.attachPromise = attachPromise;
    void attachPromise.finally(() => {
      if (state.attachPromise === attachPromise) state.attachPromise = undefined;
    });
    return attachPromise;
  }

  private detachDebugger(state: TabState, reason: string): void {
    if (state.detachTimer) {
      clearTimeout(state.detachTimer);
      state.detachTimer = undefined;
    }
    if (!state.debuggerOwned || state.wc.isDestroyed()) return;
    try {
      if (state.wc.debugger.isAttached()) state.wc.debugger.detach();
      state.debuggerAttached = false;
      state.debuggerOwned = false;
      state.debuggerConfigured = false;
    } catch (error) {
      this.record(state, "system", "debugger.detach-failed", {
        reason,
        error: describeError(error),
      });
    }
  }

  private debuggerIsAttached(state: TabState): boolean {
    if (state.wc.isDestroyed()) return false;
    try {
      const attached = state.wc.debugger.isAttached();
      state.debuggerAttached = attached;
      return attached;
    } catch {
      state.debuggerAttached = false;
      return false;
    }
  }

  private isDebuggerAttached(tabId: string): boolean {
    const state = this.tabs.get(tabId);
    return state ? this.debuggerIsAttached(state) : false;
  }

  private activeSessionsForTab(tabId: string): MutableSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.tabId === tabId && session.status === "active",
    );
  }

  private closeSessionsForTab(tabId: string, reason: string): void {
    const now = Date.now();
    const state = this.tabs.get(tabId);
    if (state) this.record(state, "system", "session.target-closed", { reason });
    for (const session of this.activeSessionsForTab(tabId)) {
      session.status = "stopped";
      session.stoppedAt = now;
    }
    this.pruneStoppedSessions();
  }

  private removeObservedState(state: TabState, detach: boolean): void {
    if (this.tabs.get(state.tabId) !== state) return;
    if (state.detachTimer) clearTimeout(state.detachTimer);
    if (detach) this.detachDebugger(state, "tab-unobserved");
    for (const cleanup of state.cleanup.splice(0)) {
      try {
        cleanup();
      } catch {
        // EventEmitter cleanup must never affect application shutdown.
      }
    }
    this.tabs.delete(state.tabId);
  }

  private pruneStoppedSessions(): void {
    const stopped = Array.from(this.sessions.values())
      .filter((session) => session.status === "stopped")
      .sort((a, b) => (b.stoppedAt ?? 0) - (a.stoppedAt ?? 0));
    for (const session of stopped.slice(RETAINED_STOPPED_SESSIONS)) {
      this.sessions.delete(session.sessionId);
    }
  }

  private pruneHistories(): void {
    const MAX_HISTORIES = 256;
    if (this.histories.size <= MAX_HISTORIES) return;
    const observed = new Set(this.tabs.keys());
    const sessionTabs = new Set(
      Array.from(this.sessions.values()).map((session) => session.tabId),
    );
    const evictable = Array.from(this.histories.entries())
      .filter(([tabId]) => !observed.has(tabId) && !sessionTabs.has(tabId))
      .sort((a, b) => (a[1].lastSeen ?? 0) - (b[1].lastSeen ?? 0));
    for (const [tabId] of evictable) {
      if (this.histories.size <= MAX_HISTORIES) break;
      this.histories.delete(tabId);
    }
  }
}

export const remoteBrowserDebugger = new RemoteBrowserDebugger();

export function sendCommand<T = unknown>(
  tabId: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return remoteBrowserDebugger.sendCommand<T>(tabId, method, params);
}

export function findEvent(eventId: string): RemoteBrowserDebugEvent | undefined {
  return remoteBrowserDebugger.findEvent(eventId);
}

