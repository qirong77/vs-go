import http from "node:http";
import { vsgoLog } from "@platform/log/logger";
import {
  ApiFault,
  asApiFault,
  generateRequestId,
  serializeJsonResponse,
} from "./remote-browser-core";
import {
  remoteBrowserConfig,
} from "./remote-browser-config";
import {
  REMOTE_BROWSER_API_VERSION,
  REMOTE_BROWSER_ENDPOINT_CATALOG,
  REMOTE_BROWSER_SERVICE_NAME,
  buildRemoteBrowserEndpointDetail,
  buildRemoteBrowserLlmDocument,
  buildRemoteBrowserOpenApiDocument,
} from "./remote-browser-schema";
import { RemoteBrowserService } from "./remote-browser-service";
import { remoteBrowserDebugger } from "./remote-browser-debugger";
import { TabbedBrowserWindowManager } from "./TabbedBrowserWindowManager";

const SERVER_VERSION = "2.0.0";

interface Envelope {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
  meta: Record<string, unknown>;
}

interface ServiceResult {
  data: unknown;
  meta?: Record<string, unknown>;
}

interface Route {
  method: "GET" | "POST";
  path: string;
  operation: string;
  maxBodyBytes?: number;
}

const routes: readonly Route[] = [
  { method: "GET", path: "/browser/capabilities", operation: "capabilities" },
  { method: "GET", path: "/browser/windows", operation: "windows" },
  { method: "GET", path: "/browser/state", operation: "state" },
  { method: "POST", path: "/browser/open", operation: "open" },
  { method: "POST", path: "/browser/navigate", operation: "navigate" },
  { method: "POST", path: "/browser/switch-tab", operation: "switchTab" },
  { method: "POST", path: "/browser/close-tab", operation: "closeTab" },
  { method: "POST", path: "/browser/back", operation: "back" },
  { method: "POST", path: "/browser/forward", operation: "forward" },
  { method: "POST", path: "/browser/reload", operation: "reload" },
  { method: "POST", path: "/browser/evaluate", operation: "evaluate" },
  { method: "POST", path: "/browser/query", operation: "query" },
  { method: "POST", path: "/browser/read", operation: "read" },
  { method: "POST", path: "/browser/click", operation: "click" },
  { method: "POST", path: "/browser/hover", operation: "hover" },
  { method: "POST", path: "/browser/scroll", operation: "scroll" },
  { method: "POST", path: "/browser/drag", operation: "drag" },
  { method: "POST", path: "/browser/key", operation: "key" },
  { method: "POST", path: "/browser/type", operation: "type" },
  { method: "POST", path: "/browser/wait", operation: "wait" },
  { method: "POST", path: "/browser/screenshot", operation: "screenshot" },
  { method: "POST", path: "/browser/window/show", operation: "windowShow" },
  { method: "POST", path: "/browser/window/hide", operation: "windowHide" },
  { method: "POST", path: "/browser/window/focus", operation: "windowFocus" },
  { method: "POST", path: "/browser/devtools", operation: "devtools" },
  { method: "POST", path: "/browser/session/start", operation: "sessionStart" },
  { method: "GET", path: "/browser/session/list", operation: "sessionList" },
  { method: "GET", path: "/browser/session/get", operation: "sessionGet" },
  { method: "GET", path: "/browser/session/events", operation: "sessionEvents" },
  { method: "POST", path: "/browser/session/stop", operation: "sessionStop" },
  { method: "POST", path: "/browser/diagnostics", operation: "diagnostics" },
  { method: "POST", path: "/browser/snapshot", operation: "snapshot" },
  { method: "POST", path: "/browser/node/action", operation: "nodeAction" },
  { method: "POST", path: "/browser/source/resolve", operation: "sourceResolve" },
  { method: "GET", path: "/browser/network/body", operation: "networkBody" },
  {
    method: "POST",
    path: "/browser/batch",
    operation: "batch",
    maxBodyBytes: remoteBrowserConfig.maxBodyBytes,
  },
];

let server: http.Server | null = null;
let activeRequests = 0;
const service = new RemoteBrowserService();

function assertRouteCatalogConsistency(): void {
  const actual = new Set([
    ...routes.map((route) => `${route.method} ${route.path}`),
    "GET /",
    "GET /health",
    "GET /openapi.json",
  ]);
  const documented = new Set(
    REMOTE_BROWSER_ENDPOINT_CATALOG.map((endpoint) => `${endpoint.method} ${endpoint.path}`)
  );
  const missingImplementation = [...documented].filter((key) => !actual.has(key));
  const missingDocumentation = [...actual].filter((key) => !documented.has(key));
  if (missingImplementation.length || missingDocumentation.length) {
    throw new Error(
      `Remote browser route catalog mismatch: ${JSON.stringify({ missingImplementation, missingDocumentation })}`
    );
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function baseMeta(requestId: string, startedAt: number): Record<string, unknown> {
  return {
    apiVersion: REMOTE_BROWSER_API_VERSION,
    serverVersion: SERVER_VERSION,
    requestId,
    timestamp: timestamp(),
    durationMs: Date.now() - startedAt,
  };
}

function success(
  data: unknown,
  requestId: string,
  startedAt: number,
  meta: Record<string, unknown> = {}
): Envelope {
  return { ok: true, data, meta: { ...meta, ...baseMeta(requestId, startedAt) } };
}

function failure(fault: ApiFault, requestId: string, startedAt: number): Envelope {
  return {
    ok: false,
    error: fault.toJSON(),
    meta: baseMeta(requestId, startedAt),
  };
}

function requestOrigin(req: http.IncomingMessage): string | null {
  const value = req.headers.origin;
  return typeof value === "string" ? value : null;
}

function setSecurityHeaders(res: http.ServerResponse, origin: string | null): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (origin && remoteBrowserConfig.allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  value: unknown,
  origin: string | null,
  extraHeaders: Record<string, string> = {}
): void {
  if (res.writableEnded) return;
  let serialized;
  try {
    serialized = serializeJsonResponse(value, {
      maxBytes: remoteBrowserConfig.maxResponseBytes,
      truncate: false,
    });
  } catch (error) {
    const fault = asApiFault(error);
    status = fault.status;
    serialized = serializeJsonResponse({
      ok: false,
      error: fault.toJSON(),
      meta: { timestamp: timestamp(), apiVersion: REMOTE_BROWSER_API_VERSION },
    });
  }
  setSecurityHeaders(res, origin);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", serialized.bytes);
  for (const [name, headerValue] of Object.entries(extraHeaders)) res.setHeader(name, headerValue);
  res.writeHead(status);
  res.end(serialized.body);
}

function isLoopback(remoteAddress: string | undefined): boolean {
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

function validateTransport(req: http.IncomingMessage): void {
  if (!isLoopback(req.socket.remoteAddress)) {
    throw new ApiFault("FORBIDDEN", "Remote browser API only accepts loopback clients");
  }
  const host = req.headers.host?.toLowerCase();
  const allowedHosts = new Set([
    `${remoteBrowserConfig.host}:${remoteBrowserConfig.port}`,
    `localhost:${remoteBrowserConfig.port}`,
  ]);
  if (!host || !allowedHosts.has(host)) {
    throw new ApiFault("FORBIDDEN", "Host header is not allowed", { host });
  }
  const origin = requestOrigin(req);
  if (origin && !remoteBrowserConfig.allowedOrigins.has(origin)) {
    throw new ApiFault("FORBIDDEN", "Browser origin is not allowed", { origin });
  }
  if (req.headers["sec-fetch-site"] === "cross-site" && !origin) {
    throw new ApiFault("FORBIDDEN", "Cross-site browser requests are not allowed");
  }
}

function parseQuery(url: URL): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    const convert = (value: string): string | number | boolean => {
      if (value === "true") return true;
      if (value === "false") return false;
      if (/^-?(?:0|[1-9]\d*)$/.test(value)) {
        const numeric = Number(value);
        if (Number.isSafeInteger(numeric)) return numeric;
      }
      return value;
    };
    result[key] = values.length === 1 ? convert(values[0]) : values.map(convert);
  }
  return result;
}

async function readJsonBody(req: http.IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiFault("BODY_TOO_LARGE", `Request body exceeds ${maxBytes} bytes`);
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) {
      tooLarge = true;
      continue;
    }
    chunks.push(buffer);
  }
  if (tooLarge) throw new ApiFault("BODY_TOO_LARGE", `Request body exceeds ${maxBytes} bytes`);
  if (bytes === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw new ApiFault("INVALID_JSON", "Request body is not valid JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiFault("VALIDATION_ERROR", "Request JSON must be an object");
  }
  return parsed as Record<string, unknown>;
}

function routeFor(method: string, path: string): Route | undefined {
  return routes.find((route) => route.method === method && route.path === path);
}

function allowedMethods(path: string): string[] {
  return routes.filter((route) => route.path === path).map((route) => route.method);
}

function openApiDocument(): unknown {
  return buildRemoteBrowserOpenApiDocument({
    serverUrl: `http://${remoteBrowserConfig.host}:${remoteBrowserConfig.port}`,
    description: "Local browser control, observation, diagnostics and source mapping.",
  });
}

async function executeWithDeadline(
  route: Route,
  input: Record<string, unknown>,
  signal: AbortSignal
): Promise<ServiceResult> {
  const timeoutValue = input.timeoutMs ?? input.timeout;
  const requestedTimeout =
    typeof timeoutValue === "number" && Number.isSafeInteger(timeoutValue)
      ? Math.min(Math.max(timeoutValue + 1_000, 1_000), 120_000)
      : remoteBrowserConfig.defaultRequestTimeoutMs;
  const deadlineController = new AbortController();
  const onAbort = (): void => deadlineController.abort(signal.reason);
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return await new Promise<ServiceResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      deadlineController.abort(new Error(`Request exceeded ${requestedTimeout}ms`));
      reject(new ApiFault("TIMEOUT", `Request exceeded ${requestedTimeout}ms`));
    }, requestedTimeout);
    service.execute(route.operation, input, deadlineController.signal).then(
      (result) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const requestId = generateRequestId();
  const startedAt = Date.now();
  const origin = requestOrigin(req);
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = req.method ?? "GET";
  const controller = new AbortController();
  req.once("aborted", () => controller.abort(new Error("client disconnected")));

  try {
    validateTransport(req);

    if (method === "OPTIONS") {
      const methods = allowedMethods(url.pathname);
      if (!origin || !remoteBrowserConfig.allowedOrigins.has(origin) || methods.length === 0) {
        throw new ApiFault("FORBIDDEN", "CORS preflight is not allowed");
      }
      setSecurityHeaders(res, origin);
      res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
      res.setHeader("Access-Control-Max-Age", "600");
      res.writeHead(204);
      res.end();
      return;
    }

    if (method === "GET" && url.pathname === "/health") {
      sendJson(
        res,
        200,
        success(
          {
            status: "healthy",
            windows: TabbedBrowserWindowManager.getAllWindows().length,
            activeSessions: remoteBrowserDebugger
              .listSessions()
              .filter((session) => session.status === "active").length,
          },
          requestId,
          startedAt
        ),
        origin
      );
      return;
    }
    if (method === "GET" && url.pathname === "/") {
      sendJson(
        res,
        200,
        success(
          {
            name: REMOTE_BROWSER_SERVICE_NAME,
            version: SERVER_VERSION,
            description: "Local browser automation and diagnostics service.",
            docs: "GET /api/llm",
            health: "/health",
            capabilities: "GET /browser/capabilities",
          },
          requestId,
          startedAt
        ),
        origin
      );
      return;
    }
    if (method === "GET" && url.pathname === "/api/llm") {
      sendJson(
        res,
        200,
        success(
          buildRemoteBrowserLlmDocument(
            `http://${remoteBrowserConfig.host}:${remoteBrowserConfig.port}`
          ),
          requestId,
          startedAt
        ),
        origin
      );
      return;
    }
    if (method === "GET" && url.pathname === "/api/endpoint") {
      const operationId = url.searchParams.get("operationId") ?? "";
      const detail = buildRemoteBrowserEndpointDetail(operationId);
      if (!detail) {
        throw new ApiFault("NOT_FOUND", `Unknown operationId: ${operationId}`);
      }
      sendJson(res, 200, success(detail, requestId, startedAt), origin);
      return;
    }
    if (method === "GET" && url.pathname === "/openapi.json") {
      sendJson(res, 200, openApiDocument(), origin);
      return;
    }

    const route = routeFor(method, url.pathname);
    if (!route) {
      const allow = allowedMethods(url.pathname);
      if (allow.length > 0) {
        throw new ApiFault("METHOD_NOT_ALLOWED", `Method ${method} is not allowed for ${url.pathname}`, {
          allowed: allow,
        });
      }
      throw new ApiFault("NOT_FOUND", `Unknown route: ${method} ${url.pathname}`);
    }
    if (activeRequests >= remoteBrowserConfig.maxConcurrentRequests) {
      throw new ApiFault("RATE_LIMITED", "Too many concurrent remote browser requests");
    }
    activeRequests += 1;
    try {
      let input = parseQuery(url);
      if (method === "POST") {
        const contentType = req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
        if (contentType !== "application/json") {
          throw new ApiFault("VALIDATION_ERROR", "Content-Type must be application/json", undefined, 415);
        }
        const body = await readJsonBody(req, route.maxBodyBytes ?? remoteBrowserConfig.maxBodyBytes);
        input = { ...input, ...body };
      }
      const result = await executeWithDeadline(route, input, controller.signal);
      sendJson(res, 200, success(result.data, requestId, startedAt, result.meta), origin);
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
    }
  } catch (error) {
    const fault = asApiFault(error);
    const headers: Record<string, string> = {};
    if (fault.code === "METHOD_NOT_ALLOWED") {
      const allow = allowedMethods(url.pathname);
      if (allow.length) headers.Allow = allow.join(", ");
    }
    sendJson(res, fault.status, failure(fault, requestId, startedAt), origin, headers);
    if (fault.status >= 500) {
      vsgoLog("RemoteBrowser", "request failed", {
        level: "error",
        detail: { requestId, method, path: url.pathname, code: fault.code, message: fault.message },
      });
    }
  }
}

export function startRemoteBrowserServer(): void {
  if (server) return;
  assertRouteCatalogConsistency();
  server = http.createServer((req, res) => {
    void handleRequest(req, res).catch((error) => {
      const requestId = generateRequestId();
      sendJson(
        res,
        500,
        failure(asApiFault(error), requestId, Date.now()),
        requestOrigin(req)
      );
    });
  });
  server.requestTimeout = 125_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  server.listen(remoteBrowserConfig.port, remoteBrowserConfig.host, () => {
    vsgoLog("RemoteBrowser", `已启动 http://${remoteBrowserConfig.host}:${remoteBrowserConfig.port}`, {
      detail: {
        apiLlm: "/api/llm",
        authenticationRequired: false,
      },
    });
  });
  server.on("error", (error) => {
    vsgoLog("RemoteBrowser", "启动失败", {
      level: "error",
      detail: { error: String(error) },
    });
  });
}

export async function stopRemoteBrowserServer(): Promise<void> {
  const current = server;
  server = null;
  if (!current) return;
  await new Promise<void>((resolve) => current.close(() => resolve()));
}

export function getRemoteBrowserStatus(): {
  port: number;
  running: boolean;
  authenticationRequired: boolean;
} {
  return {
    port: remoteBrowserConfig.port,
    running: server?.listening === true,
    authenticationRequired: false,
  };
}

export function getRemoteBrowserOpenApiDocument(): unknown {
  return openApiDocument();
}
