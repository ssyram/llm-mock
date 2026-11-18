import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMock2Request, unifiedInput } from "../support/run-mock2-request.mjs";
import { runTargetCacheOperation } from "../support/run-target-cache-operation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runRoot = join(process.env.PLAYBOOK_INDEPENDENT_ARTIFACTS ?? resolve(root, "../../../target/test-artifacts/playbook-independent"), `target-cache-${Date.now()}-${process.pid}`);
mkdirSync(runRoot, { recursive: true });
const fixture = (name) => join(root, "fixtures/expected-parse", `${name}.md`);
const calls = (reply) => (reply.content ?? []).filter((block) => block.type === "toolCall");
const continueHistory = (messages, reply) => {
  messages.push({ role: "assistant", content: reply.content });
  for (const call of calls(reply)) messages.push({ role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text: "ok" }] });
};

test("shared cache continuation avoids repeating deterministic probe", () => {
  const artifactDir = join(runRoot, "hot");
  const cacheDir = join(artifactDir, "cache-store");
  const messages = [{ role: "user", content: "begin" }];
  const first = runMock2Request({ playbook: fixture("cache-hit-probe"), input: unifiedInput(messages), artifactDir, cacheDir }).output;
  continueHistory(messages, first);
  const second = runMock2Request({ playbook: fixture("cache-hit-probe"), input: unifiedInput(messages), artifactDir, cacheDir }).output;
  assert.equal(second.error, undefined, JSON.stringify(second));
  assert.equal(JSON.parse(readFileSync(join(artifactDir, "cache-hit-count.json"), "utf8")).count, 1);
});

test("cold rebuild may repeat deterministic observation", () => {
  const artifactDir = join(runRoot, "cold");
  const messages = [{ role: "user", content: "begin" }];
  const first = runMock2Request({ playbook: fixture("cache-hit-probe"), input: unifiedInput(messages), artifactDir }).output;
  continueHistory(messages, first);
  const second = runMock2Request({ playbook: fixture("cache-hit-probe"), input: unifiedInput(messages), artifactDir }).output;
  assert.equal(second.error, undefined, JSON.stringify(second));
  assert.equal(JSON.parse(readFileSync(join(artifactDir, "cache-hit-count.json"), "utf8")).count, 2);
});

test("volatile observation reruns across the barrier without driving business state", () => {
  const artifactDir = join(runRoot, "volatile");
  const cacheDir = join(artifactDir, "cache-store");
  const messages = [{ role: "user", content: "begin" }];
  const first = runMock2Request({ playbook: fixture("cache-volatile"), input: unifiedInput(messages), artifactDir, cacheDir }).output;
  continueHistory(messages, first);
  const second = runMock2Request({ playbook: fixture("cache-volatile"), input: unifiedInput(messages), artifactDir, cacheDir }).output;
  assert.equal(second.error, undefined, JSON.stringify(second));
  assert.equal(JSON.parse(readFileSync(join(artifactDir, "volatile-count.json"), "utf8")).count, 2);
});

test("real cache restore rejects an entry idle for exactly 300000ms", () => {
  const dir = join(runRoot, "ttl-restore");
  cacheOp({ operation: "save", dir, now: 0, fileKeys: ["v1"], messages: ["u"], continuation: { pc: 1 }, volatileCrossed: false });
  const restored = cacheOp({ operation: "restore", dir, now: 300000, fileKeys: ["v1"], messages: ["u"] });
  assert.equal(restored.hit, null);
});

test("real cache cleanup expires at the 300000ms boundary", () => {
  const dir = join(runRoot, "ttl-cleanup");
  cacheOp({ operation: "save", dir, now: 0, fileKeys: ["v1"], messages: ["u"], continuation: { pc: 1 }, volatileCrossed: false });
  cacheOp({ operation: "cleanup", dir, now: 300000 });
  assert.equal(readdirSync(dir).filter((name) => name.endsWith(".json")).length, 0);
});

test("two active request leases protect the same expired entry independently", () => {
  const dir = join(runRoot, "active-lease");
  const keySpace = { files: ["v1"] };
  const messages = ["u"];
  const key = cacheOp({ operation: "key", dir, now: 0, keySpace, messages, upto: 1 }).key;
  cacheOp({ operation: "save", dir, now: 0, keySpace, messages, continuation: { pc: 1 }, volatileCrossed: false });
  const first = cacheOp({ operation: "acquire", dir, now: 0, key, requestId: "request-1", pid: process.pid }).lease;
  const second = cacheOp({ operation: "acquire", dir, now: 1, key, requestId: "request-2", pid: process.pid }).lease;
  assert.ok(first && second && first.file !== second.file);
  cacheOp({ operation: "cleanup", dir, now: 600000 });
  assert.equal(readdirSync(dir).filter((name) => name.endsWith(".json")).length, 1, "live request must survive beyond TTL");
  cacheOp({ operation: "release", dir, now: 600000, lease: first });
  cacheOp({ operation: "cleanup", dir, now: 600000 });
  assert.equal(readdirSync(dir).filter((name) => name.endsWith(".json")).length, 1, "release of one request must not drop the other");
  cacheOp({ operation: "release", dir, now: 600000, lease: second });
  cacheOp({ operation: "cleanup", dir, now: 600000 });
  assert.equal(readdirSync(dir).filter((name) => name.endsWith(".json")).length, 0);
});

function cacheOp(input) {
  return runTargetCacheOperation(root, input);
}
