import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { runMock2Request } from "../support/run-mock2-request.mjs";
import { runTargetCacheOperation } from "../support/run-target-cache-operation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runRoot = join(process.env.PLAYBOOK_INDEPENDENT_ARTIFACTS ?? resolve(root, "../../../target/test-artifacts/playbook-independent"), `target-cache-rework-${Date.now()}-${process.pid}`);
mkdirSync(runRoot, { recursive: true });
const fixture = join(root, "fixtures/expected-parse/cache-hit-probe.md");

for (const field of ["system", "tools", "options"]) {
  test(`cache namespace changes when request ${field} changes`, () => {
    const artifactDir = join(runRoot, `namespace-${field}`);
    const cacheDir = join(artifactDir, "cache-store");
    const messages = [{ role: "user", content: "begin" }];
    const first = runMock2Request({ playbook: fixture, input: inputOf(messages, {}), artifactDir, cacheDir }).output;
    continueHistory(messages, first);
    const changed = field === "system" ? { system: "changed" }
      : field === "tools" ? { tools: [{ name: "other-tool" }] }
      : { options: { executionMode: "changed" } };
    const second = runMock2Request({ playbook: fixture, input: inputOf(messages, changed), artifactDir, cacheDir }).output;
    assert.equal(second.error, undefined, JSON.stringify(second));
    assert.equal(JSON.parse(readFileSync(join(artifactDir, "cache-hit-count.json"), "utf8")).count, 2, `${field} change reused stale continuation`);
  });
}

test("external program content change invalidates cached continuation", () => {
  const artifactDir = join(runRoot, "dependency-version");
  const cacheDir = join(artifactDir, "cache-store");
  mkdirSync(artifactDir, { recursive: true });
  const playbook = join(artifactDir, "flow.md");
  const program = join(artifactDir, "program.mjs");
  writeFileSync(playbook, dependencyPlaybook);
  writeProgram(program, "v1");
  const messages = [{ role: "user", content: "begin" }];
  const first = runMock2Request({ playbook, input: inputOf(messages, {}), artifactDir, cacheDir }).output;
  continueHistory(messages, first);
  writeProgram(program, "v2");
  const second = runMock2Request({ playbook, input: inputOf(messages, {}), artifactDir, cacheDir }).output;
  assert.equal(second.error, undefined, JSON.stringify(second));
  assert.deepEqual(JSON.parse(readFileSync(join(artifactDir, "dependency-observation.json"), "utf8")).versions, ["v1", "v2"]);
});

test("scheduleCleanup dispatches the real independent worker", async () => {
  const dir = join(runRoot, "cleanup-worker");
  mkdirSync(dir, { recursive: true });
  for (let index = 0; index < 1000; index += 1) {
    writeFileSync(join(dir, `${String(index).padStart(5, "0")}.json`), JSON.stringify({ usedAt: 0 }));
  }
  const child = spawn(process.execPath, [join(root, "adapters/target-cache-operation.mjs")], {
    env: { ...process.env, PLAYBOOK_ROOT: process.env.PLAYBOOK_ROOT },
    stdio: ["pipe", "pipe", "pipe"]
  });
  child.stdin.end(JSON.stringify({ operation: "scheduleCleanup", dir, now: 300000 }));
  let sawWorkerLock = false;
  for (let attempt = 0; attempt < 2000 && child.exitCode === null; attempt += 1) {
    if (existsSync(join(dir, ".cleanup-lock"))) sawWorkerLock = true;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  if (child.exitCode === null) await once(child, "exit");
  assert.equal(child.exitCode, 0);
  assert.deepEqual(runTargetCacheOperation(root, { operation: "scheduleCleanup", dir, now: 300000 }), { scheduled: true });
  for (let attempt = 0; attempt < 4000 && readdirSync(dir).some((name) => name.endsWith(".json")); attempt += 1) {
    if (existsSync(join(dir, ".cleanup-lock"))) sawWorkerLock = true;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(sawWorkerLock, true, "target worker lock was never observed");
  assert.equal(readdirSync(dir).filter((name) => name.endsWith(".json")).length, 0);
});

function inputOf(messages, overrides) {
  return {
    api: "openai-completions",
    model: "mock-m",
    keyId: "cache-rework",
    request: {
      context: {
        messages,
        system: overrides.system ?? "base-system",
        tools: overrides.tools ?? [{ name: "bash" }]
      },
      options: overrides.options ?? { executionMode: "base" }
    }
  };
}

function continueHistory(messages, reply) {
  messages.push({ role: "assistant", content: reply.content });
  for (const call of reply.content.filter((block) => block.type === "toolCall")) {
    messages.push({ role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text: "ok" }] });
  }
}

function writeProgram(path, version) {
  writeFileSync(path, `import { readFileSync, writeFileSync } from "node:fs";\nimport { join } from "node:path";\nconst file=join(process.env.PLAYBOOK_TEST_ARTIFACT_DIR,"dependency-observation.json");\nlet value={versions:[]};try{value=JSON.parse(readFileSync(file,"utf8"))}catch(error){if(error.code!=="ENOENT")throw error}\nvalue.versions.push(${JSON.stringify(version)});writeFileSync(file,JSON.stringify(value));process.stdout.write(JSON.stringify({result:"ready"}));\n`);
}

const dependencyPlaybook = [
  "```user", "- exact: begin", "```", "",
  "```internal", "command: node program.mjs", "cases:", "  - exact: ready", "```", "",
  "```say", "dependency", "```", "",
  "```call bash", "command: printf dependency", "```", "",
  "```toolResult", "- otherwise: true", "```", "",
  "```say", "finished", "```", ""
].join("\n");
