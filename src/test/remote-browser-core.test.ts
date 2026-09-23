import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiFault,
  RingBuffer,
  assertSafeNavigationUrl,
  generateRequestId,
  httpStatusForFault,
  parseTargetSelector,
  readBooleanParameter,
  readIntegerParameter,
  readStringParameter,
  serializeJsonResponse,
  // @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
} from "../windows/browser/electron/remote-browser-core.ts";
// @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
import {
  waitForConditions,
  waitForPageSettle,
  // @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
} from "../windows/browser/electron/remote-browser-wait.ts";
import {
  REMOTE_BROWSER_ENDPOINT_CATALOG,
  buildRemoteBrowserOpenApiDocument,
  // @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
} from "../windows/browser/electron/remote-browser-schema.ts";

// @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
import {
  buildElementActionScript,
  buildQueryScript,
  buildSnapshotScript,
  buildTrustedInputProbeScript,
  formatSnapshotText,
  // @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
} from "../windows/browser/electron/remote-browser-page-tools.ts";

function assertFault(action: () => unknown, code: string, status = 400): ApiFault {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof ApiFault);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
  try {
    action();
  } catch (error) {
    return error as ApiFault;
  }
  throw new assert.AssertionError({ message: "Expected action to throw" });
}

test("RingBuffer assigns monotonic sequences and detects an expired cursor", () => {
  const ring = new RingBuffer<string>(3);
  assert.deepEqual(ring.push("a"), { seq: 1, value: "a" });
  ring.push("b");
  ring.push("c");
  ring.push("d");

  assert.equal(ring.oldestSeq, 2);
  assert.equal(ring.newestSeq, 4);
  assert.equal(ring.hasTruncated(0), true);
  assert.equal(ring.hasTruncated(1), false);
  assert.deepEqual(ring.readAfter(0), {
    items: [
      { seq: 2, value: "b" },
      { seq: 3, value: "c" },
      { seq: 4, value: "d" },
    ],
    cursor: 4,
    oldestSeq: 2,
    newestSeq: 4,
    truncated: true,
    hasMore: false,
  });
});

test("RingBuffer reports pagination separately from retention truncation", () => {
  const ring = new RingBuffer<number>(4, 10);
  [10, 11, 12].forEach((value) => ring.append(value));

  const first = ring.readAfter(9, 2);
  assert.deepEqual(first.items.map((item) => item.seq), [10, 11]);
  assert.equal(first.truncated, false);
  assert.equal(first.hasMore, true);
  assert.equal(first.cursor, 11);
  assert.deepEqual(ring.readAfter(first.cursor).items.map((item) => item.seq), [12]);

  assertFault(() => ring.readAfter(13), "VALIDATION_ERROR");
  assertFault(() => new RingBuffer(0), "VALIDATION_ERROR");
  assertFault(() => ring.readAfter(9, 0), "VALIDATION_ERROR");
});

test("TargetSelector supports top-level and nested target fields", () => {
  assert.deepEqual(parseTargetSelector({ tabId: "tab-1", windowId: 3 }), {
    tabId: "tab-1",
    windowId: 3,
  });
  assert.deepEqual(parseTargetSelector({ target: { tabId: "tab-2", url: "https://example.test" } }), {
    tabId: "tab-2",
    url: "https://example.test",
  });
  assert.deepEqual(parseTargetSelector({ tabId: "same", target: { tabId: "same" } }), {
    tabId: "same",
  });
});

test("TargetSelector rejects conflicts and malformed nested selectors", () => {
  const conflict = assertFault(
    () => parseTargetSelector({ tabId: "top", target: { tabId: "nested" } }),
    "VALIDATION_ERROR"
  );
  assert.deepEqual(conflict.details, {
    parameter: "tabId",
    topLevel: "top",
    target: "nested",
  });
  assertFault(() => parseTargetSelector({ target: null }), "VALIDATION_ERROR");
  assertFault(() => parseTargetSelector({ windowId: 1.5 }), "VALIDATION_ERROR");
  assertFault(() => parseTargetSelector({ target: { tabId: "" } }), "VALIDATION_ERROR");
});

test("strict parameter readers never coerce scalar values", () => {
  assert.equal(readStringParameter({ name: "ok" }, "name", { required: true }), "ok");
  assert.equal(readIntegerParameter({ count: 0 }, "count", { minimum: 0 }), 0);
  assert.equal(readBooleanParameter({ enabled: false }, "enabled", { required: true }), false);
  assert.equal(readStringParameter({}, "missing"), undefined);
  assert.equal(readIntegerParameter({}, "count", { defaultValue: 7 }), 7);

  assertFault(() => readStringParameter({ name: 12 }, "name"), "VALIDATION_ERROR");
  assertFault(() => readIntegerParameter({ count: "12" }, "count"), "VALIDATION_ERROR");
  assertFault(() => readIntegerParameter({ count: 1.2 }, "count"), "VALIDATION_ERROR");
  assertFault(() => readBooleanParameter({ enabled: "false" }, "enabled"), "VALIDATION_ERROR");
  assertFault(() => readBooleanParameter({ enabled: null }, "enabled"), "VALIDATION_ERROR");
  assertFault(() => readStringParameter({}, "name", { required: true }), "VALIDATION_ERROR");
});

test("URL policy permits only browser-safe schemes by default", () => {
  assert.equal(assertSafeNavigationUrl("https://example.test/a?q=1"), "https://example.test/a?q=1");
  assert.equal(assertSafeNavigationUrl("http://localhost:3000"), "http://localhost:3000/");
  assert.equal(assertSafeNavigationUrl("about:blank"), "about:blank");
  assert.equal(assertSafeNavigationUrl("vsgo://settings/home"), "vsgo://settings/home");

  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "chrome://settings",
    "devtools://devtools/bundled/inspector.html",
    "https://user:secret@example.test",
    "about:config",
    "ftp://example.test/file",
  ]) {
    assertFault(() => assertSafeNavigationUrl(url), "VALIDATION_ERROR");
  }
  assertFault(() => assertSafeNavigationUrl(" https://example.test"), "VALIDATION_ERROR");
});

test("allowUnsafe widens schemes but never permits high-risk schemes or credentials", () => {
  assert.equal(
    assertSafeNavigationUrl("ftp://example.test/file", { allowUnsafe: true }),
    "ftp://example.test/file"
  );
  assert.equal(assertSafeNavigationUrl("custom:thing", { allowUnsafe: true }), "custom:thing");
  assertFault(
    () => assertSafeNavigationUrl("javascript:alert(1)", { allowUnsafe: true }),
    "VALIDATION_ERROR"
  );
  assertFault(
    () => assertSafeNavigationUrl("https://user@example.test", { allowUnsafe: true }),
    "VALIDATION_ERROR"
  );
});

test("ApiFault maps statuses and serializes consistently", () => {
  assert.equal(httpStatusForFault("TAB_NOT_FOUND"), 404);
  assert.equal(httpStatusForFault("AMBIGUOUS_TARGET"), 409);
  assert.equal(httpStatusForFault("SOMETHING_UNKNOWN"), 500);
  const fault = new ApiFault("TAB_NOT_FOUND", "No such tab", { tabId: "missing" });
  assert.deepEqual(fault.toJSON(), {
    code: "TAB_NOT_FOUND",
    message: "No such tab",
    details: { tabId: "missing" },
  });
});

test("request IDs are unique and machine-readable", () => {
  const first = generateRequestId();
  const second = generateRequestId();
  assert.match(first, /^req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
});

test("JSON serialization enforces UTF-8 byte limits and returns valid truncation envelopes", () => {
  const normal = serializeJsonResponse({ ok: true }, { maxBytes: 64 });
  assert.equal(normal.body, '{"ok":true}');
  assert.equal(normal.truncated, false);

  const value = { text: "汉字🙂".repeat(100) };
  const full = serializeJsonResponse(value);
  const shortened = serializeJsonResponse(value, { maxBytes: 120, truncate: true });
  assert.equal(shortened.truncated, true);
  assert.ok(shortened.bytes <= 120);
  assert.ok(shortened.originalBytes > shortened.bytes);
  assert.deepEqual(shortened.originalBytes, full.bytes);
  const parsed = JSON.parse(shortened.body) as { truncated: boolean; originalBytes: number; preview: string };
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.originalBytes, full.bytes);
  assert.equal(typeof parsed.preview, "string");

  assertFault(
    () => serializeJsonResponse(value, { maxBytes: 120 }),
    "RESPONSE_TOO_LARGE",
    413
  );
  assertFault(
    () => serializeJsonResponse(value, { maxBytes: 2, truncate: true }),
    "RESPONSE_TOO_LARGE",
    413
  );
});

test("waitForConditions reports observations for URL and expression conditions", async () => {
  const result = await waitForConditions(
    {
      evaluate: async (expression) => expression === "ready",
      getUrl: () => "https://example.test/ready",
      getActivity: () => ({
        pendingNetwork: 0,
        lastNetworkActivity: Date.now() - 1_000,
        lastRuntimeErrorAt: null,
      }),
      getEvents: () => [],
      getLatestSequence: () => 0,
    },
    [
      { type: "url", value: "/ready", match: "contains" },
      { type: "expression", expression: "ready" },
    ],
    { timeoutMs: 100 }
  );
  assert.equal(result.matched, true);
  assert.equal(result.observations.every((item) => item.matched), true);
});

test("waitForConditions returns the last observation when timing out", async () => {
  const result = await waitForConditions(
    {
      evaluate: async () => false,
      getUrl: () => "https://example.test/loading",
      getActivity: () => ({
        pendingNetwork: 1,
        lastNetworkActivity: Date.now(),
        lastRuntimeErrorAt: null,
      }),
      getEvents: () => [],
      getLatestSequence: () => 0,
    },
    [{ type: "networkIdle", idleMs: 200, maxInflight: 0 }],
    { timeoutMs: 20, pollIntervalMs: 5 }
  );
  assert.equal(result.matched, false);
  assert.equal(result.observations[0].type, "networkIdle");
  assert.equal(result.observations[0].matched, false);
});

test("remote browser endpoint catalog is unique and fully represented in OpenAPI", () => {
  const routeKeys = REMOTE_BROWSER_ENDPOINT_CATALOG.map(
    (endpoint) => `${endpoint.method} ${endpoint.path}`
  );
  assert.equal(new Set(routeKeys).size, routeKeys.length);
  const operationIds = REMOTE_BROWSER_ENDPOINT_CATALOG.map((endpoint) => endpoint.operationId);
  assert.equal(new Set(operationIds).size, operationIds.length);

  const openapi = buildRemoteBrowserOpenApiDocument() as {
    openapi: string;
    paths: Record<string, Record<string, unknown>>;
  };
  assert.equal(openapi.openapi, "3.1.0");
  for (const endpoint of REMOTE_BROWSER_ENDPOINT_CATALOG) {
    assert.ok(openapi.paths[endpoint.path]?.[endpoint.method.toLowerCase()]);
  }
});

test("snapshot text projection keeps nodeRefs and actionable state only", () => {
  const text = formatSnapshotText({
    documentId: "doc_abc",
    url: "https://example.com/",
    title: "Example   Domain",
    interactiveCount: 2,
    offscreenCount: 3,
    viewportOnly: true,
    truncated: false,
    viewport: { width: 1440, height: 900, scrollX: 0, scrollY: 0 },
    nodes: [
      {
        nodeRef: "doc_abc:n1",
        depth: 0,
        role: "button",
        name: "Submit",
        tag: "button",
        inViewport: true,
        visible: true,
        interactive: true,
      },
      {
        nodeRef: "doc_abc:n2",
        depth: 1,
        tag: "input",
        name: "Email",
        value: "a@b.com",
        disabled: true,
        inViewport: false,
        visible: true,
      },
      {
        nodeRef: "doc_abc:n3",
        parentNodeRef: "doc_abc:n2",
        depth: 4,
        role: "link",
        tag: "a",
        name: "Reset",
        options: [{ value: "a", text: "Alpha" }, { value: "b", text: "Beta" }],
        optionCount: 5,
        inViewport: true,
        visible: true,
      },
    ],
  });
  const lines = text.split("\n");

  assert.equal(lines[0], "https://example.com/ - Example Domain");
  assert.match(lines[1] ?? "", /nodes=3 interactive=2 viewport=1440x900 viewportOnly=true offscreenOmitted=3/);
  assert.match(lines[2] ?? "", /doc_abc:n<id>/);
  assert.equal(lines[3], '[n1] button "Submit"');
  // n2 sits at the top level because its ancestors are not part of the listing, so indenting
  // it by its real DOM depth would claim a parent it does not have in the projection.
  assert.equal(lines[4], '[n2] input "Email" (offscreen, disabled, value="a@b.com")');
  assert.equal(
    lines[5],
    '  [n3] link "Reset" (options=["Alpha", "Beta", ...3 more])'
  );
  assert.match(text, /3 matching nodes are outside the viewport/);
});

test("snapshot text marks affordance-only controls and keeps text nodes readable", () => {
  const text = formatSnapshotText({
    documentId: "doc_x",
    url: "https://example.com/form",
    interactiveCount: 3,
    nodes: [
      {
        nodeRef: "doc_x:n1",
        depth: 0,
        role: "div",
        tag: "div",
        // Mixed inline content: the sentence is only complete with the surrounding text.
        text: 'Enter "Ada" into the field and press Submit.',
        inViewport: true,
        visible: true,
      },
      {
        nodeRef: "doc_x:n2",
        parentNodeRef: "doc_x:n1",
        depth: 1,
        role: "span",
        tag: "span",
        name: "Ada",
        interactive: true,
        inViewport: true,
        visible: true,
      },
      {
        nodeRef: "doc_x:n3",
        depth: 0,
        role: "button",
        tag: "button",
        name: "Submit",
        interactive: true,
        inViewport: true,
        visible: true,
      },
    ],
  });
  const lines = text.split("\n");
  assert.equal(lines[3], '[n1] div text="Enter "Ada" into the field and press Submit."');
  // A span that behaves like a control carries the flag, a real button does not need it.
  assert.equal(lines[4], '  [n2] span "Ada" (clickable)');
  assert.equal(lines[5], '[n3] button "Submit"');
});

test("page settle resolves from the renderer answer", async () => {
  const result = await waitForPageSettle(
    {
      evaluate: async () => ({ settled: true, waitedMs: 120, mutations: 7 }),
      getUrl: () => "https://example.test/",
      getActivity: () => ({ pendingNetwork: 0, lastNetworkActivity: Date.now(), lastRuntimeErrorAt: null }),
      getEvents: () => [],
      getLatestSequence: () => 0,
    },
    { quietMs: 150, timeoutMs: 300 }
  );
  assert.equal(result.settled, true);
  assert.equal(result.waitedMs, 120);
  assert.equal(result.mutations, 7);
  assert.equal(result.quietMs, 150);
});

test("page settle reports a page-side error without throwing", async () => {
  const result = await waitForPageSettle(
    {
      evaluate: async () => {
        throw new Error("Script failed to execute");
      },
      getUrl: () => "https://example.test/",
      getActivity: () => ({ pendingNetwork: 0, lastNetworkActivity: Date.now(), lastRuntimeErrorAt: null }),
      getEvents: () => [],
      getLatestSequence: () => 0,
    },
    { quietMs: 150, timeoutMs: 300 }
  );
  assert.equal(result.settled, false);
  assert.match(result.error ?? "", /Script failed to execute/);
});

test("page settle never hangs when navigation destroys the execution context", async () => {
  // Electron's executeJavaScript promise stays pending forever in this case, which would
  // otherwise pin every action that triggers a navigation until the transport deadline.
  const startedAt = Date.now();
  const result = await waitForPageSettle(
    {
      evaluate: () => new Promise<never>(() => {}),
      getUrl: () => "https://example.test/",
      getActivity: () => ({ pendingNetwork: 0, lastNetworkActivity: Date.now(), lastRuntimeErrorAt: null }),
      getEvents: () => [],
      getLatestSequence: () => 0,
    },
    { quietMs: 100, timeoutMs: 100 }
  );
  const elapsed = Date.now() - startedAt;
  assert.equal(result.settled, false);
  assert.match(result.error ?? "", /did not answer/);
  assert.ok(elapsed < 2_000, `settle took ${elapsed}ms`);
});

test("page scripts embed their own registry bootstrap", () => {
  // These builders stringify self-contained page functions; a missing prelude compiles
  // fine but throws inside the renderer.
  const scripts = [
    buildSnapshotScript({
      documentId: "doc_abc",
      format: "accessibility",
      interactiveOnly: false,
      includeHidden: false,
      maxNodes: 10,
      maxTextLength: 100,
    }),
    buildElementActionScript({ nodeRef: "doc_abc:n1" }, "inspect"),
    buildQueryScript({ documentId: "doc_abc", selector: "button", limit: 5, includeNodeRefs: true }),
  ];
  for (const script of scripts) {
    assert.match(script, /vsgo\.remote-browser\.nodes/);
    assert.match(script, /const registry = /);
  }
  // The element action script resolves refs through the shared table, not a local Map.
  assert.match(scripts[1], /registry\.byRef\(/);
  // Traversal must not re-scan the whole table to learn the highest ordinal.
  assert.doesNotMatch(scripts[0], /for \(const \[ref, element\] of registry\)/);
  assert.match(scripts[0], /registry\.prune\(\)/);
  // Affordance detection: elements that only look clickable are only reachable through the
  // pointer-cursor probe, and it has to compare against the parent to avoid inheriting.
  assert.match(scripts[0], /looksClickable/);
  assert.match(scripts[0], /getComputedStyle\(element\)\.cursor/);
  assert.match(scripts[0], /cursorOf\(parent\)/);
  // A select reports its options and does not restate them as its own name or text.
  assert.match(scripts[0], /areOptionsRendered/);
  // The click has to land on what a pointer would hit, not on the node itself.
  assert.match(scripts[1], /activateLikeUser/);
  assert.match(scripts[1], /document\.elementFromPoint/);
  assert.match(scripts[1], /hit: "descendant"/);
  // A select accepts a label, and an unmatched one reports the available options.
  assert.match(scripts[1], /no option matches value/);
  assert.match(scripts[1], /availableOptions/);
  assert.match(scripts[1], /element instanceof HTMLOptionElement/);
});

test("trusted input probe is self-contained and counts only trusted events", () => {
  const script = buildTrustedInputProbeScript();
  assert.match(script, /isTrusted/);
  assert.match(script, /mousedown/);
  assert.match(script, /keydown/);
  // It must run in a page without any other helper being present.
  const counter = new Function(
    "document",
    "window",
    "Symbol",
    "Object",
    `return ${script};`
  );
  const document = { addEventListener: () => undefined };
  const value = counter(document, {}, Symbol, Object);
  assert.equal(value, 0);
});
