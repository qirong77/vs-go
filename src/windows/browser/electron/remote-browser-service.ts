import type { WebContents } from "electron";
import {
  ApiFault,
  asApiFault,
  assertSafeNavigationUrl,
  parseTargetSelector,
  readBooleanParameter,
  readIntegerParameter,
  readStringParameter,
  requireObject,
  type TargetSelector,
} from "./remote-browser-core";
import { remoteBrowserConfig } from "./remote-browser-config";
import {
  remoteBrowserDebugger,
  type RemoteBrowserCaptureInput,
  type RemoteBrowserDebugEvent,
  type RemoteBrowserDebugSession,
} from "./remote-browser-debugger";
import {
  buildElementActionScript,
  buildSnapshotScript,
  parseNodeRef,
  type ElementAction,
  type PageLocator,
} from "./remote-browser-page-tools";
import { remoteBrowserSourceMaps } from "./remote-browser-source-map";
import {
  waitForConditions,
  type WaitCondition,
  type WaitEvent,
  type WaitMode,
} from "./remote-browser-wait";
import {
  TabbedBrowserWindowManager,
  type RemoteTarget,
} from "./TabbedBrowserWindowManager";

export interface RemoteBrowserServiceResult {
  data: unknown;
  meta?: Record<string, unknown>;
}

interface ResolvedTarget extends RemoteTarget {
  wc: WebContents;
  implicit: boolean;
}

interface SessionExtras {
  categories: string[];
  captureResponseBodies: boolean;
  maxBodyBytes: number;
}

interface CdpRemoteObject {
  type?: string;
  subtype?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  preview?: unknown;
}

interface CdpEvaluateResponse {
  result?: CdpRemoteObject;
  exceptionDetails?: unknown;
}

interface ElementDescription {
  ok?: boolean;
  reason?: string;
  tag?: string;
  text?: string;
  value?: unknown;
  rect?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    centerX?: number;
    centerY?: number;
  };
  [key: string]: unknown;
}

const OPERATIONS = [
  "capabilities",
  "windows",
  "state",
  "open",
  "navigate",
  "switchTab",
  "closeTab",
  "back",
  "forward",
  "reload",
  "evaluate",
  "query",
  "read",
  "click",
  "hover",
  "scroll",
  "drag",
  "key",
  "type",
  "wait",
  "screenshot",
  "windowShow",
  "windowHide",
  "windowFocus",
  "devtools",
  "sessionStart",
  "sessionList",
  "sessionGet",
  "sessionEvents",
  "sessionStop",
  "diagnostics",
  "snapshot",
  "nodeAction",
  "sourceResolve",
  "networkBody",
  "batch",
] as const;

type Operation = (typeof OPERATIONS)[number];

const OPERATION_SET = new Set<string>(OPERATIONS);
const MAX_BATCH_OPERATIONS = 50;
const MAX_SNAPSHOT_NODES = 10_000;
const MAX_NETWORK_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_NETWORK_BODY_BYTES = 1024 * 1024;

const PATH_TO_OPERATION: Readonly<Record<string, Operation>> = {
  "/browser/capabilities": "capabilities",
  "/browser/windows": "windows",
  "/browser/state": "state",
  "/browser/open": "open",
  "/browser/navigate": "navigate",
  "/browser/switch-tab": "switchTab",
  "/browser/close-tab": "closeTab",
  "/browser/back": "back",
  "/browser/forward": "forward",
  "/browser/reload": "reload",
  "/browser/evaluate": "evaluate",
  "/browser/query": "query",
  "/browser/read": "read",
  "/browser/click": "click",
  "/browser/hover": "hover",
  "/browser/scroll": "scroll",
  "/browser/drag": "drag",
  "/browser/key": "key",
  "/browser/type": "type",
  "/browser/wait": "wait",
  "/browser/screenshot": "screenshot",
  "/browser/window/show": "windowShow",
  "/browser/window/hide": "windowHide",
  "/browser/window/focus": "windowFocus",
  "/browser/devtools": "devtools",
  "/browser/session/start": "sessionStart",
  "/browser/session/list": "sessionList",
  "/browser/session/get": "sessionGet",
  "/browser/session/events": "sessionEvents",
  "/browser/session/stop": "sessionStop",
  "/browser/diagnostics": "diagnostics",
  "/browser/snapshot": "snapshot",
  "/browser/node/action": "nodeAction",
  "/browser/source/resolve": "sourceResolve",
  "/browser/network/body": "networkBody",
  "/browser/batch": "batch",
};

const OPERATION_METHOD: Readonly<Record<Operation, "GET" | "POST">> = {
  capabilities: "GET",
  windows: "GET",
  state: "GET",
  open: "POST",
  navigate: "POST",
  switchTab: "POST",
  closeTab: "POST",
  back: "POST",
  forward: "POST",
  reload: "POST",
  evaluate: "POST",
  query: "POST",
  read: "POST",
  click: "POST",
  hover: "POST",
  scroll: "POST",
  drag: "POST",
  key: "POST",
  type: "POST",
  wait: "POST",
  screenshot: "POST",
  windowShow: "POST",
  windowHide: "POST",
  windowFocus: "POST",
  devtools: "POST",
  sessionStart: "POST",
  sessionList: "GET",
  sessionGet: "GET",
  sessionEvents: "GET",
  sessionStop: "POST",
  diagnostics: "POST",
  snapshot: "POST",
  nodeAction: "POST",
  sourceResolve: "POST",
  networkBody: "GET",
  batch: "POST",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, parameter: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new ApiFault("VALIDATION_ERROR", `'${parameter}' must be a string or an array of strings`, {
      parameter,
      actual: value,
    });
  }
  return Array.from(new Set(value as string[]));
}

function enumValue<T extends string>(
  source: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = readStringParameter(source, key) ?? fallback;
  if (!values.includes(value as T)) {
    throw new ApiFault("VALIDATION_ERROR", `'${key}' must be one of: ${values.join(", ")}`, {
      parameter: key,
      actual: value,
      allowed: values,
    });
  }
  return value as T;
}

function finiteNumber(
  source: Record<string, unknown>,
  key: string,
  fallback?: number,
): number {
  const value = source[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiFault("VALIDATION_ERROR", `'${key}' must be a finite number`, {
      parameter: key,
      actual: value,
    });
  }
  return value;
}

function abortFault(signal?: AbortSignal): ApiFault {
  const reason = signal?.reason;
  return new ApiFault("TIMEOUT", "Remote browser operation was aborted", {
    reason: reason instanceof Error ? reason.message : reason,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortFault(signal);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortFault(signal));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortFault(signal));
      },
      { once: true },
    );
  });
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
  label = "Operation",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortFault(signal));
      return;
    }
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(abortFault(signal)));
    const timer = setTimeout(
      () => finish(() => reject(new ApiFault("TIMEOUT", `${label} exceeded ${timeoutMs}ms`))),
      timeoutMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function waitForMainFrameLoad(wc: WebContents, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortFault(signal));
      return;
    }
    if (!wc.isLoading() && wc.getURL()) {
      resolve();
      return;
    }
    const cleanup = (): void => {
      wc.removeListener("did-finish-load", onLoaded);
      wc.removeListener("did-fail-load", onFailed);
      wc.removeListener("destroyed", onDestroyed);
      signal?.removeEventListener("abort", onAbort);
    };
    const onLoaded = (): void => {
      cleanup();
      resolve();
    };
    const onFailed = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean,
    ): void => {
      if (!isMainFrame) return;
      cleanup();
      reject(new ApiFault("BAD_GATEWAY", "Page failed to load", {
        errorCode,
        errorDescription,
        url: validatedURL,
      }));
    };
    const onDestroyed = (): void => {
      cleanup();
      reject(new ApiFault("TARGET_CLOSED", "Tab closed while loading"));
    };
    const onAbort = (): void => {
      cleanup();
      reject(abortFault(signal));
    };
    wc.once("did-finish-load", onLoaded);
    wc.on("did-fail-load", onFailed);
    wc.once("destroyed", onDestroyed);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (!wc.isLoading() && wc.getURL()) onLoaded();
  });
}

function waitForDomReady(wc: WebContents, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortFault(signal));
      return;
    }
    const cleanup = (): void => {
      wc.removeListener("dom-ready", onReady);
      wc.removeListener("did-fail-load", onFailed);
      wc.removeListener("destroyed", onDestroyed);
      signal?.removeEventListener("abort", onAbort);
    };
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const onFailed = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean,
    ): void => {
      if (!isMainFrame) return;
      cleanup();
      reject(new ApiFault("BAD_GATEWAY", "Page failed before DOM ready", {
        errorCode,
        errorDescription,
        url: validatedURL,
      }));
    };
    const onDestroyed = (): void => {
      cleanup();
      reject(new ApiFault("TARGET_CLOSED", "Tab closed while navigating"));
    };
    const onAbort = (): void => {
      cleanup();
      reject(abortFault(signal));
    };
    wc.once("dom-ready", onReady);
    wc.on("did-fail-load", onFailed);
    wc.once("destroyed", onDestroyed);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function eventPayload(event: RemoteBrowserDebugEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function eventRequestId(event: RemoteBrowserDebugEvent): string | undefined {
  const payload = eventPayload(event);
  return typeof payload.requestId === "string" ? payload.requestId : undefined;
}

function eventHttpStatus(event: RemoteBrowserDebugEvent): number | undefined {
  if (event.type !== "Network.responseReceived") return undefined;
  const payload = eventPayload(event);
  const response = isRecord(payload.response) ? payload.response : {};
  return typeof response.status === "number" ? response.status : undefined;
}

function eventTypeForWait(type: string): string {
  if (type === "console-message") return "console.message";
  if (type === "Runtime.consoleAPICalled") return "runtime.console";
  if (type === "Runtime.exceptionThrown") return "runtime.exception";
  if (type === "Network.requestWillBeSent") return "network.request";
  if (type === "Network.responseReceived") return "network.response";
  if (type === "Network.loadingFinished") return "network.finished";
  if (type === "Network.loadingFailed") return "network.failed";
  return type;
}

function matchesRequestedEventType(type: string, filters?: readonly string[]): boolean {
  if (!filters || filters.length === 0) return true;
  return filters.some((filter) =>
    filter.endsWith("*") ? type.startsWith(filter.slice(0, -1)) : type === filter
  );
}

function valueForUnserializable(raw: string | undefined): unknown {
  if (raw === "NaN") return Number.NaN;
  if (raw === "Infinity") return Number.POSITIVE_INFINITY;
  if (raw === "-Infinity") return Number.NEGATIVE_INFINITY;
  if (raw === "-0") return -0;
  if (raw?.endsWith("n") && /^-?\d+n$/.test(raw)) return raw;
  return raw;
}

function jsonSafePageValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "bigint") {
    return { type: "bigint", unserializableValue: `${value.toString()}n` };
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { type: "number", unserializableValue: "NaN" };
    if (value === Number.POSITIVE_INFINITY) return { type: "number", unserializableValue: "Infinity" };
    if (value === Number.NEGATIVE_INFINITY) return { type: "number", unserializableValue: "-Infinity" };
    if (Object.is(value, -0)) return { type: "number", unserializableValue: "-0" };
    return value;
  }
  if (typeof value === "undefined") return { type: "undefined" };
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (depth >= 12) return { truncated: true, reason: "max-depth" };
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return { truncated: true, reason: "circular-reference" };
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 10_000).map((item) => jsonSafePageValue(item, seen, depth + 1));
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 10_000)) {
    output[key] = jsonSafePageValue(item, seen, depth + 1);
  }
  return output;
}

function truncateUtf8Text(text: string, maxBytes: number): { text: string; bytes: number } {
  const originalBytes = Buffer.byteLength(text, "utf8");
  if (originalBytes <= maxBytes) return { text, bytes: originalBytes };
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, middle), "utf8") <= maxBytes) low = middle;
    else high = middle - 1;
  }
  if (low > 0 && /[\uD800-\uDBFF]/.test(text[low - 1])) low -= 1;
  const selected = text.slice(0, low);
  return { text: selected, bytes: Buffer.byteLength(selected, "utf8") };
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) {
    throw new ApiFault("VALIDATION_ERROR", "Batch result pointer must be empty or start with '/'");
  }
  let current = root;
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment)) {
        throw new ApiFault("DEPENDENCY_FAILED", `Batch pointer array index '${segment}' is invalid`);
      }
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      throw new ApiFault("DEPENDENCY_FAILED", `Batch result pointer '${pointer}' was not found`);
    }
  }
  return current;
}

function resolveBatchReferences(
  value: unknown,
  results: ReadonlyMap<string, RemoteBrowserServiceResult>,
  depth = 0,
): unknown {
  if (depth > 30) throw new ApiFault("VALIDATION_ERROR", "Batch input nesting is too deep");
  if (Array.isArray(value)) {
    return value.map((item) => resolveBatchReferences(item, results, depth + 1));
  }
  if (!isRecord(value)) return value;
  if (typeof value.$result === "string") {
    const dependency = results.get(value.$result);
    if (!dependency) {
      throw new ApiFault("DEPENDENCY_FAILED", `Batch result '${value.$result}' is unavailable`, {
        resultId: value.$result,
      });
    }
    const pointer = typeof value.pointer === "string" ? value.pointer : "";
    return resolveJsonPointer(dependency, pointer);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      resolveBatchReferences(item, results, depth + 1),
    ]),
  );
}

/**
 * Transport-independent browser automation implementation. HTTP concerns such as
 * authentication, envelopes and request ids remain in remote-browser-server.
 */
export class RemoteBrowserService {
  private readonly sessionExtras = new Map<string, SessionExtras>();

  private pruneSessionExtras(): void {
    const retained = new Set(
      remoteBrowserDebugger.listSessions().map((session) => session.sessionId),
    );
    for (const sessionId of this.sessionExtras.keys()) {
      if (!retained.has(sessionId)) this.sessionExtras.delete(sessionId);
    }
  }

  async execute(
    operation: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    throwIfAborted(signal);
    if (!OPERATION_SET.has(operation)) {
      throw new ApiFault("NOT_FOUND", `Unknown remote browser operation '${operation}'`, {
        operation,
        supported: OPERATIONS,
      });
    }
    try {
      return await this.dispatch(operation as Operation, requireObject(body), signal, false);
    } catch (error) {
      throw asApiFault(error);
    }
  }

  private async dispatch(
    operation: Operation,
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    inBatch: boolean,
  ): Promise<RemoteBrowserServiceResult> {
    switch (operation) {
      case "capabilities":
        return this.capabilities();
      case "windows":
        return this.windows();
      case "state":
        return this.state(body);
      case "open":
        return await this.open(body, signal);
      case "navigate":
        return await this.navigate(body, signal);
      case "switchTab":
        return this.switchTab(body);
      case "closeTab":
        return this.closeTab(body);
      case "back":
        return this.historyAction("back", body);
      case "forward":
        return this.historyAction("forward", body);
      case "reload":
        return this.reload(body);
      case "evaluate":
        return await this.evaluate(body, signal);
      case "query":
        return await this.query(body, signal);
      case "read":
        return await this.read(body, signal);
      case "click":
        return await this.click(body, signal);
      case "hover":
        return await this.hover(body, signal);
      case "scroll":
        return await this.scroll(body, signal);
      case "drag":
        return await this.drag(body, signal);
      case "key":
        return await this.key(body, signal);
      case "type":
        return await this.typeText(body, signal);
      case "wait":
        return await this.wait(body, signal);
      case "screenshot":
        return await this.screenshot(body, signal);
      case "windowShow":
        return this.windowVisibility(body, "show");
      case "windowHide":
        return this.windowVisibility(body, "hide");
      case "windowFocus":
        return this.windowVisibility(body, "focus");
      case "devtools":
        return await this.devtools(body);
      case "sessionStart":
        return await this.sessionStart(body);
      case "sessionList":
        return this.sessionList(body);
      case "sessionGet":
        return this.sessionGet(body);
      case "sessionEvents":
        return await this.sessionEvents(body, signal);
      case "sessionStop":
        return await this.sessionStop(body);
      case "diagnostics":
        return await this.diagnostics(body, signal);
      case "snapshot":
        return await this.snapshot(body, signal);
      case "nodeAction":
        return await this.nodeAction(body, signal);
      case "sourceResolve":
        return await this.sourceResolve(body, signal);
      case "networkBody":
        return await this.networkBody(body, signal);
      case "batch":
        if (inBatch) throw new ApiFault("VALIDATION_ERROR", "Nested batch operations are not allowed");
        return await this.batch(body, signal);
    }
  }

  private capabilities(): RemoteBrowserServiceResult {
    return {
      data: {
        apiVersion: "2.0.0",
        transport: "service",
        operations: OPERATIONS,
        target: {
          nested: true,
          topLevelCompatibility: true,
          selectors: ["tabId", "windowId", "url"],
          strictConflicts: true,
          navigateTopLevelUrlIsDestination: true,
        },
        navigationProtocols: ["http:", "https:", "about:blank"],
        captureDomains: ["console", "navigation", "runtime", "network", "page", "log", "crashes"],
        locatorTypes: ["selector", "nodeRef"],
        evaluateWorlds: ["main", "isolated"],
        waitConditions: [
          "readyState",
          "lifecycle",
          "selector",
          "text",
          "url",
          "expression",
          "networkIdle",
          "runtimeQuiet",
          "domStable",
          "elementStable",
          "event",
          "console",
          "runtimeException",
          "request",
          "response",
        ],
        limits: {
          maxBatchOperations: MAX_BATCH_OPERATIONS,
          maxSessionEventsPerRead: 1_000,
          maxNetworkBodyBytes: MAX_NETWORK_BODY_BYTES,
          maxSnapshotNodes: MAX_SNAPSHOT_NODES,
        },
      },
    };
  }

  private windows(): RemoteBrowserServiceResult {
    const data = TabbedBrowserWindowManager.getAllWindows().map((window) => {
      const state = window.getState();
      return {
        windowId: window.hostWindow.id,
        title: window.hostWindow.getTitle(),
        visible: window.isWindowVisible(),
        focused: window.hostWindow.isFocused(),
        activeTabId: state.activeTabId,
        tabs: window.getTabs().map((tab) => this.tabState(window, tab.id)),
      };
    });
    return { data };
  }

  private state(body: Record<string, unknown>): RemoteBrowserServiceResult {
    const target = this.resolveTarget(body, { allowInternal: true });
    return this.forTarget(this.tabState(target.window, target.tab.id), target);
  }

  private strictNavigationUrl(value: unknown): string {
    const normalized = assertSafeNavigationUrl(value, {
      allowUnsafe: remoteBrowserConfig.allowUnsafeUrls,
    });
    const parsed = new URL(normalized);
    const allowed =
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      (parsed.protocol === "about:" && parsed.href === "about:blank");
    if (!allowed) {
      throw new ApiFault(
        "VALIDATION_ERROR",
        `Navigation protocol '${parsed.protocol}' is not allowed by remote browser control`,
        {
          url: value,
          protocol: parsed.protocol,
          allowedProtocols: ["http:", "https:", "about:blank"],
          internalPagesAllowed: false,
        },
      );
    }
    return parsed.href;
  }

  private async open(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const url = this.strictNavigationUrl(body.url);
    const focus = readBooleanParameter(body, "focus", { defaultValue: false });
    const clientId = readStringParameter(body, "clientId");
    const timeout = readIntegerParameter(body, "timeout", {
      defaultValue: 30_000,
      minimum: 100,
      maximum: 120_000,
    });
    const target = await withDeadline(
      // 默认在后台打开（窗口保持隐藏），只有在 open 显式传 focus:true 时才显示到前台。
      // clientId 用于多实例隔离：不同客户端各自使用独立窗口，避免互相导航覆盖。
      TabbedBrowserWindowManager.openRemoteControlWindow(url, { show: false, clientId }),
      timeout,
      signal,
      "Opening browser tab",
    );
    const wc = target.window.getTabWebContents(target.tab.id);
    if (!wc) throw new ApiFault("TARGET_CLOSED", "The newly opened tab was closed before it became ready");
    remoteBrowserDebugger.observeTab(target.tab.id, wc);
    target.window.notifyRemoteActivity(target.tab.id);
    await withDeadline(waitForMainFrameLoad(wc, signal), timeout, signal, "Opening page");
    if (focus) target.window.focusTab(target.tab.id);
    const resolved: ResolvedTarget = { ...target, wc, implicit: false };
    return this.forTarget(
      {
        windowId: target.window.hostWindow.id,
        tabId: target.tab.id,
        url: wc.getURL() || url,
      },
      resolved,
    );
  }

  private async navigate(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    // Top-level url is intentionally removed from selector parsing. Only target.url
    // may select the current page for a navigation request.
    const target = this.resolveTarget(body, { destinationUrl: true });
    const url = this.strictNavigationUrl(body.url);
    const waitUntil = enumValue(body, "waitUntil", ["none", "domcontentloaded", "load"] as const, "load");
    const timeout = readIntegerParameter(body, "timeout", {
      defaultValue: 30_000,
      minimum: 100,
      maximum: 120_000,
    });
    const startedAt = Date.now();
    const domReady = waitUntil === "domcontentloaded"
      ? waitForDomReady(target.wc, signal)
      : null;
    const navigation = target.window.navigateTab(target.tab.id, url);
    if (waitUntil === "none") {
      void navigation.catch(() => {
        // did-fail-load is captured by the tab observer for asynchronous navigation failures.
      });
    } else if (domReady) {
      void navigation.catch(() => {
        // domReady propagates main-frame load failures.
      });
      await withDeadline(domReady, timeout, signal, "Navigation DOMContentLoaded");
    } else {
      await withDeadline(navigation, timeout, signal, "Navigation load");
    }
    const refreshed = this.refreshTarget(target);
    const descriptor = this.describeTarget(refreshed);
    return this.forTarget(
      {
        target: descriptor,
        url: waitUntil === "none" ? url : descriptor.url,
        waitUntil,
        waitedMs: Date.now() - startedAt,
      },
      refreshed,
    );
  }

  private switchTab(body: Record<string, unknown>): RemoteBrowserServiceResult {
    const target = this.resolveTarget(body, { requireExplicit: true });
    target.window.switchTab(target.tab.id);
    if (readBooleanParameter(body, "focus", { defaultValue: false })) {
      target.window.focusTab(target.tab.id);
    }
    return this.forTarget(
      { tabId: target.tab.id, windowId: target.window.hostWindow.id, active: true },
      target,
    );
  }

  private closeTab(body: Record<string, unknown>): RemoteBrowserServiceResult {
    const target = this.resolveTarget(body, { requireExplicit: true });
    const tabId = target.tab.id;
    const windowId = target.window.hostWindow.id;
    remoteBrowserDebugger.unobserveTab(tabId);
    target.window.closeTab(tabId);
    return {
      data: { tabId, windowId, closed: true },
      meta: { target: { tabId, windowId }, implicitTarget: false },
    };
  }

  private historyAction(
    action: "back" | "forward",
    body: Record<string, unknown>,
  ): RemoteBrowserServiceResult {
    const target = this.resolveTarget(body);
    const initiated =
      action === "back"
        ? target.window.goBackTab(target.tab.id)
        : target.window.goForwardTab(target.tab.id);
    return this.forTarget(
      { action, initiated, target: this.describeTarget(target) },
      target,
    );
  }

  private reload(body: Record<string, unknown>): RemoteBrowserServiceResult {
    const target = this.resolveTarget(body);
    const ignoreCache = readBooleanParameter(body, "ignoreCache", { defaultValue: false });
    if (ignoreCache) target.wc.reloadIgnoringCache();
    else target.window.reloadTab(target.tab.id);
    return this.forTarget(
      { action: "reload", ignoreCache, target: this.describeTarget(target) },
      target,
    );
  }

  private async evaluate(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const script = readStringParameter(body, "script", {
      allowEmpty: false,
      maxLength: 1_000_000,
    });
    const expression = readStringParameter(body, "expression", {
      allowEmpty: false,
      maxLength: 1_000_000,
    });
    if (script !== undefined && expression !== undefined && script !== expression) {
      throw new ApiFault("VALIDATION_ERROR", "Conflicting 'script' and 'expression' values", {
        script,
        expression,
      });
    }
    const source = expression ?? script;
    if (!source) {
      throw new ApiFault("VALIDATION_ERROR", "'expression' (or compatibility alias 'script') is required");
    }
    const awaitPromise = readBooleanParameter(body, "awaitPromise", { defaultValue: true });
    const userGesture = readBooleanParameter(body, "userGesture", { defaultValue: false });
    const timeout = readIntegerParameter(body, "timeout", {
      defaultValue: 30_000,
      minimum: 50,
      maximum: 120_000,
    });
    const world = enumValue(body, "world", ["main", "isolated"] as const, "main");
    const evaluated = await this.evaluateCdp(
      target,
      source,
      { awaitPromise, userGesture, timeout, world },
      signal,
      true,
    );
    if (evaluated.exceptionDetails !== null && evaluated.exceptionDetails !== undefined) {
      throw new ApiFault(
        "EVALUATE_ERROR",
        "JavaScript evaluation threw an exception",
        { exceptionDetails: evaluated.exceptionDetails },
        422,
      );
    }
    return this.forTarget({ ...evaluated, url: target.wc.getURL() }, target);
  }

  private async evaluateCdp(
    target: ResolvedTarget,
    expression: string,
    options: {
      awaitPromise?: boolean;
      userGesture?: boolean;
      timeout?: number;
      world?: "main" | "isolated";
    } = {},
    signal?: AbortSignal,
    allowMainWorldFallback = false,
  ): Promise<Record<string, unknown>> {
    const timeout = options.timeout ?? 30_000;
    const world = options.world ?? "main";
    const params: Record<string, unknown> = {
      expression,
      awaitPromise: options.awaitPromise ?? true,
      userGesture: options.userGesture ?? false,
      returnByValue: true,
      generatePreview: true,
      timeout,
    };

    try {
      if (world === "isolated") {
        const tree = await withDeadline(
          remoteBrowserDebugger.sendCommand<Record<string, unknown>>(
            target.tab.id,
            "Page.getFrameTree",
          ),
          timeout,
          signal,
          "Reading page frame tree",
        );
        const frameTree = isRecord(tree.frameTree) ? tree.frameTree : {};
        const frame = isRecord(frameTree.frame) ? frameTree.frame : {};
        const frameId = typeof frame.id === "string" ? frame.id : undefined;
        if (!frameId) {
          throw new ApiFault("SERVICE_UNAVAILABLE", "The main frame is unavailable for isolated evaluation");
        }
        const isolated = await withDeadline(
          remoteBrowserDebugger.sendCommand<Record<string, unknown>>(
            target.tab.id,
            "Page.createIsolatedWorld",
            {
              frameId,
              worldName: "vsgo.remote-browser",
              grantUniveralAccess: false,
            },
          ),
          timeout,
          signal,
          "Creating isolated evaluation world",
        );
        if (typeof isolated.executionContextId !== "number") {
          throw new ApiFault("SERVICE_UNAVAILABLE", "Chromium did not return an isolated execution context");
        }
        params.contextId = isolated.executionContextId;
      }

      const response = await withDeadline(
        remoteBrowserDebugger.sendCommand<CdpEvaluateResponse>(
          target.tab.id,
          "Runtime.evaluate",
          params,
        ),
        timeout,
        signal,
        "JavaScript evaluation",
      );
      const remote = response.result ?? {};
      return {
        type: remote.type ?? "undefined",
        subtype: remote.subtype ?? null,
        value: Object.prototype.hasOwnProperty.call(remote, "value")
          ? jsonSafePageValue(remote.value)
          : null,
        unserializableValue: remote.unserializableValue ?? null,
        description: remote.description ?? null,
        preview: remote.preview ?? null,
        exceptionDetails: response.exceptionDetails ?? null,
      };
    } catch (error) {
      if (!allowMainWorldFallback || world !== "main" || signal?.aborted) throw error;
      const fault = asApiFault(error);
      if (fault.code !== "SERVICE_UNAVAILABLE" && fault.code !== "BAD_GATEWAY") throw fault;
      try {
        const value = await withDeadline(
          target.window.evaluateOnTab(target.tab.id, expression, {
            userGesture: options.userGesture,
          }),
          timeout,
          signal,
          "JavaScript evaluation",
        );
        return {
          type: value === null ? "object" : typeof value,
          subtype: Array.isArray(value) ? "array" : value === null ? "null" : null,
          value: jsonSafePageValue(value),
          unserializableValue: null,
          preview: null,
          exceptionDetails: null,
          fallback: "webContents.executeJavaScript",
        };
      } catch (fallbackError) {
        return {
          type: "undefined",
          subtype: null,
          value: null,
          unserializableValue: null,
          preview: null,
          exceptionDetails: {
            text: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          },
          fallback: "webContents.executeJavaScript",
        };
      }
    }
  }

  private async evaluateValue(
    target: ResolvedTarget,
    expression: string,
    signal?: AbortSignal,
    timeout = 30_000,
  ): Promise<unknown> {
    const response = await this.evaluateCdp(
      target,
      expression,
      { awaitPromise: true, timeout, world: "main" },
      signal,
      true,
    );
    if (response.exceptionDetails !== null && response.exceptionDetails !== undefined) {
      throw new ApiFault("EVALUATE_ERROR", "Page JavaScript evaluation failed", {
        exceptionDetails: response.exceptionDetails,
      });
    }
    if (typeof response.unserializableValue === "string") {
      return valueForUnserializable(response.unserializableValue);
    }
    if (response.type === "undefined") return undefined;
    return response.value;
  }

  private async query(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const selector = readStringParameter(body, "selector", { required: true, maxLength: 20_000 });
    const limit = readIntegerParameter(body, "limit", {
      defaultValue: 20,
      minimum: 1,
      maximum: 200,
    });
    const attr = readStringParameter(body, "attr", { maxLength: 1_000 });
    const includeNodeRefs = readBooleanParameter(body, "includeNodeRefs", { defaultValue: true });
    const documentId = this.documentId(target);
    const script = `(() => {
      const selector = ${JSON.stringify(selector)};
      const limit = ${limit};
      const attr = ${JSON.stringify(attr ?? null)};
      const includeNodeRefs = ${JSON.stringify(includeNodeRefs)};
      const documentId = ${JSON.stringify(documentId)};
      const key = Symbol.for('vsgo.remote-browser.nodes');
      let registry = window[key];
      if (!(registry instanceof Map)) {
        registry = new Map();
        Object.defineProperty(window, key, { value: registry, configurable: true, enumerable: false });
      }
      const reverse = new Map();
      let nextOrdinal = 1;
      for (const [ref, element] of registry.entries()) {
        if (String(ref).startsWith(documentId + ':n')) {
          reverse.set(element, ref);
          const ordinal = Number(String(ref).slice(String(ref).lastIndexOf('n') + 1));
          if (Number.isFinite(ordinal)) nextOrdinal = Math.max(nextOrdinal, ordinal + 1);
        }
      }
      const elements = Array.from(document.querySelectorAll(selector)).slice(0, limit);
      return elements.map((element) => {
        let nodeRef;
        if (includeNodeRefs) {
          nodeRef = reverse.get(element);
          if (!nodeRef) {
            do { nodeRef = documentId + ':n' + nextOrdinal++; } while (registry.has(nodeRef));
            registry.set(nodeRef, element);
            reverse.set(element, nodeRef);
          }
        }
        const rect = element.getBoundingClientRect();
        return {
          nodeRef,
          tag: element.tagName,
          id: element.id || '',
          className: typeof element.className === 'string' ? element.className : '',
          text: String(element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 2000),
          attr: attr ? element.getAttribute(attr) : undefined,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      });
    })()`;
    let elements: unknown;
    try {
      elements = await this.evaluateValue(target, script, signal);
    } catch (error) {
      const fault = asApiFault(error);
      throw new ApiFault("QUERY_ERROR", "DOM query failed", { cause: fault.toJSON(), selector });
    }
    if (!Array.isArray(elements)) {
      throw new ApiFault("QUERY_ERROR", "DOM query returned an invalid result", { selector });
    }
    this.assertDocumentUnchanged(target, documentId);
    return this.forTarget({ selector, count: elements.length, elements }, target);
  }

  private async read(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const selector = readStringParameter(body, "selector", {
      defaultValue: "body",
      maxLength: 20_000,
    });
    const maxLength = readIntegerParameter(body, "maxLength", {
      defaultValue: 8_000,
      minimum: 0,
      maximum: 200_000,
    });
    const script = `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return { ok: false };
      const text = String(element.innerText || element.textContent || '').trim();
      const maxLength = ${maxLength};
      return {
        ok: true,
        tag: element.tagName,
        length: text.length,
        text: maxLength > 0 ? text.slice(0, maxLength) : text,
        truncated: maxLength > 0 && text.length > maxLength,
      };
    })()`;
    let result: unknown;
    try {
      result = await this.evaluateValue(target, script, signal);
    } catch (error) {
      throw new ApiFault("READ_ERROR", "Reading page text failed", {
        selector,
        cause: asApiFault(error).toJSON(),
      });
    }
    if (!isRecord(result) || result.ok !== true) {
      throw new ApiFault("ELEMENT_NOT_FOUND", `No element matches selector '${selector}'`, {
        selector,
      });
    }
    const { ok: _ok, ...data } = result;
    return this.forTarget({ selector, ...data }, target);
  }

  private locator(body: Record<string, unknown>, target: ResolvedTarget): PageLocator {
    const selector = readStringParameter(body, "selector", { maxLength: 20_000 });
    const nodeRef = readStringParameter(body, "nodeRef", { maxLength: 300 });
    if ((selector === undefined) === (nodeRef === undefined)) {
      throw new ApiFault(
        "VALIDATION_ERROR",
        "Exactly one of 'selector' or 'nodeRef' must be provided",
        { selector, nodeRef },
      );
    }
    if (nodeRef) this.validateNodeRef(target, nodeRef);
    return nodeRef ? { nodeRef } : { selector };
  }

  private validateNodeRef(target: ResolvedTarget, nodeRef: string): void {
    const parsed = parseNodeRef(nodeRef);
    if (!parsed) {
      throw new ApiFault("VALIDATION_ERROR", "Invalid nodeRef format", {
        nodeRef,
        expected: "doc_<document-id>:n<ordinal>",
      });
    }
    const current = this.documentId(target);
    if (parsed.documentId !== current) {
      throw new ApiFault("STALE_NODE_REF", "nodeRef belongs to a stale document", {
        nodeRef,
        nodeDocumentId: parsed.documentId,
        currentDocumentId: current,
      });
    }
  }

  private async elementAction(
    target: ResolvedTarget,
    locator: PageLocator,
    action: ElementAction,
    value: string | undefined,
    signal?: AbortSignal,
  ): Promise<ElementDescription> {
    const result = await this.evaluateValue(
      target,
      buildElementActionScript(locator, action, value),
      signal,
    );
    if (!isRecord(result)) {
      throw new ApiFault("EVALUATE_ERROR", "Element action returned an invalid result", {
        action,
        locator,
      });
    }
    const description = result as ElementDescription;
    if (description.ok !== true) {
      const reason = typeof description.reason === "string" ? description.reason : "element action failed";
      const code = reason === "element not found" ? "ELEMENT_NOT_FOUND" : "EVALUATE_ERROR";
      throw new ApiFault(code, reason, { action, locator });
    }
    return description;
  }

  private async click(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const locator = this.locator(body, target);
    const mode = enumValue(body, "mode", ["js", "mouse"] as const, "js");
    const focus = readBooleanParameter(body, "focus", { defaultValue: false });
    if (focus) target.window.focusTab(target.tab.id);
    if (mode === "js") {
      const description = await this.elementAction(target, locator, "click", undefined, signal);
      return this.forTarget({ mode, ...locator, ...description }, target);
    }

    const button = enumValue(body, "button", ["left", "middle", "right"] as const, "left");
    const clickCount = readIntegerParameter(body, "clickCount", {
      defaultValue: 1,
      minimum: 1,
      maximum: 3,
    });
    const description = await this.elementAction(target, locator, "inspect", undefined, signal);
    const point = this.elementCenter(description, locator);
    throwIfAborted(signal);
    target.window.sendInputToTab(target.tab.id, {
      type: "mouseMove",
      x: point.x,
      y: point.y,
    });
    target.window.sendInputToTab(target.tab.id, {
      type: "mouseDown",
      x: point.x,
      y: point.y,
      button,
      clickCount,
    });
    target.window.sendInputToTab(target.tab.id, {
      type: "mouseUp",
      x: point.x,
      y: point.y,
      button,
      clickCount,
    });
    return this.forTarget(
      { mode, ...locator, ...description, x: point.x, y: point.y, button, clickCount },
      target,
    );
  }

  private async hover(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const locator = this.locator(body, target);
    if (readBooleanParameter(body, "focus", { defaultValue: false })) {
      target.window.focusTab(target.tab.id);
    }
    const description = await this.elementAction(target, locator, "hover", undefined, signal);
    const point = this.elementCenter(description, locator);
    return this.forTarget({ ...locator, ...description, x: point.x, y: point.y }, target);
  }

  private elementCenter(
    description: ElementDescription,
    locator: PageLocator,
  ): { x: number; y: number } {
    const rect = description.rect;
    const x = rect?.centerX ??
      (typeof rect?.x === "number" && typeof rect?.width === "number"
        ? rect.x + rect.width / 2
        : undefined);
    const y = rect?.centerY ??
      (typeof rect?.y === "number" && typeof rect?.height === "number"
        ? rect.y + rect.height / 2
        : undefined);
    if (typeof x !== "number" || typeof y !== "number") {
      throw new ApiFault("ELEMENT_NOT_FOUND", "Element has no usable viewport rectangle", {
        locator,
        rect,
      });
    }
    return { x, y };
  }

  private async scroll(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const x = finiteNumber(body, "x", 0);
    const y = finiteNumber(body, "y", 0);
    const deltaX = finiteNumber(body, "deltaX", 0);
    const deltaY = finiteNumber(body, "deltaY", 0);
    if (readBooleanParameter(body, "focus", { defaultValue: false })) {
      target.window.focusTab(target.tab.id);
    }
    await this.evaluateValue(
      target,
      `(() => {
        const target = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)}) || document.scrollingElement || document.body;
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, clientX: ${JSON.stringify(x)}, clientY: ${JSON.stringify(y)}, deltaX: ${JSON.stringify(deltaX)}, deltaY: ${JSON.stringify(deltaY)} });
        target.dispatchEvent(event);
        if (!event.defaultPrevented) window.scrollBy(${JSON.stringify(deltaX)}, ${JSON.stringify(deltaY)});
        return true;
      })()`,
      signal,
    );
    return this.forTarget({ x, y, deltaX, deltaY }, target);
  }

  private async drag(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const fromX = finiteNumber(body, "fromX");
    const fromY = finiteNumber(body, "fromY");
    const toX = finiteNumber(body, "toX");
    const toY = finiteNumber(body, "toY");
    const button = enumValue(body, "button", ["left", "middle", "right"] as const, "left");
    const steps = readIntegerParameter(body, "steps", {
      defaultValue: 8,
      minimum: 1,
      maximum: 100,
    });
    if (readBooleanParameter(body, "focus", { defaultValue: false })) {
      target.window.focusTab(target.tab.id);
    }
    throwIfAborted(signal);
    target.window.sendInputToTab(target.tab.id, {
      type: "mouseMove",
      x: fromX,
      y: fromY,
    });
    target.window.sendInputToTab(target.tab.id, {
      type: "mouseDown",
      x: fromX,
      y: fromY,
      button,
      clickCount: 1,
    });
    for (let step = 1; step <= steps; step += 1) {
      throwIfAborted(signal);
      const ratio = step / steps;
      target.window.sendInputToTab(target.tab.id, {
        type: "mouseMove",
        x: fromX + (toX - fromX) * ratio,
        y: fromY + (toY - fromY) * ratio,
        button,
      });
    }
    target.window.sendInputToTab(target.tab.id, {
      type: "mouseUp",
      x: toX,
      y: toY,
      button,
      clickCount: 1,
    });
    return this.forTarget({ fromX, fromY, toX, toY, button, steps }, target);
  }

  private async key(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const key = readStringParameter(body, "key", { required: true, maxLength: 100 });
    const code = readStringParameter(body, "keyCode", { maxLength: 100 }) ?? key;
    const modifiers = stringArray(body.modifiers, "modifiers") ?? [];
    const allowedModifiers = new Set(["alt", "control", "meta", "shift"]);
    if (modifiers.some((modifier) => !allowedModifiers.has(modifier))) {
      throw new ApiFault("VALIDATION_ERROR", "Unsupported keyboard modifier", {
        modifiers,
        allowed: Array.from(allowedModifiers),
      });
    }
    if (readBooleanParameter(body, "focus", { defaultValue: false })) {
      target.window.focusTab(target.tab.id);
    }
    throwIfAborted(signal);
    const electronModifiers = modifiers as Electron.KeyboardInputEvent["modifiers"];
    target.window.sendInputToTab(target.tab.id, {
      type: "keyDown",
      keyCode: code,
      modifiers: electronModifiers,
    });
    target.window.sendInputToTab(target.tab.id, {
      type: "keyUp",
      keyCode: code,
      modifiers: electronModifiers,
    });
    return this.forTarget({ key, keyCode: code, modifiers }, target);
  }

  private async typeText(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const text = readStringParameter(body, "text", {
      required: true,
      allowEmpty: true,
      maxLength: 100_000,
    });
    const intervalMs = readIntegerParameter(body, "intervalMs", {
      defaultValue: 0,
      minimum: 0,
      maximum: 1_000,
    });
    const hasSelector = body.selector !== undefined;
    const hasNodeRef = body.nodeRef !== undefined;
    let locator: PageLocator | undefined;
    if (hasSelector || hasNodeRef) {
      locator = this.locator(body, target);
      if (readBooleanParameter(body, "clear", { defaultValue: false })) {
        await this.elementAction(target, locator, "clear", undefined, signal);
      }
      if (intervalMs === 0) {
        await this.elementAction(target, locator, "insertText", text, signal);
      } else {
        for (const character of Array.from(text)) {
          throwIfAborted(signal);
          await this.elementAction(target, locator, "insertText", character, signal);
          await delay(intervalMs, signal);
        }
      }
    }
    if (readBooleanParameter(body, "focus", { defaultValue: false })) {
      target.window.focusTab(target.tab.id);
    }
    if (!locator) {
      for (const character of Array.from(text)) {
        throwIfAborted(signal);
        target.window.sendInputToTab(target.tab.id, { type: "char", keyCode: character });
        if (intervalMs > 0) await delay(intervalMs, signal);
      }
    }
    return this.forTarget({ ...locator, text, length: text.length, intervalMs }, target);
  }

  private waitConditions(body: Record<string, unknown>): WaitCondition[] {
    const supplied = body.conditions;
    if (supplied !== undefined) {
      if (!Array.isArray(supplied) || supplied.length === 0) {
        throw new ApiFault("VALIDATION_ERROR", "'conditions' must be a non-empty array");
      }
      return supplied.map((condition, index) => {
        const record = requireObject(condition, `conditions[${index}]`);
        readStringParameter(record, "type", { required: true });
        return record as WaitCondition;
      });
    }

    const conditions: WaitCondition[] = [];
    const selector = readStringParameter(body, "selector", { maxLength: 20_000 });
    if (selector) {
      conditions.push({
        type: "selector",
        selector,
        state: enumValue(
          body,
          "state",
          ["attached", "visible", "hidden", "detached", "enabled", "disabled"] as const,
          "attached",
        ),
      });
    }
    const text = readStringParameter(body, "text", { allowEmpty: true, maxLength: 200_000 });
    if (text !== undefined) {
      conditions.push({ type: "text", selector: selector ?? "body", value: text });
    }
    const urlMatches = readStringParameter(body, "urlMatches", { maxLength: 20_000 });
    if (urlMatches) {
      conditions.push({
        type: "url",
        value: urlMatches,
        match: "contains",
      });
    }
    const loadState = readStringParameter(body, "loadState");
    if (loadState !== undefined) {
      if (!["domcontentloaded", "load", "networkidle"].includes(loadState)) {
        throw new ApiFault("VALIDATION_ERROR", "Unsupported loadState", { loadState });
      }
      if (loadState === "networkidle") {
        conditions.push({
          type: "networkIdle",
          idleMs: readIntegerParameter(body, "networkIdleMs", {
            defaultValue: 500,
            minimum: 100,
            maximum: 10_000,
          }),
        });
      } else {
        conditions.push({ type: "lifecycle", state: loadState });
      }
    }
    const expression = readStringParameter(body, "expression", { maxLength: 1_000_000 });
    if (expression) conditions.push({ type: "expression", expression });
    if (conditions.length === 0) {
      throw new ApiFault("VALIDATION_ERROR", "At least one wait condition is required");
    }
    return conditions;
  }

  private async wait(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const conditions = this.waitConditions(body);
    const timeoutMs = readIntegerParameter(body, "timeoutMs", {
      defaultValue: readIntegerParameter(body, "timeout", {
        defaultValue: 5_000,
        minimum: 1,
        maximum: 120_000,
      }),
      minimum: 1,
      maximum: 120_000,
    });
    const pollIntervalMs = readIntegerParameter(body, "pollIntervalMs", {
      defaultValue: readIntegerParameter(body, "pollInterval", {
        defaultValue: 100,
        minimum: 10,
        maximum: 5_000,
      }),
      minimum: 10,
      maximum: 5_000,
    });
    const mode = enumValue(body, "mode", ["all", "any"] as const, "all") as WaitMode;
    const needsDebugger = conditions.some((condition) =>
      [
        "networkIdle",
        "runtimeQuiet",
        "event",
        "console",
        "runtimeException",
        "request",
        "response",
      ].includes(condition.type),
    );
    let temporarySession: RemoteBrowserDebugSession | undefined;
    if (needsDebugger && remoteBrowserDebugger.getActivity(target.tab.id)?.activeSessions === 0) {
      temporarySession = await remoteBrowserDebugger.startSession(target.tab.id);
    }
    const baseline = Date.now();
    try {
      const result = await waitForConditions(
        {
          evaluate: (expression) => this.evaluateValue(target, expression, signal),
          getUrl: () => this.currentWebContents(target).getURL(),
          getActivity: () => {
            const activity = remoteBrowserDebugger.getActivity(target.tab.id);
            return {
              pendingNetwork: activity?.pendingNetwork ?? 0,
              lastNetworkActivity: activity?.lastNetworkActivity ?? baseline,
              lastRuntimeErrorAt: activity?.lastRuntimeError?.timestamp ?? null,
            };
          },
          getEvents: (after) =>
            remoteBrowserDebugger.getTabEvents(target.tab.id, after, 1_000).map(
              (event): WaitEvent => ({
                seq: event.seq,
                type: eventTypeForWait(event.type),
                timestamp: new Date(event.timestamp).toISOString(),
                payload: event.payload,
              }),
            ),
          getLatestSequence: () => remoteBrowserDebugger.getLatestSequence(target.tab.id),
          signal,
        },
        conditions,
        { mode, timeoutMs, pollIntervalMs },
      );
      return this.forTarget(
        {
          ...result,
          selector: typeof body.selector === "string" ? body.selector : null,
          url: this.currentWebContents(target).getURL(),
        },
        target,
      );
    } finally {
      if (temporarySession) await remoteBrowserDebugger.stopSession(temporarySession.sessionId);
    }
  }

  private async screenshot(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const stayHidden = readBooleanParameter(body, "stayHidden", { defaultValue: true });
    const encoding = enumValue(body, "encoding", ["base64", "dataUrl", "both"] as const, "base64");
    const captured = await withDeadline(
      target.window.captureTab(target.tab.id, { stayHidden }),
      30_000,
      signal,
      "Screenshot capture",
    ).catch((error) => {
      throw new ApiFault("CAPTURE_ERROR", "Screenshot capture failed", {
        cause: asApiFault(error).toJSON(),
      });
    });
    const data: Record<string, unknown> = {
      width: captured.width,
      height: captured.height,
      mime: "image/png",
      windowVisible: target.window.isWindowVisible(),
      stayHidden,
    };
    if (encoding === "base64" || encoding === "both") data.base64 = captured.base64;
    if (encoding === "dataUrl" || encoding === "both") data.dataUrl = captured.dataUrl;
    return this.forTarget(data, target);
  }

  private windowVisibility(
    body: Record<string, unknown>,
    action: "show" | "hide" | "focus",
  ): RemoteBrowserServiceResult {
    const target = this.resolveTarget(body);
    // 「远程浏览器控制」窗口的显隐只由用户通过托盘菜单控制：API 侧一律不下发到窗口，
    // 否则 LLM 每次操作都可能把窗口弹到前台抢走用户焦点。这里只回报真实可见性。
    const suppressed = target.window.isRemoteControl;
    if (!suppressed) {
      if (action === "hide") target.window.hide();
      else target.window.showAndFocus();
    }
    return this.forTarget(
      {
        windowId: target.window.hostWindow.id,
        visible: target.window.isWindowVisible(),
        focused: target.window.hostWindow.isFocused(),
        action,
        suppressed,
        visibilityControl: suppressed ? "user" : "api",
      },
      target,
    );
  }

  private async devtools(body: Record<string, unknown>): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const open = readBooleanParameter(body, "open", { required: true });
    if (open) {
      const activeSessions = remoteBrowserDebugger
        .listSessions()
        .filter((session) => session.tabId === target.tab.id && session.status === "active");
      if (activeSessions.length > 0) {
        const force = readBooleanParameter(body, "force", { defaultValue: false });
        if (!force) {
          throw new ApiFault(
            "CONFLICT",
            "DevTools would detach the active remote debugger; stop the sessions or pass force:true",
            { sessionIds: activeSessions.map((session) => session.sessionId) },
          );
        }
        await Promise.all(
          activeSessions.map((session) => remoteBrowserDebugger.stopSession(session.sessionId)),
        );
      }
      if (!target.wc.isDevToolsOpened()) target.wc.openDevTools({ mode: "detach" });
    } else if (target.wc.isDevToolsOpened()) {
      target.wc.closeDevTools();
    }
    return this.forTarget({ open: target.wc.isDevToolsOpened(), target: this.describeTarget(target) }, target);
  }

  private captureFromBody(body: Record<string, unknown>): RemoteBrowserCaptureInput | undefined {
    if (body.capture !== undefined) {
      const capture = body.capture;
      if (typeof capture === "boolean") return capture;
      if (Array.isArray(capture)) return stringArray(capture, "capture") ?? [];
      return requireObject(capture, "capture") as Partial<{
        console: boolean;
        navigation: boolean;
        runtime: boolean;
        network: boolean;
        page: boolean;
        log: boolean;
        crashes: boolean;
        types: readonly string[];
      }>;
    }
    const categories = stringArray(body.categories, "categories");
    if (!categories) return undefined;
    const allowed = new Set(["console", "navigation", "runtime", "network", "page", "log", "crashes"]);
    if (categories.some((category) => !allowed.has(category))) {
      throw new ApiFault("VALIDATION_ERROR", "Unsupported capture category", {
        categories,
        allowed: Array.from(allowed),
      });
    }
    return {
      console: categories.includes("console"),
      navigation: categories.includes("navigation"),
      runtime: categories.includes("runtime"),
      network: categories.includes("network"),
      page: categories.includes("page"),
      log: categories.includes("log"),
      crashes: categories.includes("crashes"),
    };
  }

  private async sessionStart(body: Record<string, unknown>): Promise<RemoteBrowserServiceResult> {
    this.pruneSessionExtras();
    const target = this.resolveTarget(body);
    const capture = this.captureFromBody(body);
    const session = await remoteBrowserDebugger.startSession(target.tab.id, capture);
    const categories = stringArray(body.categories, "categories") ?? [
      "console",
      "navigation",
      "runtime",
      "network",
      "page",
      "log",
      "crashes",
    ];
    const extras: SessionExtras = {
      categories,
      captureResponseBodies: readBooleanParameter(body, "captureResponseBodies", {
        defaultValue: false,
      }),
      maxBodyBytes: readIntegerParameter(body, "maxBodyBytes", {
        defaultValue: DEFAULT_NETWORK_BODY_BYTES,
        minimum: 1,
        maximum: MAX_NETWORK_BODY_BYTES,
      }),
    };
    this.sessionExtras.set(session.sessionId, extras);
    if (extras.captureResponseBodies) {
      remoteBrowserDebugger.configureResponseBodyCapture(session.sessionId, extras.maxBodyBytes);
    }
    return this.forTarget(this.sessionView(session, target), target);
  }

  private sessionList(body: Record<string, unknown>): RemoteBrowserServiceResult {
    this.pruneSessionExtras();
    let sessions = remoteBrowserDebugger.listSessions();
    const selector = parseTargetSelector(body);
    const explicit = Object.keys(selector).length > 0;
    let selected: ResolvedTarget | undefined;
    if (explicit) {
      selected = this.resolveTarget(body, { requireExplicit: true });
      sessions = sessions.filter((session) => session.tabId === selected?.tab.id);
    }
    const activeValue = body.active;
    if (activeValue !== undefined) {
      const active =
        typeof activeValue === "boolean"
          ? activeValue
          : activeValue === "true"
            ? true
            : activeValue === "false"
              ? false
              : undefined;
      if (active === undefined) {
        throw new ApiFault("VALIDATION_ERROR", "'active' must be a boolean");
      }
      sessions = sessions.filter((session) => (session.status === "active") === active);
    }
    const limit = readIntegerParameter(body, "limit", {
      defaultValue: 100,
      minimum: 1,
      maximum: 500,
    });
    sessions = sessions.slice(0, limit);
    const data = {
      sessions: sessions.map((session) => this.sessionView(session)),
      count: sessions.length,
    };
    return selected ? this.forTarget(data, selected) : { data };
  }

  private sessionGet(body: Record<string, unknown>): RemoteBrowserServiceResult {
    const sessionId = readStringParameter(body, "sessionId", { required: true, maxLength: 200 });
    const session = this.requireSession(sessionId);
    const target = this.tryResolveSessionTarget(session);
    return target
      ? this.forTarget(this.sessionView(session, target), target)
      : { data: this.sessionView(session) };
  }

  private async sessionEvents(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const sessionId = readStringParameter(body, "sessionId", { required: true, maxLength: 200 });
    const session = this.requireSession(sessionId);
    const after = body.after ?? body.cursor ?? 0;
    if (typeof after !== "number" && typeof after !== "string") {
      throw new ApiFault("VALIDATION_ERROR", "'after' must be a sequence number or eventId");
    }
    const limit = readIntegerParameter(body, "limit", {
      defaultValue: 200,
      minimum: 1,
      maximum: 1_000,
    });
    const waitMs = readIntegerParameter(body, "waitMs", {
      defaultValue: 0,
      minimum: 0,
      maximum: 30_000,
    });
    const requestedTypes = stringArray(body.types, "types");
    const categories = stringArray(body.categories, "categories");
    const types = requestedTypes ?? this.typesForCategories(categories);
    const levels = stringArray(body.levels, "levels");
    const startedAt = Date.now();
    const afterSequence = remoteBrowserDebugger.resolveSessionCursor(sessionId, after);
    let scanCursor = afterSequence;
    let events: RemoteBrowserDebugEvent[] = [];
    for (;;) {
      throwIfAborted(signal);
      events = [];
      scanCursor = afterSequence;
      for (;;) {
        const rawPage = remoteBrowserDebugger.getSessionEvents(sessionId, scanCursor, 1_000);
        if (rawPage.length === 0) break;
        for (const event of rawPage) {
          scanCursor = event.seq;
          if (!matchesRequestedEventType(event.type, types)) continue;
          if (levels && !levels.includes(this.eventLevel(event))) continue;
          events.push(event);
          if (events.length >= limit) break;
        }
        if (events.length >= limit || rawPage.length < 1_000) break;
      }
      if (events.length > 0 || scanCursor > afterSequence || Date.now() - startedAt >= waitMs) break;
      await delay(Math.min(100, waitMs - (Date.now() - startedAt)), signal);
    }
    const bounds = remoteBrowserDebugger.getSessionEventBounds(sessionId);
    const target = this.tryResolveSessionTarget(session);
    const data = {
      sessionId,
      events,
      cursor: scanCursor,
      oldestSeq: bounds.oldestSeq,
      newestSeq: bounds.newestSeq,
      truncated: afterSequence === 0 && bounds.droppedCount > 0,
      hasMore: bounds.newestSeq !== null && scanCursor < bounds.newestSeq,
      timedOut: events.length === 0 && waitMs > 0,
    };
    return target ? this.forTarget(data, target) : { data };
  }

  private async sessionStop(body: Record<string, unknown>): Promise<RemoteBrowserServiceResult> {
    const sessionId = readStringParameter(body, "sessionId", { required: true, maxLength: 200 });
    const before = this.requireSession(sessionId);
    const target = this.tryResolveSessionTarget(before);
    const session = await remoteBrowserDebugger.stopSession(sessionId);
    if (!session) throw new ApiFault("SESSION_NOT_FOUND", `Session '${sessionId}' was not found`);
    return target
      ? this.forTarget(this.sessionView(session, target), target)
      : { data: this.sessionView(session) };
  }

  private requireSession(sessionId: string): RemoteBrowserDebugSession {
    const session = remoteBrowserDebugger.getSession(sessionId);
    if (!session) {
      throw new ApiFault("SESSION_NOT_FOUND", `Debug session '${sessionId}' was not found`, {
        sessionId,
      }, 404);
    }
    return session;
  }

  private sessionView(
    session: RemoteBrowserDebugSession,
    target?: ResolvedTarget,
  ): Record<string, unknown> {
    const extras = this.sessionExtras.get(session.sessionId);
    const bounds = remoteBrowserDebugger.getSessionEventBounds(session.sessionId);
    const activity = remoteBrowserDebugger.getActivity(session.tabId);
    return {
      ...session,
      active: session.status === "active",
      target: target?.tab.id === session.tabId
        ? this.describeTarget(target)
        : this.describeTabById(session.tabId),
      categories: extras?.categories ?? this.categoriesFromCapture(session),
      captureResponseBodies: extras?.captureResponseBodies ?? false,
      maxBodyBytes: extras?.maxBodyBytes,
      cursor: bounds.newestSeq ?? 0,
      oldestCursor: bounds.oldestSeq ?? 0,
      documentId: activity?.documentId,
    };
  }

  private categoriesFromCapture(session: RemoteBrowserDebugSession): string[] {
    return (["console", "navigation", "runtime", "network", "page", "log", "crashes"] as const)
      .filter((category) => session.capture[category]);
  }

  private typesForCategories(categories?: string[]): string[] | undefined {
    if (!categories || categories.length === 0) return undefined;
    const result: string[] = [];
    for (const category of categories) {
      if (category === "console") result.push("console-message", "Runtime.consoleAPICalled");
      else if (category === "runtime") result.push("Runtime.*");
      else if (category === "network") result.push("Network.*");
      else if (category === "page") result.push("Page.*");
      else if (category === "log") result.push("Log.*");
      else if (category === "navigation") {
        result.push("did-start-navigation", "did-navigate", "did-navigate-in-page", "did-fail-load");
      } else if (category === "crashes") result.push("render-process-gone", "destroyed");
      else throw new ApiFault("VALIDATION_ERROR", `Unsupported event category '${category}'`);
    }
    return result;
  }

  private eventLevel(event: RemoteBrowserDebugEvent): string {
    const payload = eventPayload(event);
    const level = payload.level ?? payload.type;
    if (typeof level === "string") {
      const normalized = level.toLowerCase();
      if (normalized === "error" || normalized === "warning" || normalized === "debug") return normalized;
      if (normalized === "warn") return "warning";
    }
    if (event.type === "Runtime.exceptionThrown" || event.type === "Network.loadingFailed" || event.type === "did-fail-load") {
      return "error";
    }
    const status = eventHttpStatus(event);
    if (status !== undefined && status >= 400) return "error";
    return "info";
  }

  private tryResolveSessionTarget(session: RemoteBrowserDebugSession): ResolvedTarget | undefined {
    try {
      return this.resolveSelector({ tabId: session.tabId }, false);
    } catch {
      return undefined;
    }
  }

  private async snapshot(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    return this.forTarget(await this.snapshotTarget(target, body, signal), target);
  }

  private async snapshotTarget(
    target: ResolvedTarget,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const requested = readStringParameter(body, "mode") ?? readStringParameter(body, "format") ?? "accessibility";
    if (!["accessibility", "dom", "interactive"].includes(requested)) {
      throw new ApiFault("VALIDATION_ERROR", "Unsupported snapshot mode", { mode: requested });
    }
    const mode = requested as "accessibility" | "dom" | "interactive";
    const maxNodes = readIntegerParameter(body, "maxNodes", {
      defaultValue: 2_000,
      minimum: 1,
      maximum: MAX_SNAPSHOT_NODES,
    });
    const maxTextLength = readIntegerParameter(body, "maxTextLength", {
      defaultValue: 2_000,
      minimum: 16,
      maximum: 100_000,
    });
    const selector = readStringParameter(body, "selector", { maxLength: 20_000 });
    const maxDepth = readIntegerParameter(body, "maxDepth", {
      defaultValue: 20,
      minimum: 0,
      maximum: 100,
    });
    const includeAttributes = stringArray(body.includeAttributes, "includeAttributes");
    const documentId = this.documentId(target);
    const result = await this.evaluateValue(
      target,
      buildSnapshotScript({
        documentId,
        format: mode === "dom" ? "dom" : "accessibility",
        interactiveOnly: mode === "interactive",
        includeHidden: readBooleanParameter(body, "includeHidden", { defaultValue: false }),
        maxNodes,
        maxTextLength,
        selector,
        maxDepth,
        includeText: readBooleanParameter(body, "includeText", { defaultValue: true }),
        includeRects: readBooleanParameter(body, "includeRects", { defaultValue: true }),
        includeAttributes,
      }),
      signal,
    );
    if (!isRecord(result)) {
      throw new ApiFault("CAPTURE_ERROR", "Page snapshot returned an invalid result");
    }
    if (result.ok === false) {
      throw new ApiFault("ELEMENT_NOT_FOUND", String(result.reason ?? "snapshot root not found"), {
        selector,
      });
    }
    this.assertDocumentUnchanged(target, documentId);
    const nodes = Array.isArray(result.nodes) ? result.nodes : [];
    return {
      ...result,
      documentId,
      mode,
      target: this.describeTarget(target),
      rootRef: isRecord(nodes[0]) && typeof nodes[0].nodeRef === "string" ? nodes[0].nodeRef : null,
      nodeCount: nodes.length,
    };
  }

  private async nodeAction(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const locator = this.locator(body, target);
    const action = enumValue(
      body,
      "action",
      ["inspect", "click", "focus", "hover", "clear", "setValue"] as const,
      "inspect",
    );
    const value = readStringParameter(body, "value", { allowEmpty: true, maxLength: 1_000_000 });
    if (action === "setValue" && value === undefined) {
      throw new ApiFault("VALIDATION_ERROR", "'value' is required for setValue");
    }
    if (action === "hover") {
      const description = await this.elementAction(target, locator, "hover", undefined, signal);
      const point = this.elementCenter(description, locator);
      return this.forTarget(
        { action, ...locator, ...description, x: point.x, y: point.y },
        target,
      );
    }
    const result = await this.elementAction(target, locator, action, value, signal);
    return this.forTarget({ action, ...locator, ...result }, target);
  }

  private async sourceResolve(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const generatedUrl = readStringParameter(body, "generatedUrl", {
      required: true,
      maxLength: 100_000,
    });
    const line = readIntegerParameter(body, "line", { required: true, minimum: 1 });
    const column = readIntegerParameter(body, "column", { required: true, minimum: 1 });
    try {
      const resolved = await withDeadline(
        remoteBrowserSourceMaps.resolve(target.wc, { url: generatedUrl, line, column }),
        15_000,
        signal,
        "Source-map resolution",
      );
      const includeSourceContent = readBooleanParameter(body, "includeSourceContent", {
        defaultValue: true,
      });
      return this.forTarget(
        {
          ...resolved,
          sourceContent: includeSourceContent ? resolved.sourceContent : null,
          codeFrame: includeSourceContent ? resolved.codeFrame : null,
        },
        target,
      );
    } catch (error) {
      const fault = asApiFault(error);
      if (signal?.aborted || fault.code === "TIMEOUT") throw fault;
      throw new ApiFault("SOURCE_MAP_NOT_FOUND", "Unable to resolve generated source location", {
        generated: { url: generatedUrl, line, column },
        cause: error instanceof Error ? error.message : String(error),
      }, 404);
    }
  }

  private async networkBody(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const sessionId = readStringParameter(body, "sessionId", { required: true, maxLength: 200 });
    const requestId = readStringParameter(body, "requestId", { required: true, maxLength: 500 });
    const session = this.requireSession(sessionId);
    const target = this.tryResolveSessionTarget(session);
    if (!target) {
      throw new ApiFault("TARGET_CLOSED", `The tab for session '${sessionId}' is no longer available`);
    }
    const extras = this.sessionExtras.get(sessionId);
    if (!extras?.captureResponseBodies) {
      throw new ApiFault(
        "FORBIDDEN",
        "This session was not started with captureResponseBodies:true",
        { sessionId },
      );
    }
    const maxBytes = readIntegerParameter(body, "maxBytes", {
      defaultValue: extras?.maxBodyBytes ?? DEFAULT_NETWORK_BODY_BYTES,
      minimum: 1,
      maximum: MAX_NETWORK_BODY_BYTES,
    });
    throwIfAborted(signal);
    const data = this.networkBodyFor(session, requestId, maxBytes);
    return this.forTarget(data, target);
  }

  private networkBodyFor(
    session: RemoteBrowserDebugSession,
    requestId: string,
    maxBytes: number,
  ): Record<string, unknown> {
    const retained = remoteBrowserDebugger.getRetainedResponseBody(session.sessionId, requestId);
    if (!retained) {
      throw new ApiFault("REQUEST_NOT_FOUND", "The response body was not retained or was evicted", {
        sessionId: session.sessionId,
        requestId,
      }, 404);
    }
    let returnedBody: string;
    let bytes: number;
    if (retained.base64Encoded) {
      const decoded = Buffer.from(retained.body, "base64");
      const selected = decoded.subarray(0, maxBytes);
      bytes = selected.byteLength;
      returnedBody = selected.toString("base64");
    } else {
      const selected = truncateUtf8Text(retained.body, maxBytes);
      returnedBody = selected.text;
      bytes = selected.bytes;
    }
    return {
      ...retained,
      charset: null,
      body: returnedBody,
      bytes,
      truncated: retained.truncated || bytes < retained.bytes,
    };
  }

  private async diagnostics(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const target = this.resolveTarget(body);
    const suppliedSessionId = readStringParameter(body, "sessionId", { maxLength: 200 });
    let temporarySession: RemoteBrowserDebugSession | undefined;
    let effectiveBody = body;
    if (!suppliedSessionId) {
      temporarySession = await remoteBrowserDebugger.startSession(target.tab.id);
      effectiveBody = {
        ...body,
        sessionId: temporarySession.sessionId,
        temporaryCapture: true,
      };
    }
    try {
      return await this.collectDiagnostics(target, effectiveBody, signal);
    } finally {
      if (temporarySession) {
        await remoteBrowserDebugger.stopSession(temporarySession.sessionId);
      }
    }
  }

  private async collectDiagnostics(
    target: ResolvedTarget,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const eventLimit = readIntegerParameter(body, "eventLimit", {
      defaultValue: 500,
      minimum: 1,
      maximum: 1_000,
    });
    const sessionId = readStringParameter(body, "sessionId", { maxLength: 200 });
    let session: RemoteBrowserDebugSession | undefined;
    let events: RemoteBrowserDebugEvent[];
    if (sessionId) {
      session = this.requireSession(sessionId);
      if (session.tabId !== target.tab.id) {
        throw new ApiFault("CONFLICT", "Diagnostics session belongs to a different tab", {
          sessionId,
          sessionTabId: session.tabId,
          targetTabId: target.tab.id,
        });
      }
      // A temporary session (created by /browser/diagnostics when no
      // sessionId is supplied) only covers the instant of the call. The useful
      // signal is the tab's persistent event buffer, which now accumulates
      // across WebContents rebuilds, so read that for a one-shot diagnostics.
      events = body.temporaryCapture === true
        ? remoteBrowserDebugger.getTabEvents(target.tab.id, 0, eventLimit)
        : remoteBrowserDebugger.getRecentSessionEvents(sessionId, eventLimit);
    } else {
      events = remoteBrowserDebugger.getTabEvents(target.tab.id, 0, eventLimit);
    }
    const since = readStringParameter(body, "since");
    if (since) {
      const timestamp = Date.parse(since);
      if (!Number.isFinite(timestamp)) {
        throw new ApiFault("VALIDATION_ERROR", "'since' must be an ISO timestamp", { since });
      }
      events = events.filter((event) => event.timestamp >= timestamp);
    }

    const warnings: string[] = body.temporaryCapture === true
      ? ["A temporary debug session was created; CDP events only cover this diagnostics call."]
      : [];
    const issues = events
      .filter((event) => this.isDiagnosticIssue(event))
      .map((event) => ({
        eventId: event.eventId,
        seq: event.seq,
        documentId: event.documentId,
        timestamp: event.timestamp,
        type: event.type,
        level: this.eventLevel(event),
        payload: event.payload,
      }));
    let readyState: unknown = null;
    try {
      readyState = await this.evaluateValue(target, "document.readyState", signal, 5_000);
    } catch (error) {
      warnings.push(`readyState: ${asApiFault(error).message}`);
    }
    const state = {
      ...this.tabState(target.window, target.tab.id),
      documentId: this.documentId(target),
      documentReadyState: readyState,
    };
    let snapshot: Record<string, unknown> | null = null;
    if (readBooleanParameter(body, "includeSnapshot", { defaultValue: true })) {
      try {
        snapshot = await this.snapshotTarget(
          target,
          {
            mode: body.snapshotMode ?? "interactive",
            maxNodes: body.maxSnapshotNodes ?? 2_000,
            includeHidden: body.includeHidden ?? false,
          },
          signal,
        );
      } catch (error) {
        warnings.push(`snapshot: ${asApiFault(error).message}`);
      }
    }
    let screenshot: Record<string, unknown> | null = null;
    if (readBooleanParameter(body, "includeScreenshot", { defaultValue: true })) {
      try {
        const captured = await withDeadline(
          target.window.captureTab(target.tab.id, { stayHidden: true }),
          30_000,
          signal,
          "Diagnostic screenshot",
        );
        screenshot = {
          width: captured.width,
          height: captured.height,
          mime: "image/png",
          base64: captured.base64,
        };
      } catch (error) {
        warnings.push(`screenshot: ${asApiFault(error).message}`);
      }
    }

    let sourceMap: unknown = null;
    if (readBooleanParameter(body, "resolveSourceMap", {
      defaultValue: readBooleanParameter(body, "includeSourceMap", { defaultValue: false }),
    })) {
      const exception = events.find((event) => event.type === "Runtime.exceptionThrown");
      const location = exception ? this.exceptionLocation(exception) : undefined;
      if (location) {
        try {
          sourceMap = await remoteBrowserSourceMaps.resolve(target.wc, location);
        } catch (error) {
          warnings.push(`sourceMap: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    const networkBodies: Record<string, unknown>[] = [];
    if (readBooleanParameter(body, "includeNetworkBodies", { defaultValue: false })) {
      if (!session) {
        warnings.push("networkBodies: sessionId is required");
      } else {
        const requestIds = Array.from(new Set(
          events
            .filter((event) => event.type === "Network.responseReceived")
            .map(eventRequestId)
            .filter((value): value is string => Boolean(value)),
        )).slice(0, 20);
        const maxBytes = readIntegerParameter(body, "maxBodyBytes", {
          defaultValue: 512 * 1024,
          minimum: 1,
          maximum: MAX_NETWORK_BODY_BYTES,
        });
        for (const requestId of requestIds) {
          try {
            networkBodies.push(this.networkBodyFor(session, requestId, maxBytes));
          } catch (error) {
            warnings.push(`networkBody ${requestId}: ${asApiFault(error).message}`);
          }
        }
      }
    }

    const summary = {
      consoleErrors: events.filter((event) =>
        (event.type === "console-message" || event.type === "Runtime.consoleAPICalled") &&
        this.eventLevel(event) === "error",
      ).length,
      runtimeExceptions: events.filter((event) => event.type === "Runtime.exceptionThrown").length,
      failedRequests: events.filter((event) =>
        event.type === "Network.loadingFailed" ||
        event.type === "did-fail-load" ||
        (eventHttpStatus(event) ?? 0) >= 400,
      ).length,
      navigations: events.filter((event) =>
        event.type === "did-navigate" || event.type === "Page.frameNavigated",
      ).length,
      issues: issues.length,
    };
    return this.forTarget(
      {
        collectedAt: new Date().toISOString(),
        target: this.describeTarget(target),
        state,
        activity: remoteBrowserDebugger.getActivity(target.tab.id),
        session: session ? this.sessionView(session, target) : null,
        summary,
        events,
        issues,
        snapshot,
        screenshot,
        sourceMap,
        networkBodies,
        warnings,
      },
      target,
    );
  }

  private isDiagnosticIssue(event: RemoteBrowserDebugEvent): boolean {
    return (
      this.eventLevel(event) === "error" ||
      event.type === "Network.loadingFailed" ||
      event.type === "did-fail-load" ||
      event.type === "render-process-gone" ||
      event.type === "debugger.attach-failed" ||
      event.type === "debugger.devtools-conflict"
    );
  }

  private exceptionLocation(
    event: RemoteBrowserDebugEvent,
  ): { url: string; line: number; column: number } | undefined {
    const payload = eventPayload(event);
    const details = isRecord(payload.exceptionDetails) ? payload.exceptionDetails : payload;
    const url = typeof details.url === "string" ? details.url : undefined;
    const line = typeof details.lineNumber === "number" ? details.lineNumber + 1 : undefined;
    const column = typeof details.columnNumber === "number" ? details.columnNumber + 1 : undefined;
    return url && line && column ? { url, line, column } : undefined;
  }

  private async batch(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteBrowserServiceResult> {
    const operations = body.operations;
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new ApiFault("VALIDATION_ERROR", "'operations' must be a non-empty array");
    }
    if (operations.length > MAX_BATCH_OPERATIONS) {
      throw new ApiFault("VALIDATION_ERROR", `A batch may contain at most ${MAX_BATCH_OPERATIONS} operations`, {
        count: operations.length,
        maximum: MAX_BATCH_OPERATIONS,
      });
    }
    const stopOnError = readBooleanParameter(body, "stopOnError", { defaultValue: true });
    const timeout = readIntegerParameter(body, "timeout", {
      defaultValue: 30_000,
      minimum: 100,
      maximum: 120_000,
    });
    const startedAt = Date.now();
    const results: Array<Record<string, unknown>> = [];
    const successfulResults = new Map<string, RemoteBrowserServiceResult>();
    const usedIds = new Set<string>();
    let failed = 0;
    let stopped = false;

    for (let index = 0; index < operations.length; index += 1) {
      const step = requireObject(operations[index], `operations[${index}]`);
      const id = readStringParameter(step, "id", {
        defaultValue: String(index),
        maxLength: 100,
      });
      if (usedIds.has(id)) {
        throw new ApiFault("VALIDATION_ERROR", `Duplicate batch operation id '${id}'`);
      }
      usedIds.add(id);
      if (stopped) {
        results.push({ id, index, skipped: true, status: 424 });
        continue;
      }
      throwIfAborted(signal);
      if (Date.now() - startedAt >= timeout) {
        const fault = new ApiFault("TIMEOUT", `Batch exceeded ${timeout}ms`);
        results.push({ id, index, skipped: false, status: fault.status, error: fault.toJSON() });
        failed += 1;
        stopped = stopOnError;
        continue;
      }
      try {
        const operation = this.batchOperation(step);
        if (operation === "batch") {
          throw new ApiFault("VALIDATION_ERROR", "Nested batch operations are not allowed");
        }
        const rawQuery = step.query === undefined
          ? {}
          : requireObject(step.query, `operations[${index}].query`);
        const rawBody = step.body === undefined
          ? {}
          : requireObject(step.body, `operations[${index}].body`);
        const query = requireObject(
          resolveBatchReferences(rawQuery, successfulResults),
          `operations[${index}].query`,
        );
        const requestBody = requireObject(
          resolveBatchReferences(rawBody, successfulResults),
          `operations[${index}].body`,
        );
        const input = { ...query, ...requestBody };
        const remainingMs = Math.max(1, timeout - (Date.now() - startedAt));
        const stepController = new AbortController();
        const relayAbort = (): void => stepController.abort(signal?.reason);
        if (signal?.aborted) relayAbort();
        else signal?.addEventListener("abort", relayAbort, { once: true });
        const stepTimer = setTimeout(
          () => stepController.abort(new Error(`Batch operation '${id}' exceeded ${remainingMs}ms`)),
          remainingMs,
        );
        let result: RemoteBrowserServiceResult;
        try {
          result = await withDeadline(
            this.dispatch(operation, input, stepController.signal, true),
            remainingMs,
            stepController.signal,
            `Batch operation '${id}'`,
          );
        } finally {
          clearTimeout(stepTimer);
          signal?.removeEventListener("abort", relayAbort);
        }
        results.push({
          id,
          index,
          operation,
          skipped: false,
          status: 200,
          data: result.data,
          meta: result.meta,
        });
        successfulResults.set(id, result);
      } catch (error) {
        const fault = asApiFault(error);
        failed += 1;
        results.push({
          id,
          index,
          operation: typeof step.operation === "string" ? step.operation : undefined,
          skipped: false,
          status: fault.status,
          error: fault.toJSON(),
        });
        if (stopOnError) stopped = true;
      }
    }
    const skipped = results.filter((result) => result.skipped === true).length;
    const completed = results.filter((result) => result.status === 200).length;
    return {
      data: {
        transactional: false,
        stopOnError,
        results,
        completed,
        failed,
        skipped,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  private batchOperation(step: Record<string, unknown>): Operation {
    const named = readStringParameter(step, "operation");
    const path = readStringParameter(step, "path");
    if ((named === undefined) === (path === undefined)) {
      throw new ApiFault("VALIDATION_ERROR", "Each batch step must provide exactly one of 'operation' or 'path'");
    }
    let operation: Operation | undefined;
    if (named !== undefined) {
      operation = OPERATION_SET.has(named) ? named as Operation : undefined;
    } else if (path !== undefined) {
      operation = PATH_TO_OPERATION[path];
    }
    if (!operation) {
      throw new ApiFault("NOT_FOUND", "Unknown batch operation", { operation: named, path });
    }
    const method = readStringParameter(step, "method");
    if (method && method.toUpperCase() !== OPERATION_METHOD[operation]) {
      throw new ApiFault("METHOD_NOT_ALLOWED", `Method ${method} is not allowed for '${operation}'`, {
        allowed: OPERATION_METHOD[operation],
      });
    }
    return operation;
  }

  private resolveTarget(
    body: Record<string, unknown>,
    options: {
      destinationUrl?: boolean;
      requireExplicit?: boolean;
      allowInternal?: boolean;
    } = {},
  ): ResolvedTarget {
    const selectorInput = options.destinationUrl ? { ...body, url: undefined } : body;
    const selector = parseTargetSelector(selectorInput);
    return this.resolveSelector(
      selector,
      options.requireExplicit === true,
      options.allowInternal === true,
    );
  }

  private resolveSelector(
    selector: TargetSelector,
    requireExplicit: boolean,
    allowInternal = false,
  ): ResolvedTarget {
    const implicit = Object.keys(selector).length === 0;
    if (implicit && requireExplicit) {
      throw new ApiFault("VALIDATION_ERROR", "An explicit target selector is required", {
        selectors: ["target.tabId", "target.windowId", "target.url", "tabId", "windowId", "url"],
      });
    }
    const resolution = TabbedBrowserWindowManager.resolveRemoteTargetStrict(selector);
    let target: RemoteTarget | null = null;
    if (resolution.ok) {
      target = resolution.target;
    } else if (resolution.reason === "NO_TARGET") {
      target = TabbedBrowserWindowManager.resolveRemoteTarget({});
    } else if (resolution.reason === "AMBIGUOUS") {
      throw new ApiFault("AMBIGUOUS_TARGET", "Target selector matches more than one tab", {
        selector,
        candidates: resolution.candidates.map((candidate) => this.describeRemoteTarget(candidate)),
      });
    } else {
      const code = selector.tabId ? "TAB_NOT_FOUND" : "NOT_FOUND";
      throw new ApiFault(code, "No browser tab matches the explicit target selector", { selector });
    }
    if (!target) {
      throw new ApiFault("NOT_FOUND", "No browser tab is available", { selector });
    }
    if (implicit && target.tab.kind === "internal" && !allowInternal) {
      const external = TabbedBrowserWindowManager.getAllWindows().flatMap((window) =>
        window
          .getTabs()
          .filter((tab) => tab.kind === "external")
          .map((tab) => ({ window, tab }))
      )[0];
      if (external) target = external;
    }
    if (target.tab.kind === "internal" && !allowInternal) {
      throw new ApiFault(
        "FORBIDDEN",
        "Remote debugging is not allowed on privileged VsGo internal pages",
        { tabId: target.tab.id, windowId: target.window.hostWindow.id },
      );
    }
    const wc = target.window.getTabWebContents(target.tab.id);
    if (!wc) {
      throw new ApiFault("TARGET_CLOSED", `Tab '${target.tab.id}' is closed or its renderer was destroyed`, {
        tabId: target.tab.id,
      });
    }
    remoteBrowserDebugger.observeTab(target.tab.id, wc);
    target.window.notifyRemoteActivity(target.tab.id);
    return { ...target, wc, implicit };
  }

  private refreshTarget(target: ResolvedTarget): ResolvedTarget {
    const wc = target.window.getTabWebContents(target.tab.id);
    if (!wc) throw new ApiFault("TARGET_CLOSED", `Tab '${target.tab.id}' was closed`);
    remoteBrowserDebugger.observeTab(target.tab.id, wc);
    return { ...target, wc };
  }

  private currentWebContents(target: ResolvedTarget): WebContents {
    const wc = target.window.getTabWebContents(target.tab.id);
    if (!wc) throw new ApiFault("TARGET_CLOSED", `Tab '${target.tab.id}' was closed`);
    if (wc !== target.wc) remoteBrowserDebugger.observeTab(target.tab.id, wc);
    return wc;
  }

  private documentId(target: ResolvedTarget): string {
    const activity = remoteBrowserDebugger.getActivity(target.tab.id);
    if (!activity) {
      remoteBrowserDebugger.observeTab(target.tab.id, this.currentWebContents(target));
    }
    const refreshed = remoteBrowserDebugger.getActivity(target.tab.id);
    if (!refreshed) {
      throw new ApiFault("SERVICE_UNAVAILABLE", `Observation state is unavailable for tab '${target.tab.id}'`);
    }
    return refreshed.documentId;
  }

  private assertDocumentUnchanged(target: ResolvedTarget, expected: string): void {
    const current = this.documentId(target);
    if (current !== expected) {
      throw new ApiFault("CONFLICT", "The page document changed while the operation was running", {
        expectedDocumentId: expected,
        currentDocumentId: current,
      });
    }
  }

  private tabState(
    window: RemoteTarget["window"],
    tabId: string,
  ): Record<string, unknown> {
    const wc = window.getTabWebContents(tabId);
    if (!wc) {
      return {
        id: tabId,
        tabId,
        windowId: window.hostWindow.id,
        url: "",
        title: "",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        destroyed: true,
        windowVisible: window.isWindowVisible(),
      };
    }
    let canGoBack = false;
    let canGoForward = false;
    try {
      canGoBack = wc.navigationHistory.canGoBack();
      canGoForward = wc.navigationHistory.canGoForward();
    } catch {
      // Navigation history may be unavailable during renderer teardown.
    }
    return {
      id: tabId,
      tabId,
      windowId: window.hostWindow.id,
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack,
      canGoForward,
      destroyed: wc.isDestroyed(),
      windowVisible: window.isWindowVisible(),
    };
  }

  private describeTarget(target: ResolvedTarget): Record<string, unknown> {
    const wc = this.currentWebContents(target);
    return {
      tabId: target.tab.id,
      windowId: target.window.hostWindow.id,
      url: wc.getURL(),
      title: wc.getTitle(),
    };
  }

  private describeRemoteTarget(target: RemoteTarget): Record<string, unknown> {
    const wc = target.window.getTabWebContents(target.tab.id);
    return {
      tabId: target.tab.id,
      windowId: target.window.hostWindow.id,
      url: wc?.getURL() ?? "",
      title: wc?.getTitle() ?? "",
    };
  }

  private describeTabById(tabId: string): Record<string, unknown> {
    const window = TabbedBrowserWindowManager.findWindowByTabId(tabId);
    const tab = window?.getTabById(tabId);
    return window && tab
      ? this.describeRemoteTarget({ window, tab })
      : { tabId, windowId: null, url: "", title: "" };
  }

  private forTarget(data: unknown, target: ResolvedTarget): RemoteBrowserServiceResult {
    return {
      data,
      meta: {
        target: this.describeTarget(target),
        implicitTarget: target.implicit,
        documentId: remoteBrowserDebugger.getActivity(target.tab.id)?.documentId,
      },
    };
  }
}

export const remoteBrowserService = new RemoteBrowserService();
