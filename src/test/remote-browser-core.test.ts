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
import { waitForConditions } from "../windows/browser/electron/remote-browser-wait.ts";
import {
  REMOTE_BROWSER_ENDPOINT_CATALOG,
  buildRemoteBrowserOpenApiDocument,
  // @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
} from "../windows/browser/electron/remote-browser-schema.ts";

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
