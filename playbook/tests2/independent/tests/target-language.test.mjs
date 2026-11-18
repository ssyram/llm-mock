import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMock2Request, unifiedInput } from "../support/run-mock2-request.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runRoot = join(process.env.PLAYBOOK_INDEPENDENT_ARTIFACTS ?? resolve(root, "../../../target/test-artifacts/playbook-independent"), `target-language-${Date.now()}-${process.pid}`);
mkdirSync(runRoot, { recursive: true });
const parseFixture = (name) => join(root, "fixtures/expected-parse", `${name}.md`);
const text = (reply) => (reply.content ?? []).filter((block) => typeof block.text === "string").map((block) => block.text).join("\n");
const calls = (reply) => (reply.content ?? []).filter((block) => block.type === "toolCall");

test("whole-value ref preserves structured external value while mixed refs are text", () => {
  const reply = run("value-reference", unifiedInput([{ role: "user", content: "begin" }]), "value-reference");
  const args = calls(reply)[0].arguments;
  assert.deepEqual(args.payload, { enabled: true, items: ["one", "two"] });
  assert.equal(typeof args.caption, "string");
  assert.equal(typeof args.literal, "string");
});

test("recursive imported function returns through EOF", () => {
  const playbook = join(root, "fixtures/runtime/recursive-main.md");
  const reply = runPath(playbook, unifiedInput([{ role: "user", content: "begin" }]), "recursive-eof");
  assert.equal(text(reply), "recursive returned");
});

test("imported and mid-function match system reuse context without consuming user position", () => {
  const artifactDir = join(runRoot, "system-import");
  const messages = [{ role: "user", content: "begin" }];
  const context = { system: "child-policy local-policy" };
  const first = runMock2Request({ playbook: parseFixture("system-import-main"), input: unifiedInput(messages, context), artifactDir }).output;
  assert.equal(text(first), "before import");
  messages.push({ role: "assistant", content: first.content }, { role: "user", content: "continue" });
  const second = runMock2Request({ playbook: parseFixture("system-import-main"), input: unifiedInput(messages, context), artifactDir }).output;
  assert.equal(text(second), "finished");
  assert.equal(readFileSync(join(artifactDir, "system-branch.txt"), "utf8"), "matched");
});

test("reader update persists in real continuation without replacing frame stack", () => {
  const artifactDir = join(runRoot, "reader");
  const cacheDir = join(artifactDir, "cache-store");
  const first = runMock2Request({
    playbook: parseFixture("reader-isolation"),
    input: unifiedInput([{ role: "user", content: "begin" }]),
    artifactDir,
    cacheDir
  }).output;
  assert.equal(first.stopReason, "toolUse");
  const messages = [{ role: "user", content: "begin" }, { role: "assistant", content: first.content },
    { role: "toolResult", toolCallId: "read-1", toolName: "bash", content: [{ type: "text", text: "payload" }] }];
  const reply = runMock2Request({
    playbook: parseFixture("reader-isolation"),
    input: unifiedInput(messages),
    artifactDir,
    cacheDir
  }).output;
  assert.equal(text(reply), "finished");
  const entries = readdirSync(cacheDir).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(cacheDir, name), "utf8")));
  const continuation = entries.find((entry) => entry.continuation?.reader === 3)?.continuation;
  assert.ok(continuation, "no continuation persisted the real pointer=3 (EOF boundary after its receipt)");
  assert.ok(Array.isArray(continuation.frames) && continuation.frames.length === 1);
});

test("ordered matcher executes only the first matching branch", () => {
  const artifactDir = join(runRoot, "ordered");
  const reply = runMock2Request({ playbook: parseFixture("ordered-cases"), input: unifiedInput([{ role: "user", content: "begin now" }]), artifactDir }).output;
  assert.equal(text(reply), "finished");
  assert.equal(readFileSync(join(artifactDir, "ordered-branch.txt"), "utf8"), "first");
});

for (const [marker, expected] of [["explicit-compaction-marker", "classified"], [null, "ordinary"]]) {
  test(`match compaction selects ${expected} without reconstructing history`, () => {
    const artifactDir = join(runRoot, `compaction-${expected}`);
    const input = { api: "openai-completions", keyId: "local", request: { compaction: marker, context: { messages: [{ role: "user", content: "begin" }] } } };
    const reply = runMock2Request({ playbook: parseFixture("compaction-classifier"), input, artifactDir }).output;
    assert.equal(text(reply), "finished");
    assert.equal(readFileSync(join(artifactDir, "compaction-branch.txt"), "utf8"), expected);
  });
}

function run(name, input, label) {
  return runPath(parseFixture(name), input, label);
}

function runPath(playbook, input, label) {
  return runMock2Request({ playbook, input, artifactDir: join(runRoot, label) }).output;
}
