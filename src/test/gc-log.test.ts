import assert from "node:assert/strict";
import test from "node:test";
import type { GcLogEntry } from "../windows/gc/types";
import {
  createGcLogStore,
  isGcLogEntry,
  MAX_LOG_ENTRIES,
  MAX_LOG_READ_BYTES,
  parseLogTail,
  RETENTION_MS,
  // @ts-ignore -- Node 22 strip-types requires the explicit .ts extension at runtime.
} from "../windows/gc/log-policy.ts";

const now = 200_000_000;
function entry(time = now): GcLogEntry {
  return {
    time,
    source: "manual",
    action: "clean",
    message: "cleaned",
    freedMB: 1,
    killed: [{ pid: 42, name: "helper", rssMB: 1 }],
    skipped: [{ pid: 43, name: "protected", reason: "protected" }],
  };
}

function fixture(initial: unknown[] = []) {
  let clock = now;
  let reads = 0;
  const writes: GcLogEntry[][] = [];
  const store = createGcLogStore({
    read: () => {
      reads++;
      return { content: initial.map((item) => JSON.stringify(item)).join("\n"), truncated: false };
    },
    write: (entries) => writes.push(structuredClone(entries)),
    now: () => clock,
  });
  return {
    store,
    writes,
    reads: () => reads,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

test("rejects malformed records and nested process arrays", () => {
  const invalid: unknown[] = [
    null,
    [],
    1,
    "text",
    {},
    { ...entry(), time: null },
    { ...entry(), time: Infinity },
    { ...entry(), source: "other" },
    { ...entry(), action: "other" },
    { ...entry(), message: null },
    { ...entry(), freedMB: -1 },
    { ...entry(), detail: {} },
    { ...entry(), killed: null },
    { ...entry(), killed: [null] },
    { ...entry(), killed: [{}] },
    { ...entry(), killed: [{ pid: 1.5, name: "x", rssMB: 1 }] },
    { ...entry(), killed: [{ pid: 1, name: "x", rssMB: "1" }] },
    { ...entry(), skipped: {} },
    { ...entry(), skipped: [null] },
    { ...entry(), skipped: [{ pid: 1, name: "x", reason: null }] },
  ];
  for (const value of invalid) assert.equal(isGcLogEntry(value), false);
  assert.equal(isGcLogEntry(entry()), true);
  assert.equal(isGcLogEntry({ ...entry(), source: "auto", detail: "details" }), true);
  const parsed = parseLogTail({
    content: [
      ...invalid.map((item) => JSON.stringify(item)),
      "{broken",
      JSON.stringify(entry()),
    ].join("\n"),
    truncated: false,
  });
  assert.deepEqual(parsed.entries, [entry()]);
  assert.equal(parsed.changed, true);
});

test("reads once and only persists on changes, including expiration on get", () => {
  const f = fixture([entry(now - RETENTION_MS), entry()]);
  assert.equal(f.store.get().length, 2);
  f.store.get();
  assert.equal(f.reads(), 1);
  assert.equal(f.writes.length, 0);
  f.advance(1);
  assert.deepEqual(f.store.get(), [entry()]);
  f.store.get();
  assert.equal(f.writes.length, 1);
  f.advance(RETENTION_MS);
  assert.deepEqual(f.store.get(), []);
  f.store.get();
  assert.deepEqual(f.writes, [[entry()], []]);
  assert.equal(f.reads(), 1);
});

test("prunes expired and corrupt records during first read exactly once", () => {
  const f = fixture([null, entry(now - RETENTION_MS - 1), entry()]);
  assert.deepEqual(f.store.get(), [entry()]);
  f.store.get();
  assert.deepEqual(f.writes, [[entry()]]);
  assert.equal(f.reads(), 1);
});

test("keeps the latest 2000 records on load and append", () => {
  const initial = Array.from({ length: MAX_LOG_ENTRIES + 3 }, (_, i) => ({
    ...entry(),
    message: `${i}`,
  }));
  const f = fixture(initial);
  assert.deepEqual(f.store.get(), initial.slice(3));
  f.store.append({ ...entry(), message: "new" });
  const result = f.store.get();
  assert.equal(result.length, MAX_LOG_ENTRIES);
  assert.equal(result[0].message, "4");
  assert.equal(result.at(-1)?.message, "new");
  assert.equal(f.writes.length, 2);
  assert.equal(f.reads(), 1);
});

test("append first initializes cache, and caller mutations do not change cached records", () => {
  const f = fixture([entry()]);
  const added = entry();
  f.store.append(added);
  added.killed[0].name = "mutated";
  const snapshot = f.store.get();
  snapshot[0].skipped[0].reason = "mutated";
  snapshot.pop();
  assert.deepEqual(f.store.get(), [entry(), entry()]);
  assert.equal(f.reads(), 1);
  assert.equal(f.writes.length, 1);
});

test("does not write when an already expired append leaves the cache unchanged", () => {
  const f = fixture([entry()]);
  f.store.append(entry(now - RETENTION_MS - 1));
  assert.deepEqual(f.store.get(), [entry()]);
  assert.equal(f.writes.length, 0);
});

test("clear empties the cache and persists an empty file", () => {
  const f = fixture([entry(), entry(now - 1)]);
  assert.equal(f.store.get().length, 2);
  f.store.clear();
  assert.deepEqual(f.store.get(), []);
  assert.deepEqual(f.writes, [[]]);
  assert.equal(f.reads(), 1);
});

test("parses only complete lines in the simulated 4 MiB tail", () => {
  const input = Buffer.from(
    "x".repeat(MAX_LOG_READ_BYTES + 100) + "\n" + JSON.stringify(entry()) + "\n"
  );
  const tail = input.subarray(-MAX_LOG_READ_BYTES).toString("utf8");
  const parsed = parseLogTail({ content: tail, truncated: true });
  assert.deepEqual(parsed.entries, [entry()]);
  assert.equal(parsed.changed, true);
  assert.deepEqual(parseLogTail({ content: "partial", truncated: true }).entries, []);
  assert.deepEqual(
    parseLogTail({ content: "\n" + JSON.stringify(entry()), truncated: true }).entries,
    [entry()]
  );
});
