/**
 * Machine-readable contract for the local remote-browser HTTP API.
 *
 * This module deliberately has no Electron or server imports.  The server, the
 * documentation window and tests can therefore share the same route catalog
 * without pulling Electron into their dependency graph.
 */

export const REMOTE_BROWSER_API_VERSION = "2.0.0";
export const REMOTE_BROWSER_SERVICE_NAME = "vsgo-remote-browser-server";

export type JsonSchema = boolean | { readonly [key: string]: unknown };
export type RemoteBrowserHttpMethod = "GET" | "POST";

export interface EndpointExample {
  readonly request: unknown;
  readonly response: unknown;
}

export interface EndpointSchemas {
  readonly body: JsonSchema | null;
  readonly query: JsonSchema | null;
  readonly response: JsonSchema;
}

export interface RemoteBrowserEndpoint {
  readonly operationId: string;
  readonly method: RemoteBrowserHttpMethod;
  readonly path: string;
  readonly description: string;
  /** True only when the endpoint cannot mutate page, window or capture state. */
  readonly readOnly: boolean;
  /** JSON Schema 2020-12 / OpenAPI 3.1 schema, or null when absent. */
  readonly body: JsonSchema | null;
  /** Object schema whose properties are URL query parameters. */
  readonly query: JsonSchema | null;
  readonly response: JsonSchema;
  readonly example: EndpointExample;
  /** Convenient grouped aliases for generic validators and route dispatchers. */
  readonly schema: EndpointSchemas;
}

export interface RemoteBrowserApiDocEndpoint {
  readonly operationId: string;
  readonly method: RemoteBrowserHttpMethod;
  readonly path: string;
  readonly description: string;
  readonly readOnly: boolean;
  readonly body: JsonSchema | null;
  readonly query: JsonSchema | null;
  readonly response: JsonSchema;
  readonly example_request: unknown;
  readonly example_response: unknown;
}

export interface OpenApiBuildOptions {
  readonly serverUrl?: string;
  readonly title?: string;
  readonly description?: string;
}

const ISO_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const EXAMPLE_TIMESTAMP_MS = 1767225600000;
const EXAMPLE_META = {
  timestamp: ISO_TIMESTAMP,
  requestId: "req_6fbe36e5-7582-468a-96ea-77aa7489c847",
  apiVersion: REMOTE_BROWSER_API_VERSION,
  durationMs: 4,
};

const stringSchema = (description?: string, extra: Record<string, unknown> = {}): JsonSchema => ({
  type: "string",
  ...(description ? { description } : {}),
  ...extra,
});

const integerSchema = (
  description?: string,
  minimum?: number,
  maximum?: number,
  defaultValue?: number
): JsonSchema => ({
  type: "integer",
  ...(description ? { description } : {}),
  ...(minimum !== undefined ? { minimum } : {}),
  ...(maximum !== undefined ? { maximum } : {}),
  ...(defaultValue !== undefined ? { default: defaultValue } : {}),
});

const booleanSchema = (description?: string, defaultValue?: boolean): JsonSchema => ({
  type: "boolean",
  ...(description ? { description } : {}),
  ...(defaultValue !== undefined ? { default: defaultValue } : {}),
});

const enumSchema = (values: readonly string[], description?: string): JsonSchema => ({
  type: "string",
  enum: values,
  ...(description ? { description } : {}),
});

/**
 * `focus` 参数在所有输入类端点上的统一语义：聚焦目标页面本身。
 * 注意：它不会把「远程浏览器控制」窗口弹到前台或抢系统焦点——该窗口的显隐
 * 只由用户在托盘菜单里控制，这样 LLM 操作不会干扰用户。
 */
const FOCUS_PARAMETER_DESCRIPTION =
  "Focus the target page before the action. Never raises, shows or refocuses the VSGo window: remote-control window visibility is controlled by the user from the tray menu.";

const focusSchema = (description: string = FOCUS_PARAMETER_DESCRIPTION): JsonSchema =>
  booleanSchema(description, false);

const arraySchema = (items: JsonSchema, description?: string, extra: Record<string, unknown> = {}): JsonSchema => ({
  type: "array",
  items,
  ...(description ? { description } : {}),
  ...extra,
});

const objectSchema = (
  properties: Readonly<Record<string, JsonSchema>>,
  required: readonly string[] = [],
  description?: string,
  extra: Record<string, unknown> = {}
): JsonSchema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
  ...(description ? { description } : {}),
  ...extra,
});

const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });

export const REMOTE_BROWSER_META_SCHEMA: JsonSchema = objectSchema(
  {
    timestamp: stringSchema("UTC timestamp at which the response was created.", { format: "date-time" }),
    requestId: stringSchema("Correlation identifier assigned to this HTTP request.", {
      pattern: "^req_[A-Za-z0-9-]+$",
    }),
    apiVersion: stringSchema("Remote browser API contract version.", {
      const: REMOTE_BROWSER_API_VERSION,
    }),
    durationMs: integerSchema("Server processing duration in milliseconds.", 0),
    warnings: arraySchema(stringSchema(), "Non-fatal validation or truncation warnings."),
  },
  ["timestamp", "requestId", "apiVersion", "durationMs"],
  "Metadata present on every response.",
  { additionalProperties: true }
);

export const REMOTE_BROWSER_ERROR_SCHEMA: JsonSchema = objectSchema(
  {
    code: enumSchema(
      [
        "VALIDATION_ERROR",
        "INVALID_JSON",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "NO_TAB",
        "NO_WINDOW",
        "TAB_NOT_FOUND",
        "TAB_DESTROYED",
        "TARGET_CLOSED",
        "AMBIGUOUS_TARGET",
        "STALE_NODE_REF",
        "CURSOR_EXPIRED",
        "METHOD_NOT_ALLOWED",
        "TIMEOUT",
        "CONFLICT",
        "BODY_TOO_LARGE",
        "RESPONSE_TOO_LARGE",
        "RATE_LIMITED",
        "DEPENDENCY_FAILED",
        "ELEMENT_NOT_FOUND",
        "EVALUATE_ERROR",
        "CAPTURE_ERROR",
        "CLICK_ERROR",
        "HOVER_ERROR",
        "QUERY_ERROR",
        "READ_ERROR",
        "SESSION_NOT_FOUND",
        "REQUEST_NOT_FOUND",
        "SOURCE_MAP_NOT_FOUND",
        "INTERNAL_ERROR",
        "NOT_IMPLEMENTED",
        "BAD_GATEWAY",
        "SERVICE_UNAVAILABLE",
      ],
      "Stable, machine-readable failure code."
    ),
    message: stringSchema("Human-readable failure summary."),
    details: true,
  },
  ["code", "message"],
  "Structured API error."
);

export const REMOTE_BROWSER_ENVELOPE_SCHEMA: JsonSchema = {
  oneOf: [
    objectSchema(
      { ok: { const: true }, data: true, meta: REMOTE_BROWSER_META_SCHEMA },
      ["ok", "data", "meta"],
      "Successful response envelope."
    ),
    objectSchema(
      { ok: { const: false }, error: REMOTE_BROWSER_ERROR_SCHEMA, meta: REMOTE_BROWSER_META_SCHEMA },
      ["ok", "error", "meta"],
      "Failed response envelope."
    ),
  ],
};

const successEnvelopeSchema = (data: JsonSchema): JsonSchema => ({
  oneOf: [
    objectSchema({ ok: { const: true }, data, meta: REMOTE_BROWSER_META_SCHEMA }, ["ok", "data", "meta"]),
    objectSchema(
      { ok: { const: false }, error: REMOTE_BROWSER_ERROR_SCHEMA, meta: REMOTE_BROWSER_META_SCHEMA },
      ["ok", "error", "meta"]
    ),
  ],
});

const successExample = (data: unknown): unknown => ({ ok: true, data, meta: EXAMPLE_META });

export const TARGET_SELECTOR_SCHEMA: JsonSchema = objectSchema(
  {
    tabId: stringSchema("Exact VsGo tab identifier.", { minLength: 1 }),
    windowId: integerSchema("Exact Electron host window identifier.", 1),
    url: stringSchema(
      "Canonical page URL selector. Hash and a trailing slash are ignored during matching; query is retained.",
      { minLength: 1 }
    ),
  },
  [],
  "Strict browser target selector. Multiple supplied fields must resolve to the same tab.",
  { minProperties: 1 }
);

const TARGET_PROPERTIES: Readonly<Record<string, JsonSchema>> = {
  target: TARGET_SELECTOR_SCHEMA,
  tabId: stringSchema("Compatibility alias for target.tabId.", { minLength: 1 }),
  windowId: integerSchema("Compatibility alias for target.windowId.", 1),
  url: stringSchema("Compatibility alias for target.url.", { minLength: 1 }),
};

const targetBody = (
  properties: Readonly<Record<string, JsonSchema>> = {},
  required: readonly string[] = [],
  description?: string,
  options: { topLevelUrl?: boolean; extra?: Record<string, unknown> } = {}
): JsonSchema => {
  const targetProperties =
    options.topLevelUrl === false
      ? {
          target: TARGET_PROPERTIES.target,
          tabId: TARGET_PROPERTIES.tabId,
          windowId: TARGET_PROPERTIES.windowId,
        }
      : TARGET_PROPERTIES;
  return objectSchema(
    { ...targetProperties, ...properties },
    required,
    description ??
      "The target may be supplied as target.{tabId,windowId,url} or with compatibility top-level fields. Conflicting aliases are rejected.",
    options.extra
  );
};

const targetQuery = (properties: Readonly<Record<string, JsonSchema>> = {}, required: readonly string[] = []): JsonSchema =>
  objectSchema(
    {
      tabId: stringSchema("Exact target tab id."),
      windowId: integerSchema("Exact target host window id.", 1),
      url: stringSchema("Target URL match."),
      ...properties,
    },
    required,
    "GET endpoints use top-level target selector query parameters."
  );

const rectSchema = objectSchema(
  {
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number", minimum: 0 },
    height: { type: "number", minimum: 0 },
  },
  ["x", "y", "width", "height"]
);

const tabSchema = objectSchema(
  {
    id: stringSchema(),
    url: stringSchema(),
    title: stringSchema(),
    loading: booleanSchema(),
    canGoBack: booleanSchema(),
    canGoForward: booleanSchema(),
  },
  ["id", "url", "title", "loading", "canGoBack", "canGoForward"]
);

const targetResultSchema = objectSchema(
  {
    tabId: stringSchema(),
    windowId: integerSchema(undefined, 1),
    url: stringSchema(),
    title: stringSchema(),
  },
  ["tabId", "windowId", "url"]
);

const genericObjectSchema: JsonSchema = { type: "object", additionalProperties: true };

const locatorProperties: Readonly<Record<string, JsonSchema>> = {
  selector: stringSchema("CSS selector for the element.", { minLength: 1 }),
  nodeRef: stringSchema("Opaque node reference returned by /browser/snapshot.", {
    pattern: "^node_[A-Za-z0-9._:-]+$",
  }),
};

const locatorConstraint: Record<string, unknown> = {
  anyOf: [{ required: ["selector"] }, { required: ["nodeRef"] }],
};

const eventCategorySchema = enumSchema([
  "console",
  "runtime",
  "network",
  "navigation",
  "page",
  "log",
  "crashes",
]);

export const REMOTE_BROWSER_EVENT_SCHEMA: JsonSchema = objectSchema(
  {
    seq: integerSchema("Monotonic sequence number within the session.", 1),
    eventId: stringSchema("Opaque event cursor."),
    tabId: stringSchema(),
    documentId: stringSchema("Document generation active when the event was recorded."),
    timestamp: integerSchema("Unix timestamp in milliseconds.", 0),
    source: enumSchema(["webContents", "debugger", "system"]),
    type: stringSchema("Electron event, CDP method or normalized system event name."),
    payload: true,
  },
  ["seq", "eventId", "tabId", "documentId", "timestamp", "source", "type", "payload"],
  "A bounded, JSON-safe browser debug event."
);

const sessionSchema = objectSchema(
  {
    sessionId: stringSchema(undefined, { pattern: "^session_[A-Za-z0-9-]+$" }),
    tabId: stringSchema(),
    target: targetResultSchema,
    categories: arraySchema(eventCategorySchema, undefined, { uniqueItems: true }),
    capture: { type: "object", additionalProperties: true },
    status: enumSchema(["active", "stopped"]),
    startedAt: integerSchema("Unix timestamp in milliseconds.", 0),
    stoppedAt: nullable(integerSchema("Unix timestamp in milliseconds.", 0)),
    active: booleanSchema(),
    cursor: integerSchema("Newest event sequence currently available.", 0),
    oldestCursor: integerSchema("Oldest retained event sequence.", 0),
    eventCount: integerSchema(undefined, 0),
    droppedEventCount: integerSchema(undefined, 0),
    captureResponseBodies: booleanSchema(),
    maxBodyBytes: integerSchema(undefined, 1),
    debuggerAttached: booleanSchema(),
    documentId: stringSchema(),
  },
  [
    "sessionId",
    "target",
    "categories",
    "startedAt",
    "active",
    "cursor",
    "oldestCursor",
    "eventCount",
    "droppedEventCount",
    "captureResponseBodies",
  ]
);

const snapshotNodeSchema: JsonSchema = {
  type: "object",
  properties: {
    nodeRef: stringSchema("Opaque reference valid for the current document generation."),
    parentNodeRef: nullable(stringSchema()),
    role: stringSchema(),
    name: stringSchema(
      "Accessible name. Containers that merely aggregate child text have no name, so the text is not repeated at every level."
    ),
    tag: stringSchema(),
    text: stringSchema(
      "Own text; omitted for elements with element children that are neither interactive nor role-carrying. Use POST /browser/read to extract the text of a whole region."
    ),
    value: true,
    id: stringSchema(),
    testId: stringSchema(),
    type: stringSchema(),
    href: stringSchema(),
    framePath: stringSchema(),
    shadow: booleanSchema(),
    visible: booleanSchema(),
    inViewport: booleanSchema("Whether the node intersects the current viewport."),
    interactive: booleanSchema(
      "Whether the node can be activated or edited. True for control roles and for elements that only look like controls (a pointer cursor or an inline click handler); the text rendering marks those with 'clickable'."
    ),
    options: arraySchema(
      objectSchema(
        {
          value: stringSchema("Value accepted by node/action setValue."),
          text: stringSchema("Visible label."),
        },
        [],
        "One entry of a select's option list."
      ),
      "Options a select offers. Omitted when the options are themselves listed as nodes; at most 20 entries, optionCount gives the real size."
    ),
    optionCount: integerSchema(undefined, 0),
    disabled: booleanSchema(),
    checked: booleanSchema(),
    selected: booleanSchema(),
    expanded: booleanSchema(),
    attributes: { type: "object", additionalProperties: { anyOf: [{ type: "string" }, { type: "null" }] } },
    rect: rectSchema,
    depth: integerSchema(undefined, 0),
  },
  required: ["nodeRef", "depth", "tag", "visible", "interactive"],
  additionalProperties: true,
};

const snapshotResultSchema = objectSchema(
  {
    documentId: stringSchema("Changes after a top-level document navigation."),
    target: targetResultSchema,
    mode: enumSchema(["accessibility", "dom", "interactive"]),
    output: enumSchema(["json", "text"]),
    format: enumSchema(["accessibility", "dom"]),
    url: stringSchema(),
    title: stringSchema(),
    rootRef: nullable(stringSchema()),
    nodeRefFormat: stringSchema("How to spell a nodeRef passed back to the API, for example doc_7c0b:n7."),
    text: stringSchema("Compact indentation-based rendering, present when output is 'text'."),
    nodes: arraySchema(snapshotNodeSchema),
    nodeCount: integerSchema(undefined, 0),
    count: integerSchema(undefined, 0),
    interactiveCount: integerSchema(undefined, 0),
    offscreenCount: integerSchema(undefined, 0),
    viewportOnly: booleanSchema(),
    viewport: objectSchema(
      {
        width: integerSchema(undefined, 0),
        height: integerSchema(undefined, 0),
        scrollX: integerSchema(),
        scrollY: integerSchema(),
      },
      ["width", "height"]
    ),
    visited: integerSchema(undefined, 0),
    truncated: booleanSchema(),
    staleRefs: integerSchema(
      "Number of nodeRef entries dropped because their element had left the document.",
      0
    ),
  },
  ["documentId", "target", "mode", "format", "url", "title", "rootRef", "nodeCount", "count", "visited", "truncated"]
);

function endpoint(
  input: Omit<RemoteBrowserEndpoint, "schema"> & { readonly schema?: never }
): RemoteBrowserEndpoint {
  const { body, query, response } = input;
  return { ...input, schema: { body, query, response } };
}

const basicActionResultSchema = objectSchema(
  {
    action: stringSchema(),
    target: targetResultSchema,
  },
  ["action", "target"]
);

/**
 * Input and navigation actions share one verification contract: after the action is
 * dispatched the page is given a bounded chance to settle, and the console errors and
 * failed requests produced by the action are returned inline. That removes the extra
 * wait + session/events round trip agents otherwise need after every interaction.
 */
const verificationProperties: Readonly<Record<string, JsonSchema>> = {
  settle: booleanSchema("Wait for the page to settle before returning (default true).", true),
  settleTimeoutMs: integerSchema("Upper bound for settling in milliseconds.", 0, 10_000, 800),
  observe: booleanSchema("Report console errors and failed requests produced by this action (default true).", true),
  maxIssues: integerSchema("Maximum number of reported issues.", 1, 50, 5),
};

const verificationResultProperties: Readonly<Record<string, JsonSchema>> = {
  settled: booleanSchema("True when the page reached a quiet state inside the settle budget."),
  settleWaitedMs: integerSchema(undefined, 0),
  settleMutations: integerSchema(
    "DOM mutations observed while settling; a large number means the page was still moving.",
    0
  ),
  navigated: booleanSchema("True when this action replaced the document of the target tab."),
  issueCount: integerSchema("Number of console errors and failed requests produced by this action.", 0),
  issues: arraySchema(
    objectSchema(
      {
        seq: integerSchema(undefined, 0),
        type: stringSchema(),
        level: stringSchema(),
        message: stringSchema(),
        url: stringSchema(),
        line: integerSchema(),
        status: integerSchema(),
      },
      ["seq", "type", "level"]
    ),
    "Newest problems first, truncated to maxIssues."
  ),
};

/**
 * `/browser/window/show|hide|focus` 的统一响应。
 * `suppressed` 为 true 表示请求被接受但未下发到窗口——「远程浏览器控制」窗口的显隐
 * 只由用户通过托盘菜单控制，API 不会把它弹出/隐藏，以免操作过程中干扰用户。
 */
const windowVisibilitySchema = (action: "show" | "hide" | "focus"): JsonSchema =>
  objectSchema(
    {
      windowId: integerSchema(undefined, 1),
      visible: booleanSchema("Whether the window is actually visible right now."),
      focused: booleanSchema("Whether the window currently holds OS focus."),
      action: enumSchema([action], "The requested visibility action, echoed back."),
      suppressed: booleanSchema(
        "True when the request was not applied because remote-control window visibility is user-controlled.",
      ),
      visibilityControl: enumSchema(
        ["api", "user"],
        "Who controls this window's visibility: 'api' for normal windows, 'user' for remote-browser-control windows.",
      ),
    },
    ["windowId", "visible", "action", "suppressed", "visibilityControl"],
  );

/**
 * Authoritative route catalog.  Documentation projections and OpenAPI paths
 * below are generated from this array; do not maintain a second endpoint list.
 */
export const REMOTE_BROWSER_ENDPOINT_CATALOG: readonly RemoteBrowserEndpoint[] = [
  endpoint({
    operationId: "getServiceRoot",
    method: "GET",
    path: "/",
    description: "Return service identity and discovery links.",
    readOnly: true,
    body: null,
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          name: stringSchema(),
          version: stringSchema(),
          description: stringSchema(),
          docs: stringSchema(),
          health: stringSchema(),
          capabilities: stringSchema(),
        },
        ["name", "version", "description", "docs", "health", "capabilities"]
      )
    ),
    example: {
      request: {},
      response: successExample({
        name: REMOTE_BROWSER_SERVICE_NAME,
        version: REMOTE_BROWSER_API_VERSION,
        description: "Local browser automation and diagnostics service.",
        docs: "GET /api/llm",
        health: "GET /health",
        capabilities: "GET /browser/capabilities",
      }),
    },
  }),
  endpoint({
    operationId: "getHealth",
    method: "GET",
    path: "/health",
    description: "Return liveness and browser-window count without exposing tab contents.",
    readOnly: true,
    body: null,
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          status: enumSchema(["healthy"]),
          windows: integerSchema(undefined, 0),
          activeSessions: integerSchema(undefined, 0),
        },
        ["status", "windows", "activeSessions"]
      )
    ),
    example: { request: {}, response: successExample({ status: "healthy", windows: 1, activeSessions: 1 }) },
  }),
  endpoint({
    operationId: "getOpenApiDocument",
    method: "GET",
    path: "/openapi.json",
    description: "Return the raw OpenAPI 3.1 document generated from this route catalog.",
    readOnly: true,
    body: null,
    query: null,
    response: genericObjectSchema,
    example: {
      request: {},
      response: { openapi: "3.1.0", info: { title: "VsGo Remote Browser API", version: REMOTE_BROWSER_API_VERSION }, paths: {} },
    },
  }),
  endpoint({
    operationId: "listBrowserWindows",
    method: "GET",
    path: "/browser/windows",
    description: "List browser windows and their tabs, including loading and navigation state.",
    readOnly: true,
    body: null,
    query: null,
    response: successEnvelopeSchema(
      arraySchema(
        objectSchema(
          {
            windowId: integerSchema(undefined, 1),
            title: stringSchema(),
            visible: booleanSchema(),
            focused: booleanSchema(),
            activeTabId: nullable(stringSchema()),
            tabs: arraySchema(tabSchema),
          },
          ["windowId", "title", "visible", "focused", "activeTabId", "tabs"]
        )
      )
    ),
    example: {
      request: {},
      response: successExample([
        {
          windowId: 3,
          title: "VsGo Browser",
          visible: true,
          focused: false,
          activeTabId: "tab_01",
          tabs: [
            {
              id: "tab_01",
              url: "https://example.com/",
              title: "Example Domain",
              loading: false,
              canGoBack: false,
              canGoForward: false,
            },
          ],
        },
      ]),
    },
  }),
  endpoint({
    operationId: "getBrowserState",
    method: "GET",
    path: "/browser/state",
    description: "Read the strictly resolved tab's current URL, title, loading and navigation state.",
    readOnly: true,
    body: null,
    query: targetQuery(),
    response: successEnvelopeSchema(
      objectSchema(
        {
          tabId: stringSchema(),
          windowId: integerSchema(undefined, 1),
          url: stringSchema(),
          title: stringSchema(),
          loading: booleanSchema(),
          canGoBack: booleanSchema(),
          canGoForward: booleanSchema(),
          windowVisible: booleanSchema(),
        },
        ["tabId", "windowId", "url", "title", "loading", "canGoBack", "canGoForward", "windowVisible"]
      )
    ),
    example: {
      request: { query: { tabId: "tab_01" } },
      response: successExample({
        tabId: "tab_01",
        windowId: 3,
        url: "https://example.com/",
        title: "Example Domain",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        windowVisible: true,
      }),
    },
  }),
  endpoint({
    operationId: "openBrowserUrl",
    method: "POST",
    path: "/browser/open",
    description:
      "Open a safe absolute URL in a dedicated remote-browser-control window. Windows are isolated by clientId: each clientId gets its own window (reused on subsequent opens with the same clientId), so different callers never navigate over each other. Omit clientId to share the default window (legacy single-instance behavior). The window is always created and driven in the background: it is only shown or hidden by the user from the tray menu, never by an API call. It is never a tab shared with the normal tabbed browser.",
    readOnly: false,
    body: objectSchema(
      {
        url: stringSchema("Destination URL. Only http, https and about:blank are accepted.", {
          format: "uri",
        }),
        focus: focusSchema(
          "Focus the opened page after loading. The window itself is never shown or focused by the API; remote-control window visibility is controlled by the user from the tray menu."
        ),
        clientId: stringSchema("Isolation key for the remote-control window. Callers that pass the same clientId share one window; different clientIds get separate windows.", {
          maxLength: 64,
        }),
        timeout: integerSchema("Open/load timeout in milliseconds.", 100, 120000, 30000),
      },
      ["url"]
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        { windowId: integerSchema(undefined, 1), tabId: stringSchema(), url: stringSchema() },
        ["windowId", "tabId", "url"]
      )
    ),
    example: {
      request: { url: "https://example.com/", focus: false },
      response: successExample({ windowId: 3, tabId: "tab_01", url: "https://example.com/" }),
    },
  }),
  endpoint({
    operationId: "navigateBrowserTab",
    method: "POST",
    path: "/browser/navigate",
    description:
      "Navigate a target tab to a safe absolute URL. Top-level url is the destination; use target.url when selecting the tab by its current URL.",
    readOnly: false,
    body: targetBody(
      {
        url: stringSchema("Destination URL.", { format: "uri" }),
        waitUntil: enumSchema(["none", "domcontentloaded", "load"], "Optional navigation completion point."),
        timeout: integerSchema("Navigation wait timeout in milliseconds.", 100, 120000, 30000),
        ...verificationProperties,
      },
      ["url"],
      "Target may be nested or use top-level tabId/windowId. Because top-level url is the destination, select by current URL with target.url.",
      { topLevelUrl: false }
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          target: targetResultSchema,
          url: stringSchema(),
          waitUntil: enumSchema(["none", "domcontentloaded", "load"]),
          waitedMs: integerSchema(undefined, 0),
          ...verificationResultProperties,
        },
        ["target", "url", "waitUntil", "waitedMs"]
      )
    ),
    example: {
      request: {
        target: { tabId: "tab_01" },
        url: "https://example.com/docs",
        waitUntil: "load",
        timeout: 30000,
      },
      response: successExample({
        target: { tabId: "tab_01", windowId: 3, url: "https://example.com/docs", title: "Docs" },
        url: "https://example.com/docs",
        waitUntil: "load",
        waitedMs: 417,
      }),
    },
  }),
  endpoint({
    operationId: "evaluateInBrowserTab",
    method: "POST",
    path: "/browser/evaluate",
    description:
      "Evaluate JavaScript in the target page and return a typed JSON-safe result. JavaScript exceptions return HTTP 422 EVALUATE_ERROR with CDP exception details.",
    readOnly: false,
    body: targetBody(
      {
        script: stringSchema("JavaScript expression or program.", { minLength: 1, maxLength: 1_000_000 }),
        expression: stringSchema("Alias for script; conflicting values are rejected.", { minLength: 1, maxLength: 1_000_000 }),
        awaitPromise: booleanSchema("Await a returned Promise.", true),
        userGesture: booleanSchema("Execute with user-gesture privileges.", false),
        timeout: integerSchema("Evaluation timeout in milliseconds.", 50, 120000, 30000),
        world: enumSchema(["main", "isolated"], "Execution world; main is required to mutate application globals."),
      },
      [],
      "Exactly one of script or expression is required.",
      { extra: { anyOf: [{ required: ["script"] }, { required: ["expression"] }] } }
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          value: true,
          type: stringSchema("JavaScript typeof / remote-object type."),
          subtype: nullable(stringSchema("Optional structured subtype such as array, date or node.")),
          description: nullable(stringSchema()),
          unserializableValue: nullable(stringSchema("CDP marker for top-level NaN, Infinity, -0 or BigInt.")),
          preview: true,
          exceptionDetails: { type: "null" },
          fallback: stringSchema("Fallback evaluator used when CDP cannot return a value by value."),
          url: stringSchema(),
        },
        ["value", "type", "subtype", "unserializableValue", "preview", "exceptionDetails", "url"]
      )
    ),
    example: {
      request: { target: { tabId: "tab_01" }, script: "({ title: document.title, links: document.links.length })" },
      response: successExample({
        value: { title: "Example Domain", links: 1 },
        type: "object",
        subtype: null,
        unserializableValue: null,
        preview: null,
        exceptionDetails: null,
        url: "https://example.com/",
      }),
    },
  }),
  endpoint({
    operationId: "clickBrowserElement",
    method: "POST",
    path: "/browser/click",
    description:
      "Click an element located by CSS selector or snapshot nodeRef. Default mode 'auto' uses synthesized mouse input when the element is hit-testable at its center and falls back to a DOM click otherwise.",
    readOnly: false,
    body: targetBody(
      {
        ...locatorProperties,
        mode: enumSchema(
          ["auto", "js", "mouse"],
          "'js' (default) dispatches element.click() and always reaches the page. 'auto' probes elementFromPoint, sends real mouse input when the element is on top, verifies that the page received it, and otherwise falls back to element.click(); use it when the page needs trusted events. 'mouse' always sends move/down/up and only reports whether the page received it.",
        ),
        button: enumSchema(["left", "middle", "right"]),
        clickCount: integerSchema(undefined, 1, 3, 1),
        focus: focusSchema(),
        ...verificationProperties,
      },
      [],
      undefined,
      { extra: locatorConstraint }
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          mode: enumSchema(["auto", "js", "mouse"]),
          modeUsed: enumSchema(["js", "mouse"], "Which delivery path was actually used."),
          mouseAttempted: booleanSchema(
            "True when real mouse input was sent first and a scripted click was used as a fallback."
          ),
          inputDelivered: booleanSchema(
            "Whether the page observed the synthesized mouse input. False means Chromium dropped it, which happens while a hidden remote control window has never painted."
          ),
          hit: enumSchema(
            ["self", "descendant", "covered"],
            "Which element the scripted click activated: the node itself, the descendant sitting at its centre (an `<li role=tab>` wrapping the anchor that holds the handler), or the node itself when something else covers the point."
          ),
          hint: stringSchema(),
          selector: stringSchema(),
          nodeRef: stringSchema(),
          tag: stringSchema(),
          text: stringSchema(),
          x: { type: "number" },
          y: { type: "number" },
          ...verificationResultProperties,
        },
        ["mode", "tag"]
      )
    ),
    example: {
      request: { target: { tabId: "tab_01" }, nodeRef: "doc_7c0b:n7" },
      response: successExample({ mode: "auto", modeUsed: "mouse", nodeRef: "doc_7c0b:n7", tag: "BUTTON", text: "Submit", x: 423, y: 278, settled: true, settleWaitedMs: 260, navigated: false, issueCount: 0, issues: [] }),
    },
  }),
  endpoint({
    operationId: "hoverBrowserElement",
    method: "POST",
    path: "/browser/hover",
    description: "Move the synthesized pointer to the center of an element located by selector or nodeRef.",
    readOnly: false,
    body: targetBody(
      { ...locatorProperties, focus: focusSchema(), ...verificationProperties },
      [],
      undefined,
      { extra: locatorConstraint }
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          selector: stringSchema(),
          nodeRef: stringSchema(),
          tag: stringSchema(),
          x: { type: "number" },
          y: { type: "number" },
          ...verificationResultProperties,
        },
        ["tag", "x", "y"]
      )
    ),
    example: {
      request: { selector: ".account-menu" },
      response: successExample({ selector: ".account-menu", tag: "BUTTON", x: 914, y: 32 }),
    },
  }),
  endpoint({
    operationId: "scrollBrowserTab",
    method: "POST",
    path: "/browser/scroll",
    description: "Send a synthesized wheel event at page coordinates; positive deltaY scrolls down.",
    readOnly: false,
    body: targetBody({
      x: integerSchema("Viewport x coordinate.", -100000, 100000, 0),
      y: integerSchema("Viewport y coordinate.", -100000, 100000, 0),
      deltaX: integerSchema(undefined, -100000, 100000, 0),
      deltaY: integerSchema(undefined, -100000, 100000, 0),
      focus: focusSchema(),
      ...verificationProperties,
    }),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          x: integerSchema(),
          y: integerSchema(),
          deltaX: integerSchema(),
          deltaY: integerSchema(),
          ...verificationResultProperties,
        },
        ["x", "y", "deltaX", "deltaY"]
      )
    ),
    example: {
      request: { target: { tabId: "tab_01" }, x: 400, y: 300, deltaY: 480 },
      response: successExample({ x: 400, y: 300, deltaX: 0, deltaY: 480 }),
    },
  }),
  endpoint({
    operationId: "dragInBrowserTab",
    method: "POST",
    path: "/browser/drag",
    description: "Synthesize a smooth pointer drag from one viewport coordinate to another.",
    readOnly: false,
    body: targetBody(
      {
        fromX: integerSchema(undefined, -100000, 100000),
        fromY: integerSchema(undefined, -100000, 100000),
        toX: integerSchema(undefined, -100000, 100000),
        toY: integerSchema(undefined, -100000, 100000),
        button: enumSchema(["left", "middle", "right"]),
        steps: integerSchema("Number of interpolated pointer moves.", 1, 100, 8),
        focus: focusSchema(),
        ...verificationProperties,
      },
      ["fromX", "fromY", "toX", "toY"]
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          fromX: integerSchema(),
          fromY: integerSchema(),
          toX: integerSchema(),
          toY: integerSchema(),
          button: enumSchema(["left", "middle", "right"]),
          steps: integerSchema(undefined, 1),
          inputDelivered: booleanSchema(
            "Whether the page observed the synthesized drag. False means Chromium dropped it, which happens while a hidden remote control window has never painted."
          ),
          hint: stringSchema(),
          ...verificationResultProperties,
        },
        ["fromX", "fromY", "toX", "toY", "button", "steps"]
      )
    ),
    example: {
      request: { fromX: 100, fromY: 200, toX: 360, toY: 200, button: "left", steps: 8 },
      response: successExample({ fromX: 100, fromY: 200, toX: 360, toY: 200, button: "left", steps: 8 }),
    },
  }),
  endpoint({
    operationId: "queryBrowserDom",
    method: "POST",
    path: "/browser/query",
    description: "Query DOM elements and return compact tag, id, class, text, attribute, rectangle and nodeRef data.",
    readOnly: true,
    body: targetBody(
      {
        selector: stringSchema("CSS selector.", { minLength: 1 }),
        limit: integerSchema("Maximum matching elements.", 1, 200, 20),
        attr: stringSchema("Optional attribute name to return."),
        includeNodeRefs: booleanSchema("Issue nodeRefs for later interactions.", true),
      },
      ["selector"]
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          selector: stringSchema(),
          count: integerSchema(undefined, 0),
          elements: arraySchema(
            objectSchema(
              {
                nodeRef: stringSchema(),
                tag: stringSchema(),
                id: stringSchema(),
                className: stringSchema(),
                text: stringSchema(),
                attr: nullable(stringSchema()),
                rect: rectSchema,
              },
              ["tag", "text", "rect"]
            )
          ),
        },
        ["selector", "count", "elements"]
      )
    ),
    example: {
      request: { selector: "button", limit: 10, includeNodeRefs: true },
      response: successExample({
        selector: "button",
        count: 1,
        elements: [
          {
            nodeRef: "doc_7c0b:n7",
            tag: "BUTTON",
            id: "submit",
            className: "primary",
            text: "Submit",
            rect: { x: 380, y: 258, width: 86, height: 40 },
          },
        ],
      }),
    },
  }),
  endpoint({
    operationId: "pressBrowserKey",
    method: "POST",
    path: "/browser/key",
    description: "Press and release an Electron key code with optional keyboard modifiers.",
    readOnly: false,
    body: targetBody(
      {
        key: stringSchema("Logical key, for example Enter, Tab, Escape or a.", { minLength: 1 }),
        keyCode: stringSchema("Optional Electron keyCode override."),
        modifiers: arraySchema(enumSchema(["alt", "control", "meta", "shift"]), undefined, {
          uniqueItems: true,
        }),
        focus: focusSchema(),
        ...verificationProperties,
      },
      ["key"]
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          key: stringSchema(),
          keyCode: stringSchema(),
          inputDelivered: booleanSchema(
            "Whether the page observed the key. False means Chromium dropped the synthesized input (a hidden remote control window that has never painted); retry, or type into a locator instead."
          ),
          hint: stringSchema(),
          ...verificationResultProperties,
        },
        ["key", "keyCode"]
      )
    ),
    example: {
      request: { target: { tabId: "tab_01" }, key: "Enter" },
      response: successExample({ key: "Enter", keyCode: "Enter" }),
    },
  }),
  endpoint({
    operationId: "typeBrowserText",
    method: "POST",
    path: "/browser/type",
    description: "Type Unicode text into the currently focused page control using synthesized character events.",
    readOnly: false,
    body: targetBody(
      {
        text: stringSchema("Text to type.", { minLength: 1, maxLength: 100000 }),
        intervalMs: integerSchema("Delay between characters.", 0, 1000, 0),
        focus: focusSchema(),
        ...verificationProperties,
      },
      ["text"]
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        { text: stringSchema(), length: integerSchema(undefined, 0), ...verificationResultProperties },
        ["text", "length"]
      )
    ),
    example: { request: { text: "hello" }, response: successExample({ text: "hello", length: 5 }) },
  }),
  endpoint({
    operationId: "waitForBrowserCondition",
    method: "POST",
    path: "/browser/wait",
    description:
      "Wait for a selector state, text, URL pattern, document load state, JavaScript predicate or a quiet network interval.",
    readOnly: true,
    body: targetBody(
      {
        selector: stringSchema("CSS selector used by attached/visible/hidden/detached states."),
        state: enumSchema(["attached", "visible", "hidden", "detached", "enabled", "disabled"]),
        text: stringSchema("Text that must occur in selector or body innerText."),
        urlMatches: stringSchema("Substring matched against the current URL."),
        loadState: enumSchema(["domcontentloaded", "load", "networkidle"]),
        expression: stringSchema("JavaScript predicate evaluated until it becomes truthy."),
        timeout: integerSchema("Overall timeout in milliseconds.", 100, 120000, 5000),
        pollInterval: integerSchema("Polling interval in milliseconds.", 25, 5000, 150),
        networkIdleMs: integerSchema("Required quiet interval for networkidle.", 100, 10000, 500),
        conditions: arraySchema(genericObjectSchema, "Structured wait conditions.", { minItems: 1 }),
        mode: enumSchema(["all", "any"]),
        timeoutMs: integerSchema("Alias for timeout.", 1, 120000),
        pollIntervalMs: integerSchema("Alias for pollInterval.", 10, 5000),
      },
      [],
      "Supply at least one condition. Multiple conditions must all become true.",
      {
        extra: {
          anyOf: [
            { required: ["selector"] },
            { required: ["text"] },
            { required: ["urlMatches"] },
            { required: ["loadState"] },
            { required: ["expression"] },
            { required: ["conditions"] },
          ],
        },
      }
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          waitedMs: integerSchema(undefined, 0),
          matched: booleanSchema(),
          mode: enumSchema(["all", "any"]),
          observations: arraySchema(objectSchema({
            index: integerSchema(undefined, 0), type: stringSchema(), matched: booleanSchema(), value: true, error: stringSchema(), observedAt: stringSchema(undefined, { format: "date-time" }),
          }, ["index", "type", "matched", "observedAt"], undefined, { additionalProperties: true })),
          selector: nullable(stringSchema()),
          url: stringSchema(),
        },
        ["waitedMs", "matched", "mode", "observations", "selector", "url"]
      )
    ),
    example: {
      request: { selector: "main[data-ready='true']", state: "visible", timeout: 8000 },
      response: successExample({
        waitedMs: 327,
        matched: true,
        mode: "all",
        observations: [{ index: 0, type: "selector", matched: true, value: { visible: true }, observedAt: ISO_TIMESTAMP }],
        selector: "main[data-ready='true']",
        url: "https://example.com/app",
      }),
    },
  }),
  endpoint({
    operationId: "readBrowserText",
    method: "POST",
    path: "/browser/read",
    description: "Read visible innerText from a selector (body by default), with explicit truncation metadata.",
    readOnly: true,
    body: targetBody({
      selector: stringSchema("CSS selector; defaults to body.", { default: "body" }),
      maxLength: integerSchema("Maximum UTF-16 characters; zero disables truncation.", 0, 200000, 8000),
    }),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          selector: stringSchema(),
          tag: stringSchema(),
          length: integerSchema("Original character length.", 0),
          text: stringSchema(),
          truncated: booleanSchema(),
        },
        ["selector", "tag", "length", "text", "truncated"]
      )
    ),
    example: {
      request: { target: { tabId: "tab_01" }, selector: "main", maxLength: 4000 },
      response: successExample({ selector: "main", tag: "MAIN", length: 14, text: "Example Domain", truncated: false }),
    },
  }),
  endpoint({
    operationId: "captureBrowserScreenshot",
    method: "POST",
    path: "/browser/screenshot",
    description:
      "Capture the target tab as PNG, including while its window remains hidden. Remote-browser-control windows are never revealed by a capture: their visibility is controlled by the user from the tray menu.",
    readOnly: true,
    body: targetBody({
      stayHidden: booleanSchema(
        "Do not reveal a hidden window during capture. Always enforced for remote-browser-control windows.",
        true,
      ),
      encoding: enumSchema(["base64", "dataUrl", "both"]),
    }),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          width: integerSchema(undefined, 1),
          height: integerSchema(undefined, 1),
          dataUrl: stringSchema(),
          base64: stringSchema(undefined, { contentEncoding: "base64", contentMediaType: "image/png" }),
          mime: { const: "image/png" },
          windowVisible: booleanSchema(),
          stayHidden: booleanSchema(),
        },
        ["width", "height", "mime", "windowVisible", "stayHidden"]
      )
    ),
    example: {
      request: { target: { tabId: "tab_01" }, stayHidden: true, encoding: "base64" },
      response: successExample({
        width: 1280,
        height: 720,
        base64: "iVBORw0KGgoAAA...",
        mime: "image/png",
        windowVisible: false,
        stayHidden: true,
      }),
    },
  }),
  endpoint({
    operationId: "showBrowserWindow",
    method: "POST",
    path: "/browser/window/show",
    description:
      "Show and focus the browser window containing the target tab. Remote-browser-control windows are user-controlled: the request is accepted but not applied to them, and the response reports suppressed:true with the real visibility.",
    readOnly: false,
    body: targetBody(),
    query: null,
    response: successEnvelopeSchema(
      windowVisibilitySchema("show")
    ),
    example: {
      request: { tabId: "tab_01" },
      response: successExample({
        windowId: 3,
        visible: true,
        focused: true,
        action: "show",
        suppressed: false,
        visibilityControl: "api",
      }),
    },
  }),
  endpoint({
    operationId: "hideBrowserWindow",
    method: "POST",
    path: "/browser/window/hide",
    description:
      "Hide a browser window selected directly by windowId or through a target tab. Remote-browser-control windows are user-controlled: the request is accepted but not applied to them, and the response reports suppressed:true with the real visibility.",
    readOnly: false,
    body: targetBody(),
    query: null,
    response: successEnvelopeSchema(
      windowVisibilitySchema("hide")
    ),
    example: {
      request: { windowId: 3 },
      response: successExample({
        windowId: 3,
        visible: false,
        focused: false,
        action: "hide",
        suppressed: false,
        visibilityControl: "api",
      }),
    },
  }),
  endpoint({
    operationId: "focusBrowserWindow",
    method: "POST",
    path: "/browser/window/focus",
    description:
      "Show and focus the browser window containing the target tab. Remote-browser-control windows are user-controlled: the request is accepted but not applied to them, and the response reports suppressed:true with the real visibility.",
    readOnly: false,
    body: targetBody(),
    query: null,
    response: successEnvelopeSchema(
      windowVisibilitySchema("focus")
    ),
    example: {
      request: { target: { tabId: "tab_01" } },
      response: successExample({
        windowId: 3,
        visible: true,
        focused: true,
        action: "focus",
        suppressed: false,
        visibilityControl: "api",
      }),
    },
  }),
  endpoint({
    operationId: "goBackBrowserTab",
    method: "POST",
    path: "/browser/back",
    description: "Navigate the target tab one entry backward in history.",
    readOnly: false,
    body: targetBody({ ...verificationProperties }),
    query: null,
    response: successEnvelopeSchema(basicActionResultSchema),
    example: {
      request: { tabId: "tab_01" },
      response: successExample({ action: "back", target: { tabId: "tab_01", windowId: 3, url: "https://example.com/" } }),
    },
  }),
  endpoint({
    operationId: "goForwardBrowserTab",
    method: "POST",
    path: "/browser/forward",
    description: "Navigate the target tab one entry forward in history.",
    readOnly: false,
    body: targetBody({ ...verificationProperties }),
    query: null,
    response: successEnvelopeSchema(basicActionResultSchema),
    example: {
      request: { tabId: "tab_01" },
      response: successExample({ action: "forward", target: { tabId: "tab_01", windowId: 3, url: "https://example.com/docs" } }),
    },
  }),
  endpoint({
    operationId: "reloadBrowserTab",
    method: "POST",
    path: "/browser/reload",
    description: "Reload the target tab, optionally bypassing the HTTP cache.",
    readOnly: false,
    body: targetBody({
      ignoreCache: booleanSchema("Bypass the browser cache.", false),
      ...verificationProperties,
    }),
    query: null,
    response: successEnvelopeSchema(basicActionResultSchema),
    example: {
      request: { target: { tabId: "tab_01" }, ignoreCache: true },
      response: successExample({ action: "reload", target: { tabId: "tab_01", windowId: 3, url: "https://example.com/" } }),
    },
  }),
  endpoint({
    operationId: "switchBrowserTab",
    method: "POST",
    path: "/browser/switch-tab",
    description: "Make an exact tabId active in its VsGo browser window.",
    readOnly: false,
    body: objectSchema(
      { tabId: stringSchema(undefined, { minLength: 1 }), focus: focusSchema("Also focus the page inside its window.") },
      ["tabId"]
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema({ tabId: stringSchema(), windowId: integerSchema(undefined, 1), active: { const: true } }, ["tabId", "windowId", "active"])
    ),
    example: {
      request: { tabId: "tab_02", focus: false },
      response: successExample({ tabId: "tab_02", windowId: 3, active: true }),
    },
  }),
  endpoint({
    operationId: "closeBrowserTab",
    method: "POST",
    path: "/browser/close-tab",
    description: "Close an exact tabId and stop capture sessions attached to that tab.",
    readOnly: false,
    body: objectSchema({ tabId: stringSchema(undefined, { minLength: 1 }) }, ["tabId"]),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        { tabId: stringSchema(), windowId: integerSchema(undefined, 1), closed: { const: true } },
        ["tabId", "windowId", "closed"]
      )
    ),
    example: { request: { tabId: "tab_02" }, response: successExample({ tabId: "tab_02", windowId: 3, closed: true }) },
  }),
  endpoint({
    operationId: "setBrowserDevTools",
    method: "POST",
    path: "/browser/devtools",
    description: "Open or close detached DevTools for the target tab.",
    readOnly: false,
    body: targetBody({
      open: booleanSchema(undefined),
      force: booleanSchema("Stop active remote debug sessions before opening DevTools.", false),
    }, ["open"]),
    query: null,
    response: successEnvelopeSchema(
      objectSchema({ open: booleanSchema(), target: targetResultSchema }, ["open", "target"])
    ),
    example: {
      request: { target: { tabId: "tab_01" }, open: true },
      response: successExample({ open: true, target: { tabId: "tab_01", windowId: 3, url: "https://example.com/" } }),
    },
  }),
  endpoint({
    operationId: "startBrowserSession",
    method: "POST",
    path: "/browser/session/start",
    description:
      "Start a bounded debugger capture session for console, runtime exceptions, network and navigation events on one tab.",
    readOnly: false,
    body: targetBody({
      categories: arraySchema(eventCategorySchema, "Event categories to capture.", {
        minItems: 1,
        uniqueItems: true,
        default: ["console", "runtime", "network", "navigation", "page", "log", "crashes"],
      }),
      captureResponseBodies: booleanSchema("Retain eligible response bodies for /browser/network/body.", false),
      maxBodyBytes: integerSchema("Per-response retained body limit.", 1, 10_485_760, 1_048_576),
    }),
    query: null,
    response: successEnvelopeSchema(sessionSchema),
    example: {
      request: {
        target: { tabId: "tab_01" },
        categories: ["console", "runtime", "network", "navigation"],
        captureResponseBodies: true,
      },
      response: successExample({
        sessionId: "session_b5f8e80c-7de9-49fa-bf25-9a1b5eddb366",
        target: { tabId: "tab_01", windowId: 3, url: "https://example.com/", title: "Example Domain" },
        categories: ["console", "runtime", "network", "navigation"],
        startedAt: EXAMPLE_TIMESTAMP_MS,
        active: true,
        cursor: 0,
        oldestCursor: 0,
        eventCount: 0,
        droppedEventCount: 0,
        captureResponseBodies: true,
      }),
    },
  }),
  endpoint({
    operationId: "listBrowserSessions",
    method: "GET",
    path: "/browser/session/list",
    description: "List active and recently stopped debugger capture sessions, optionally filtered by target or state.",
    readOnly: true,
    body: null,
    query: targetQuery({
      active: enumSchema(["true", "false"], "Optional active-state query filter."),
      limit: integerSchema("Maximum sessions returned.", 1, 500, 100),
    }),
    response: successEnvelopeSchema(
      objectSchema({ sessions: arraySchema(sessionSchema), count: integerSchema(undefined, 0) }, ["sessions", "count"])
    ),
    example: { request: { query: { active: "true" } }, response: successExample({ sessions: [], count: 0 }) },
  }),
  endpoint({
    operationId: "getBrowserSession",
    method: "GET",
    path: "/browser/session/get",
    description: "Read one active or recently stopped debugger capture session.",
    readOnly: true,
    body: null,
    query: objectSchema({ sessionId: stringSchema(undefined, { minLength: 1 }) }, ["sessionId"]),
    response: successEnvelopeSchema(sessionSchema),
    example: {
      request: { query: { sessionId: "session_b5f8e80c-7de9-49fa-bf25-9a1b5eddb366" } },
      response: successExample({
        sessionId: "session_b5f8e80c-7de9-49fa-bf25-9a1b5eddb366",
        target: { tabId: "tab_01", windowId: 3, url: "https://example.com/" },
        categories: ["console", "runtime", "network", "navigation"],
        startedAt: EXAMPLE_TIMESTAMP_MS,
        active: true,
        cursor: 24,
        oldestCursor: 1,
        eventCount: 24,
        droppedEventCount: 0,
        captureResponseBodies: false,
      }),
    },
  }),
  endpoint({
    operationId: "getBrowserSessionEvents",
    method: "GET",
    path: "/browser/session/events",
    description:
      "Read normalized capture events after a cursor. Optional long polling waits until an event arrives or waitMs elapses.",
    readOnly: true,
    body: null,
    query: objectSchema(
      {
        sessionId: stringSchema(undefined, { minLength: 1 }),
        cursor: integerSchema("Return events with seq greater than this cursor.", 0),
        limit: integerSchema("Maximum events returned.", 1, 2000, 200),
        waitMs: integerSchema("Long-poll timeout; zero returns immediately.", 0, 30000, 0),
        categories: stringSchema("Comma-separated console,runtime,network,navigation filter."),
        levels: stringSchema("Comma-separated debug,info,warning,error filter."),
      },
      ["sessionId"]
    ),
    response: successEnvelopeSchema(
      objectSchema(
        {
          sessionId: stringSchema(),
          events: arraySchema(REMOTE_BROWSER_EVENT_SCHEMA),
          cursor: integerSchema(undefined, 0),
          oldestSeq: nullable(integerSchema(undefined, 1)),
          newestSeq: nullable(integerSchema(undefined, 1)),
          truncated: booleanSchema("True when requested cursor data was evicted."),
          hasMore: booleanSchema(),
          timedOut: booleanSchema("True when long polling produced no new event."),
        },
        ["sessionId", "events", "cursor", "oldestSeq", "newestSeq", "truncated", "hasMore", "timedOut"]
      )
    ),
    example: {
      request: { query: { sessionId: "session_b5f8e80c-7de9-49fa-bf25-9a1b5eddb366", cursor: 23, limit: 200 } },
      response: successExample({
        sessionId: "session_b5f8e80c-7de9-49fa-bf25-9a1b5eddb366",
        events: [{ seq: 24, eventId: "event_24", tabId: "tab_01", documentId: "doc_7c0b", timestamp: EXAMPLE_TIMESTAMP_MS, source: "debugger", type: "Runtime.consoleAPICalled", payload: { type: "error", args: [{ value: "Failed" }] } }],
        cursor: 24,
        oldestSeq: 1,
        newestSeq: 24,
        truncated: false,
        hasMore: false,
        timedOut: false,
      }),
    },
  }),
  endpoint({
    operationId: "stopBrowserSession",
    method: "POST",
    path: "/browser/session/stop",
    description: "Stop a debugger capture session and return its final counters; buffered events remain briefly readable.",
    readOnly: false,
    body: objectSchema({ sessionId: stringSchema(undefined, { minLength: 1 }) }, ["sessionId"]),
    query: null,
    response: successEnvelopeSchema(sessionSchema),
    example: {
      request: { sessionId: "session_b5f8e80c-7de9-49fa-bf25-9a1b5eddb366" },
      response: successExample({
        sessionId: "session_b5f8e80c-7de9-49fa-bf25-9a1b5eddb366",
        target: { tabId: "tab_01", windowId: 3, url: "https://example.com/" },
        categories: ["console", "runtime", "network", "navigation"],
        startedAt: EXAMPLE_TIMESTAMP_MS,
        stoppedAt: EXAMPLE_TIMESTAMP_MS + 60_000,
        active: false,
        cursor: 24,
        oldestCursor: 1,
        eventCount: 24,
        droppedEventCount: 0,
        captureResponseBodies: true,
      }),
    },
  }),
  endpoint({
    operationId: "runBrowserDiagnostics",
    method: "POST",
    path: "/browser/diagnostics",
    description: "Collect state, recent events, errors, failed requests and optional screenshot/snapshot in one bundle.",
    readOnly: true,
    body: targetBody({
      sessionId: stringSchema("Reuse a session; otherwise create a short-lived session."),
      since: stringSchema("Only include events at or after this timestamp.", { format: "date-time" }),
      eventLimit: integerSchema(undefined, 1, 1000, 500), includeScreenshot: booleanSchema(undefined, true),
      includeSnapshot: booleanSchema(undefined, true), includeNetworkBodies: booleanSchema(undefined, false),
      maxBodyBytes: integerSchema(undefined, 1, 10_485_760, 524288), snapshotMode: enumSchema(["accessibility", "dom", "interactive"]),
      maxSnapshotNodes: integerSchema(undefined, 1, 10000, 2000), includeHidden: booleanSchema(undefined, false),
      resolveSourceMap: booleanSchema(undefined, false), includeSourceMap: booleanSchema("Compatibility alias for resolveSourceMap.", false),
    }),
    query: null,
    response: successEnvelopeSchema(objectSchema({
      collectedAt: stringSchema(undefined, { format: "date-time" }), target: targetResultSchema,
      state: objectSchema({ loading: booleanSchema(), canGoBack: booleanSchema(), canGoForward: booleanSchema(), windowVisible: booleanSchema(), documentReadyState: enumSchema(["loading", "interactive", "complete"]), documentId: stringSchema() }, ["loading", "canGoBack", "canGoForward", "windowVisible", "documentReadyState"], undefined, { additionalProperties: true }),
      activity: genericObjectSchema,
      session: nullable(sessionSchema), summary: objectSchema({ consoleErrors: integerSchema(undefined, 0), runtimeExceptions: integerSchema(undefined, 0), failedRequests: integerSchema(undefined, 0), navigations: integerSchema(undefined, 0), issues: integerSchema(undefined, 0) }, ["consoleErrors", "runtimeExceptions", "failedRequests", "navigations", "issues"]),
      events: arraySchema(REMOTE_BROWSER_EVENT_SCHEMA),
      issues: arraySchema(genericObjectSchema),
      screenshot: nullable(objectSchema({ width: integerSchema(undefined, 1), height: integerSchema(undefined, 1), mime: { const: "image/png" }, base64: stringSchema(undefined, { contentEncoding: "base64", contentMediaType: "image/png" }) }, ["width", "height", "mime", "base64"])),
      snapshot: nullable(snapshotResultSchema),
      sourceMap: true,
      networkBodies: arraySchema(objectSchema({ requestId: stringSchema(), url: stringSchema(), mimeType: stringSchema(), body: stringSchema(), base64Encoded: booleanSchema(), bytes: integerSchema(undefined, 0), originalBytes: integerSchema(undefined, 0), truncated: booleanSchema() }, ["requestId", "url", "mimeType", "body", "base64Encoded", "bytes", "originalBytes", "truncated"])),
      warnings: arraySchema(stringSchema()),
    }, ["collectedAt", "target", "state", "activity", "session", "summary", "events", "issues", "screenshot", "snapshot", "sourceMap", "networkBodies", "warnings"])),
    example: {
      request: { target: { tabId: "tab_01" }, eventLimit: 500, includeScreenshot: true },
      response: successExample({ collectedAt: ISO_TIMESTAMP, target: { tabId: "tab_01", windowId: 3, url: "https://example.com/" }, state: { loading: false, canGoBack: false, canGoForward: false, windowVisible: true, documentReadyState: "complete" }, activity: {}, session: null, summary: { consoleErrors: 1, runtimeExceptions: 0, failedRequests: 1, navigations: 1, issues: 1 }, events: [], issues: [], screenshot: null, snapshot: null, sourceMap: null, networkBodies: [], warnings: [] }),
    },
  }),
  endpoint({
    operationId: "snapshotBrowserPage",
    method: "POST",
    path: "/browser/snapshot",
    description:
      "Capture a page snapshot and issue document-scoped nodeRefs for later interaction. Use output 'text' for a token-efficient view and viewportOnly to keep only what is on screen.",
    readOnly: true,
    body: targetBody({
      mode: enumSchema(["accessibility", "dom", "interactive"]), selector: stringSchema("Optional CSS subtree root."),
      maxDepth: integerSchema(undefined, 0, 100, 20), maxNodes: integerSchema(undefined, 1, 10000, 2000),
      includeText: booleanSchema(undefined, true), includeHidden: booleanSchema(undefined, false), includeRects: booleanSchema(undefined, true),
      includeAttributes: arraySchema(stringSchema(), "Attribute allow-list.", { uniqueItems: true }),
      output: enumSchema(
        ["json", "text"],
        "'text' (recommended) returns an indented node listing in 'text' and omits the nodes array; rectangles and full text default off.",
      ),
      viewportOnly: booleanSchema(
        "Emit only nodes intersecting the viewport; the number of omitted matching nodes is reported as offscreenCount.",
        false,
      ),
      maxTextLength: integerSchema(undefined, 16, 100_000, 2000),
    }),
    query: null,
    response: successEnvelopeSchema(snapshotResultSchema),
    example: {
      request: { target: { tabId: "tab_01" }, mode: "interactive", output: "text", viewportOnly: true },
      response: successExample({ documentId: "doc_7c0b", target: { tabId: "tab_01", windowId: 3, url: "https://example.com/" }, mode: "interactive", output: "text", nodeRefFormat: "doc_7c0b:n<id>", rootRef: "doc_7c0b:n1", nodeCount: 1, truncated: false, interactiveCount: 1, viewportOnly: true, offscreenCount: 0, viewport: { width: 1440, height: 900, scrollX: 0, scrollY: 0 }, text: "https://example.com/ - Example Domain\nnodes=1 interactive=1 viewport=1440x900 viewportOnly=true\nnodeRef format: \"doc_7c0b:n<id>\" - the [n<id>] prefixes below\n[n1] button \"Submit\"" }),
    },
  }),
  endpoint({
    operationId: "actOnBrowserSnapshotNode",
    method: "POST",
    path: "/browser/node/action",
    description: "Act on a selector or document-scoped nodeRef returned by snapshot.",
    readOnly: false,
    body: targetBody(
      {
        selector: stringSchema("CSS selector locator."),
        nodeRef: stringSchema("Document-scoped opaque node reference."),
        action: enumSchema(["inspect", "click", "hover", "focus", "clear", "setValue"]),
        value: stringSchema(
          "Value used by setValue. For a select either an option value or the option label shown in the snapshot is accepted; naming an option that does not exist fails with the available options instead of doing nothing. Aiming at an <option> selects it in the owning select."
        ),
        mode: enumSchema(
          ["auto", "js", "mouse"],
          "Click delivery strategy for action 'click'; same semantics as /browser/click.",
        ),
        ...verificationProperties,
      },
      ["action"]
    ),
    query: null,
    response: successEnvelopeSchema(
      objectSchema(
        {
          action: stringSchema(),
          selector: stringSchema(),
          nodeRef: stringSchema(),
          ok: booleanSchema(),
          tag: stringSchema(),
          text: stringSchema(),
          value: true,
          rect: rectSchema,
          mode: enumSchema(["auto", "js", "mouse"]),
          modeUsed: enumSchema(["js", "mouse"]),
          mouseAttempted: booleanSchema(
            "True when real mouse input was sent first and a scripted click was used as a fallback."
          ),
          inputDelivered: booleanSchema(
            "Whether the page observed the synthesized mouse input."
          ),
          hint: stringSchema(),
          ...verificationResultProperties,
        },
        ["action", "ok"],
        undefined,
        { additionalProperties: true }
      )
    ),
    example: {
      request: { target: { tabId: "tab_01" }, nodeRef: "doc_7c0b:n7", action: "click" },
      response: successExample({ action: "click", nodeRef: "doc_7c0b:n7", ok: true, tag: "BUTTON", text: "Submit" }),
    },
  }),
  endpoint({
    operationId: "resolveBrowserSourceLocation",
    method: "POST",
    path: "/browser/source/resolve",
    description: "Resolve a generated JavaScript or CSS position through its source map to original source.",
    readOnly: true,
    body: targetBody({
      generatedUrl: stringSchema("Loaded generated resource URL.", { format: "uri" }), line: integerSchema("One-based line.", 1), column: integerSchema("One-based column.", 1),
      includeSourceContent: booleanSchema(undefined, true),
    }, ["generatedUrl", "line", "column"]),
    query: null,
    response: successEnvelopeSchema(objectSchema({
      generated: objectSchema({ url: stringSchema(), line: integerSchema(undefined, 1), column: integerSchema(undefined, 1) }, ["url", "line", "column"]),
      mapUrl: stringSchema(), source: stringSchema(), line: integerSchema(undefined, 1), column: integerSchema(undefined, 1), name: nullable(stringSchema()), sourceContent: nullable(stringSchema()), codeFrame: nullable(stringSchema()),
    }, ["generated", "mapUrl", "source", "line", "column", "name", "sourceContent", "codeFrame"])),
    example: {
      request: { generatedUrl: "https://example.com/assets/app.js", line: 1, column: 9821 },
      response: successExample({ generated: { url: "https://example.com/assets/app.js", line: 1, column: 9821 }, mapUrl: "https://example.com/assets/app.js.map", source: "webpack:///src/App.tsx", line: 42, column: 7, name: "loadProfile", sourceContent: null, codeFrame: null }),
    },
  }),
  endpoint({
    operationId: "getBrowserNetworkBody",
    method: "GET",
    path: "/browser/network/body",
    description: "Read a retained response body from a session with response-body capture enabled.",
    readOnly: true,
    body: null,
    query: objectSchema({ sessionId: stringSchema(), requestId: stringSchema(), maxBytes: integerSchema(undefined, 1, 10_485_760, 1_048_576) }, ["sessionId", "requestId"]),
    response: successEnvelopeSchema(objectSchema({
      sessionId: stringSchema(), requestId: stringSchema(), url: stringSchema(), status: integerSchema(undefined, 0, 999), mimeType: stringSchema(), charset: nullable(stringSchema()), body: stringSchema("Text or base64 data."), base64Encoded: booleanSchema(), bytes: integerSchema(undefined, 0), originalBytes: integerSchema(undefined, 0), truncated: booleanSchema(),
    }, ["sessionId", "requestId", "url", "status", "mimeType", "charset", "body", "base64Encoded", "bytes", "originalBytes", "truncated"])),
    example: {
      request: { query: { sessionId: "session_abc", requestId: "3812.17" } },
      response: successExample({ sessionId: "session_abc", requestId: "3812.17", url: "https://example.com/api/profile", status: 200, mimeType: "application/json", charset: "utf-8", body: "{\"id\":42}", base64Encoded: false, bytes: 9, originalBytes: 9, truncated: false }),
    },
  }),
  endpoint({
    operationId: "runBrowserBatch",
    method: "POST",
    path: "/browser/batch",
    description: "Execute ordered catalog subrequests with stop-on-error or independent per-operation results.",
    readOnly: false,
    body: objectSchema({
      operations: arraySchema({
        type: "object",
        properties: {
          id: stringSchema("Caller-defined correlation id.", { minLength: 1, maxLength: 100 }),
          operation: stringSchema("Service operation name; mutually exclusive with path."),
          method: enumSchema(["GET", "POST"]),
          path: stringSchema("Catalog path; mutually exclusive with operation.", { pattern: "^/browser/" }),
          query: genericObjectSchema,
          body: genericObjectSchema,
        },
        oneOf: [{ required: ["operation"] }, { required: ["path"] }],
        additionalProperties: false,
      }, "One to 50 ordered subrequests. Nested values may reference an earlier successful step with {\"$result\":\"stepId\",\"pointer\":\"/data/path\"}.", { minItems: 1, maxItems: 50 }),
      stopOnError: booleanSchema(undefined, true), timeout: integerSchema("Overall timeout in milliseconds.", 100, 120000, 30000),
      abortOnNavigation: booleanSchema(
        "Skip the remaining steps once a page the batch already touched navigates, so no step acts on a document the caller never saw (default false). Detection uses each step's own settle/observe report plus the live document generation before every step; navigation operations listed in NAVIGATION_OPERATIONS (open/navigate/reload/back/forward) are the caller's own intent and move the baseline instead of stopping the batch. Disabling settle makes detection lag by one step, since a navigation that commits after a step returned is only visible to the next one.",
        false,
      ),
    }, ["operations"]),
    query: null,
    response: successEnvelopeSchema(objectSchema({
      results: arraySchema(objectSchema({
        id: stringSchema(), index: integerSchema(undefined, 0), operation: stringSchema(), status: integerSchema(undefined, 100, 599), skipped: booleanSchema(), data: true, error: REMOTE_BROWSER_ERROR_SCHEMA, meta: REMOTE_BROWSER_META_SCHEMA,
        reason: enumSchema(["NAVIGATED"], "Set when abortOnNavigation stopped the batch before this step ran."),
      }, ["id", "index", "status", "skipped"])),
      transactional: { const: false }, stopOnError: booleanSchema(), abortOnNavigation: booleanSchema(), navigationDetectedAt: nullable(stringSchema()), completed: integerSchema(undefined, 0), failed: integerSchema(undefined, 0), skipped: integerSchema(undefined, 0), durationMs: integerSchema(undefined, 0),
    }, ["transactional", "stopOnError", "results", "completed", "failed", "skipped", "durationMs"])),
    example: {
      request: { operations: [
        { id: "state", method: "GET", path: "/browser/state", query: { tabId: "tab_01" } },
        { id: "read", method: "POST", path: "/browser/read", body: { tabId: "tab_01", selector: "main" } },
      ], stopOnError: true, timeout: 30000 },
      response: successExample({ results: [
        { id: "state", index: 0, operation: "state", status: 200, skipped: false, data: { tabId: "tab_01", loading: false } },
        { id: "read", index: 1, operation: "read", status: 200, skipped: false, data: { selector: "main", text: "Example Domain" } },
      ], transactional: false, stopOnError: true, abortOnNavigation: false, navigationDetectedAt: null, completed: 2, failed: 0, skipped: 0, durationMs: 8 }),
    },
  }),
  endpoint({
    operationId: "getBrowserCapabilities",
    method: "GET",
    path: "/browser/capabilities",
    description: "Report API limits, capture domains, locator types, wait conditions and route capabilities.",
    readOnly: true,
    body: null,
    query: null,
    response: successEnvelopeSchema(objectSchema({
      apiVersion: stringSchema(undefined, { const: REMOTE_BROWSER_API_VERSION }),
      transport: { const: "service" },
      operations: arraySchema(stringSchema(), undefined, { uniqueItems: true }),
      target: objectSchema({ nested: { const: true }, topLevelCompatibility: { const: true }, selectors: arraySchema(enumSchema(["tabId", "windowId", "url"]), undefined, { uniqueItems: true }), strictConflicts: { const: true }, navigateTopLevelUrlIsDestination: { const: true } }, ["nested", "topLevelCompatibility", "selectors", "strictConflicts", "navigateTopLevelUrlIsDestination"]),
      navigationProtocols: arraySchema(stringSchema(), undefined, { uniqueItems: true }),
      captureDomains: arraySchema(eventCategorySchema, undefined, { uniqueItems: true }),
      locatorTypes: arraySchema(enumSchema(["selector", "nodeRef"]), undefined, { uniqueItems: true }),
      snapshotOutputs: arraySchema(enumSchema(["json", "text"]), undefined, { uniqueItems: true }),
      clickModes: arraySchema(enumSchema(["auto", "js", "mouse"]), undefined, { uniqueItems: true }),
      actionVerification: genericObjectSchema,
      evaluateWorlds: arraySchema(enumSchema(["main", "isolated"]), undefined, { uniqueItems: true }),
      waitConditions: arraySchema(stringSchema(), undefined, { uniqueItems: true }),
      limits: objectSchema({
        maxBatchOperations: integerSchema(undefined, 1), maxSessionEventsPerRead: integerSchema(undefined, 1),
        maxNetworkBodyBytes: integerSchema(undefined, 1), maxSnapshotNodes: integerSchema(undefined, 1),
      }, ["maxBatchOperations", "maxSessionEventsPerRead", "maxNetworkBodyBytes", "maxSnapshotNodes"]),
    }, ["apiVersion", "transport", "operations", "target", "navigationProtocols", "captureDomains", "locatorTypes", "evaluateWorlds", "waitConditions", "limits"])),
    example: {
      request: {},
      response: successExample({
        apiVersion: REMOTE_BROWSER_API_VERSION, transport: "service", operations: ["state", "evaluate", "diagnostics"],
        target: { nested: true, topLevelCompatibility: true, selectors: ["tabId", "windowId", "url"], strictConflicts: true, navigateTopLevelUrlIsDestination: true },
        navigationProtocols: ["http:", "https:", "about:blank"], captureDomains: ["console", "runtime", "network", "navigation", "page", "log", "crashes"], locatorTypes: ["selector", "nodeRef"], evaluateWorlds: ["main", "isolated"],
        waitConditions: ["selector", "text", "url", "expression", "networkIdle"],
        limits: { maxBatchOperations: 50, maxSessionEventsPerRead: 1000, maxNetworkBodyBytes: 10485760, maxSnapshotNodes: 10000 },
      }),
    },
  }),
];

export const endpointCatalog = REMOTE_BROWSER_ENDPOINT_CATALOG;

export function findRemoteBrowserEndpoint(method: string, path: string): RemoteBrowserEndpoint | undefined {
  const normalizedMethod = method.toUpperCase();
  return REMOTE_BROWSER_ENDPOINT_CATALOG.find((item) => item.method === normalizedMethod && item.path === path);
}

/** Compact per-operation record used by the LLM-friendly `/api/llm` view. */
export interface RemoteBrowserLlmOperation {
  readonly id: string;
  readonly method: RemoteBrowserHttpMethod;
  readonly path: string;
  readonly summary: string;
  readonly readOnly: boolean;
  readonly params: {
    readonly query: readonly string[];
    readonly requiredQuery: readonly string[];
    readonly body: readonly string[];
    readonly requiredBody: readonly string[];
  };
}

export interface RemoteBrowserLlmDocument {
  readonly name: string;
  readonly version: string;
  readonly host: string;
  readonly target_convention: string;
  readonly usage_notes: string;
  readonly operations: readonly RemoteBrowserLlmOperation[];
}

/**
 * Compact, token-efficient projection of the route catalog for LLM prompting.
 * Drops the full JSON Schema and example payloads, keeping only what an agent
 * needs to (a) discover an operation and (b) know which parameters it accepts.
 */
export function buildRemoteBrowserLlmDocument(
  host = "http://127.0.0.1:18766"
): RemoteBrowserLlmDocument {
  const operations: RemoteBrowserLlmOperation[] = REMOTE_BROWSER_ENDPOINT_CATALOG.map((ep) => {
    const query = schemaParamNames(ep.query);
    const body = schemaParamNames(ep.body);
    return {
      id: ep.operationId,
      method: ep.method,
      path: ep.path,
      summary: ep.description,
      readOnly: ep.readOnly,
      params: {
        query: query.all,
        requiredQuery: query.required,
        body: body.all,
        requiredBody: body.required,
      },
    };
  });

  return {
    name: REMOTE_BROWSER_SERVICE_NAME,
    version: REMOTE_BROWSER_API_VERSION,
    host,
    target_convention:
      "Send target.{tabId,windowId,url} or top-level tabId/windowId to select a tab; prefer tabId. Conflicts fail validation, there is no silent fallback, ambiguous matches return AMBIGUOUS_TARGET, and every browser response echoes meta.target with the resolved tab.",
    usage_notes: [
      "Open (or reuse) the dedicated remote-browser-control window with POST /browser/open; it always runs in the background (visibility is controlled only by the user from the tray menu, never by the API), and you get back the tabId to act on.",
      "Every browser response includes meta.target (tabId/url/title/windowId/documentId) so you know which tab was acted on.",
      "Prefer POST /browser/snapshot with output \"text\" (add viewportOnly true to keep only what is on screen, or mode \"interactive\" to keep only actionable nodes) before acting: it returns a compact indented listing with nodeRefs and omits the verbose JSON node array, so it costs a fraction of the tokens.",
      "A snapshot reports structure and actionable state, not page prose: a container contributes its own text and its inline-wrapped sentences once, and never repeats its block descendants. Text that no node carries is still reachable through POST /browser/read, and POST /browser/query answers pure selector questions.",
      "A node marked interactive that is not a control role is flagged \"clickable\" in the text rendering: the page wires it up through a pointer cursor or an inline handler rather than a role, and it is a normal click target.",
      "A select reports the options it offers, so setValue can be given the label you see instead of a guessed internal value; when the options are already listed as their own nodes the list is not repeated on the select.",
      "Interact with nodeRef values through POST /browser/click. Its default mode \"js\" activates the element a pointer would hit at the node's centre, so a click aimed at `<li role=\"tab\">` reaches the inner anchor that actually holds the handler; the response reports which element was activated as \"hit\". Pass mode \"auto\" to prefer real mouse input (verified, with a scripted click as a safety net) for pages that require trusted events, or \"mouse\" for synthesized input only.",
      "Synthesized input is dropped by Chromium while the remote control window has never painted, so a click with mode \"mouse\" or a key press can be lost. Check inputDelivered on click/key responses: false means the page never saw it, so retry, use mode \"js\" for clicking, or type through a locator instead.",
      "Input and navigation actions (click/hover/nodeAction/type/key/scroll/drag/navigate/reload/back/forward) settle the page and report what changed: settled, navigated, issueCount and issues carrying the console errors and failed requests produced by that action. Pass settle:false or observe:false to skip that work.",
      "Reach for POST /browser/wait only for explicit conditions that are not covered by action settling (text, expression, custom event, networkIdle).",
      "Use GET /browser/session/events and POST /browser/diagnostics to inspect console/network/runtime errors before editing code.",
      "Use POST /browser/source/resolve to map a generated stack location back to the original source file via source maps.",
      "A request body carrying a parameter this API does not define is echoed in meta.unknownParameters. An empty list means every parameter was understood - a mistyped name would otherwise be dropped and the call would still report success.",
    ].join(" "),
    operations,
  };
}

/** Full detail for one endpoint, used by the `GET /api/endpoint?operationId=...` view. */
export interface RemoteBrowserEndpointDetail {
  readonly operationId: string;
  readonly method: RemoteBrowserHttpMethod;
  readonly path: string;
  readonly description: string;
  readonly readOnly: boolean;
  readonly body: JsonSchema | null;
  readonly query: JsonSchema | null;
  readonly response: JsonSchema;
  readonly example_request: unknown;
  readonly example_response: unknown;
}

/**
 * Return the full detail projection for a single endpoint. Matches by
 * operationId (unique in the catalog); returns undefined when not found.
 */
export function buildRemoteBrowserEndpointDetail(
  operationId: string
): RemoteBrowserEndpointDetail | undefined {
  const ep = REMOTE_BROWSER_ENDPOINT_CATALOG.find((item) => item.operationId === operationId);
  if (!ep) return undefined;
  return {
    operationId: ep.operationId,
    method: ep.method,
    path: ep.path,
    description: ep.description,
    readOnly: ep.readOnly,
    body: ep.body,
    query: ep.query,
    response: ep.response,
    example_request: ep.example.request,
    example_response: ep.example.response,
  };
}

/**
 * Human/LLM-facing skill text that describes how to drive the remote browser
 * service. This is the compact prompting artifact handed to an agent instead of
 * the verbose `/api` document.
 */
export function buildRemoteBrowserSkillText(options: {
  host: string;
}): string {
  const { host } = options;
  const doc = buildRemoteBrowserLlmDocument(host);

  const operationLines = doc.operations
    .map((op) => {
      const q = op.params.query.length ? "?" + op.params.query.join("&") : "";
      return "- `" + op.method + " " + op.path + q + "` — " + op.summary + (op.readOnly ? " (read-only)" : "");
    })
    .join("\n");

  return [
    "# Remote Browser Control Skill",
    "",
    "You are operating a local Electron-controlled browser through an HTTP service.",
    "",
    "## Service",
    "- Base URL: `" + host + "`",
    "- Every request returns an envelope: `{ ok, data, meta }`. On success `meta.target` tells you which tab/window/document was touched.",
    "",
    "## Target selection (important)",
    "- Prefer `tabId` to select a tab; `url` and `windowId` are optional helpers.",
    "- Pass a nested `target` object or top-level `tabId`/`windowId`/`url`.",
    "- There is **no silent fallback**: an unknown `tabId` returns `TAB_NOT_FOUND`, ambiguous matches return `AMBIGUOUS_TARGET`, and a closed tab returns `TARGET_CLOSED`.",
    "- On `navigate`, the top-level `url` is the destination; `target.url` selects the current tab.",
    "",
    "## Workflow",
    "1. Open a tab with `POST /browser/open` and reuse the returned `tabId`.",
    "2. Observe: `POST /browser/snapshot` with `output: \"text\"` (add `viewportOnly: true` to keep only what is on screen) returns a compact node listing with `nodeRef`s; `read`/`query` cover single-selector and attribute reads.",
    "3. Act: `click` (default `mode: \"auto\"` — real mouse input when the element is hit-testable, DOM click otherwise), `hover`/`scroll`/`drag`/`key`/`type`, or `evaluate` for arbitrary JS.",
    "4. Read the result: every input and navigation action already settles the page and returns `settled`, `navigated`, `issueCount` and `issues` (console errors plus failed requests produced by that action). Use `POST /browser/wait` only for conditions settling does not cover.",
    "5. Diagnose: `GET /browser/session/events` and `POST /browser/diagnostics` to read console/network/runtime errors before editing code.",
    "6. Locate source: `POST /browser/source/resolve` maps a generated stack location to the original source file via source maps.",
    "",
    "## Operations",
    operationLines,
    "",
  ].join("\n");
}

function schemaProperties(schema: JsonSchema): Readonly<Record<string, JsonSchema>> {
  if (typeof schema !== "object" || schema === null) return {};
  return typeof schema.properties === "object" && schema.properties !== null
    ? (schema.properties as Readonly<Record<string, JsonSchema>>) : {};
}

function schemaParamNames(schema: JsonSchema | null): { all: string[]; required: string[] } {
  if (typeof schema !== "object" || schema === null) return { all: [], required: [] };
  const props = schemaProperties(schema);
  const required = schemaRequired(schema);
  return {
    all: Object.keys(props),
    required: [...required].filter((name) => name in props),
  };
}

function schemaRequired(schema: JsonSchema): ReadonlySet<string> {
  if (typeof schema !== "object" || schema === null || !Array.isArray(schema.required)) return new Set<string>();
  return new Set(schema.required.filter((value): value is string => typeof value === "string"));
}

function openApiQueryParameters(schema: JsonSchema | null): unknown[] {
  if (!schema) return [];
  const required = schemaRequired(schema);
  return Object.entries(schemaProperties(schema)).map(([name, propertySchema]) => ({ name, in: "query", required: required.has(name), schema: propertySchema }));
}

export function buildRemoteBrowserOpenApiDocument(options: OpenApiBuildOptions = {}): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const item of REMOTE_BROWSER_ENDPOINT_CATALOG) {
    const operation: Record<string, unknown> = {
      operationId: item.operationId, summary: item.description, description: item.description,
      tags: [item.path.startsWith("/browser/session/") ? "sessions" : item.path.startsWith("/browser/") ? "browser" : "service"],
      "x-readOnly": item.readOnly,
      parameters: openApiQueryParameters(item.query),
      responses: {
        "200": { description: "Envelope response", content: { "application/json": { schema: item.response, example: item.example.response } } },
        "400": { description: "Invalid request", content: { "application/json": { schema: REMOTE_BROWSER_ENVELOPE_SCHEMA } } },
        "500": { description: "Internal error", content: { "application/json": { schema: REMOTE_BROWSER_ENVELOPE_SCHEMA } } },
      },
    };
    if (item.body) operation.requestBody = { required: true, content: { "application/json": { schema: item.body, example: item.example.request } } };
    const pathItem = paths[item.path] ?? {};
    pathItem[item.method.toLowerCase()] = operation;
    paths[item.path] = pathItem;
  }
  return {
    openapi: "3.1.0", jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: { title: options.title ?? "VsGo Remote Browser API", version: REMOTE_BROWSER_API_VERSION, description: options.description ?? "Local browser automation and diagnostics API." },
    servers: [{ url: options.serverUrl ?? "http://127.0.0.1:18766" }], paths,
    components: {
      schemas: { TargetSelector: TARGET_SELECTOR_SCHEMA, Meta: REMOTE_BROWSER_META_SCHEMA, Error: REMOTE_BROWSER_ERROR_SCHEMA, Envelope: REMOTE_BROWSER_ENVELOPE_SCHEMA, BrowserEvent: REMOTE_BROWSER_EVENT_SCHEMA },
    },
  };
}

export const buildOpenApiDocument = buildRemoteBrowserOpenApiDocument;

