import test from "node:test";
import assert from "node:assert/strict";
import { ReferencePrefixCache } from "../oracle/prefix-cache-reference.mjs";

const namespace = { program: "v1", system: "s", tools: ["bash"] };

test("reference oracle: cold miss becomes a longest-prefix hit", () => {
  const cache = new ReferencePrefixCache();
  assert.equal(cache.acquire(namespace, ["u1"], 0), null);
  cache.put({ namespace, prefix: ["u1"], continuation: { pc: 2 }, now: 0 });
  cache.put({ namespace, prefix: ["u1", "a1"], continuation: { pc: 4 }, now: 1 });
  const lease = cache.acquire(namespace, ["u1", "a1", "u2"], 2);
  assert.equal(lease.matchedLength, 2);
  assert.deepEqual(lease.continuation, { pc: 4 });
  lease.release();
});

test("reference oracle: program and input namespace changes force cold rebuild", () => {
  const cache = new ReferencePrefixCache();
  cache.put({ namespace, prefix: ["u1"], continuation: { pc: 2 }, now: 0 });
  assert.equal(cache.acquire({ ...namespace, program: "v2" }, ["u1"], 1), null);
  assert.equal(cache.acquire({ ...namespace, system: "changed" }, ["u1"], 1), null);
  assert.equal(cache.acquire({ ...namespace, tools: ["other"] }, ["u1"], 1), null);
});

test("reference oracle: forks receive isolated continuations", () => {
  const cache = new ReferencePrefixCache();
  cache.put({ namespace, prefix: ["u1"], continuation: { frames: [{ vars: { count: 1 } }] }, now: 0 });
  const left = cache.acquire(namespace, ["u1", "left"], 1);
  const right = cache.acquire(namespace, ["u1", "right"], 1);
  left.continuation.frames[0].vars.count = 9;
  assert.equal(right.continuation.frames[0].vars.count, 1);
  left.release();
  right.release();
});

test("reference oracle: volatile checkpoints at or after the barrier are never reused", () => {
  const cache = new ReferencePrefixCache();
  cache.put({ namespace, prefix: ["u1"], continuation: { pc: 1 }, checkpointIndex: 1, volatileAt: 2, now: 0 });
  cache.put({ namespace, prefix: ["u1", "volatile"], continuation: { pc: 2 }, checkpointIndex: 2, volatileAt: 2, now: 0 });
  cache.put({ namespace, prefix: ["u1", "volatile", "after"], continuation: { pc: 3 }, checkpointIndex: 3, volatileAt: 2, now: 0 });
  const lease = cache.acquire(namespace, ["u1", "volatile", "after", "new"], 1);
  assert.equal(lease.matchedLength, 1);
  assert.equal(lease.continuation.pc, 1);
  lease.release();
});

test("reference oracle: inactive entries expire at the five-minute boundary", async () => {
  const cache = new ReferencePrefixCache({ ttlMs: 300000 });
  cache.put({ namespace, prefix: ["u1"], continuation: { pc: 1 }, now: 0 });
  assert.equal(cache.acquire(namespace, ["u1"], 300000), null);
  await cache.cleanup(300000);
  assert.equal(cache.entries.length, 0);
});

test("reference oracle: active expired entries survive and cleanup is single-flight", async () => {
  const cache = new ReferencePrefixCache({ ttlMs: 10 });
  cache.put({ namespace, prefix: ["u1"], continuation: { pc: 1 }, now: 0 });
  const lease = cache.acquire(namespace, ["u1"], 5);
  const first = cache.cleanup(20);
  const second = cache.cleanup(20);
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(cache.cleanupRuns, 1);
  assert.equal(cache.entries.length, 1);
  lease.release();
  await cache.cleanup(31);
  assert.equal(cache.entries.length, 0);
});
