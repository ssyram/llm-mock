import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const artifact = join(root, "target/test-artifacts", `judge-envelope-${Date.now()}-${process.pid}`);
const mock = join(root, "playbook/mock2.mjs");
const judge = `node ${JSON.stringify(join(here, "fixtures/capture-judge.mjs"))}`;
const program = `node ${JSON.stringify(join(here, "fixtures/capture-program.mjs"))}`;
const block = (kind, ...lines) => [`\`\`\`${kind}`, ...lines, "```"].join("\n");
const judgeCase = `- judge: '${judge}'`;

function invoke(playbooks, messages, name, context = {}, cacheDir = null) {
  const judgePath = join(artifact, `${name}-judge.jsonl`);
  const programPath = join(artifact, `${name}-program.jsonl`);
  const input = { api: "openai-completions", model: "mock", request: { compaction: "marker", context: { ...context, messages } } };
  const args = playbooks.flatMap((path) => ["--playbook", path]);
  const cacheArgs = cacheDir ? ["--cache-dir", cacheDir] : ["--no-cache"];
  const result = spawnSync(process.execPath, [mock, ...cacheArgs, ...args], {
    input: JSON.stringify(input), encoding: "utf8", timeout: 15000,
    env: { ...process.env, PLAYBOOK_JUDGE_CAPTURE: judgePath, PLAYBOOK_PROGRAM_CAPTURE: programPath },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  return { output, judgePath, programPath, input };
}

function envelopes(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("judge envelope = transcript path + structural pointer; transcript is the verbatim full request", () => {
  mkdirSync(artifact, { recursive: true });
  const path = join(artifact, "subjects.md");
  writeFileSync(path, [
    block("user", judgeCase),
    block("match", "data: system", "cases:", `  ${judgeCase}`),
    block("match", "data: compaction", "cases:", `  ${judgeCase}`),
    block("segment", `command: '${program}'`, "cases:", `  ${judgeCase}`),
    block("say", "hello"),
    block("call bash", "command: echo ok"),
    block("toolResult", judgeCase),
    block("say", "done"),
    block("user", "- any: true"),
    block("say", "finished"),
  ].join("\n\n"));
  const user = { role: "user", content: [{ type: "text", text: "begin" }], tag: "raw-user" };
  const context = { system: "system-policy" };
  const first = invoke([path], [user], "first", context);
  const call = first.output.content.find((item) => item.type === "toolCall");
  assert.ok(call);
  const tool = { role: "toolResult", toolCallId: call.id, toolName: "bash", content: [{ type: "text", text: "actual result" }], isError: false };
  const prior = [user, { role: "assistant", content: first.output.content }, tool];
  const second = invoke([path], prior, "second", context);
  const messages = [...prior, { role: "assistant", content: second.output.content }, { role: "user", content: "future-secret" }];
  const replay = invoke([path], messages, "replay", context);
  assert.equal(replay.output.content[0].text, "finished");
  const records = envelopes(replay.judgePath);
  assert.equal(records.length, 5, "user + system + compaction + segment result + toolResult judges");
  const [userJudge, systemJudge, compactionJudge, segmentJudge, toolJudge] = records;
  assert.equal(userJudge.pointer, 0, "user judge pointer = user 消息下标");
  assert.equal(systemJudge.subject, "system-policy");
  assert.equal(systemJudge.pointer, 1, "流中 match 判决 pointer = 消费前沿（user 已吸收）");
  assert.equal(JSON.parse(compactionJudge.subject).compaction, "marker");
  assert.equal(segmentJudge.pointer, null, "程序 result 不在 transcript：pointer null + subject");
  assert.equal(segmentJudge.subject, "program-result");
  assert.equal(toolJudge.pointer, 2, "toolResult judge pointer = 回执下标");
  for (const record of records) {
    assert.equal(typeof record.transcript, "string");
    assert.deepEqual(record.file, replay.input, "transcript 文件必须逐字等于完整统一请求（不删元数据）");
    assert.ok(JSON.stringify(record.file).includes("future-secret"), "完整历史可见：pointer 是位置不是权限");
  }
  const external = envelopes(replay.programPath);
  assert.equal(external[0].pointer, 1, "segment 程序初入 = 消费前沿（user 已吸收）");
  assert.equal(external[0].with, undefined);
});

test("entry selector judges receive derived subjects; first user judge pointer = 0", () => {
  mkdirSync(artifact, { recursive: true });
  const path = join(artifact, "entry-subjects.md");
  writeFileSync(path, [block("match", "data: system", "cases:", `  ${judgeCase}`), block("match", "data: compaction", "cases:", `  ${judgeCase}`),
    block("user", judgeCase), block("say", "selected")].join("\n\n"));
  const user = { role: "user", content: "begin", tag: "entry" };
  const result = invoke([path], [user], "entry-subjects", { system: "entry-policy" });
  assert.equal(result.output.content[0].text, "selected");
  const records = envelopes(result.judgePath);
  assert.equal(records.length, 3);
  assert.equal(records[0].subject, "entry-policy");
  assert.equal(JSON.parse(records[1].subject).compaction, "marker");
  assert.equal(records[2].pointer, 0, "入口 user 判决指向启动输入本身");
  for (const record of records) assert.equal(record.pointer, 0, "入口选择期消费前沿 = 0");
});

test("tool-result judge after a cache hit receives the new raw message position only", () => {
  mkdirSync(artifact, { recursive: true });
  const path = join(artifact, "cached-tool.md");
  const cacheDir = join(artifact, "cached-tool-store");
  writeFileSync(path, [block("user", judgeCase), block("call bash", "command: echo ok"),
    block("toolResult", judgeCase), block("say", "done")].join("\n\n"));
  const user = { role: "user", content: "begin" };
  const first = invoke([path], [user], "cache-first", {}, cacheDir).output;
  const call = first.content.find((item) => item.type === "toolCall");
  const tool = { role: "toolResult", toolCallId: call.id, toolName: "bash", content: [{ text: "actual" }] };
  const messages = [user, { role: "assistant", content: first.content }, tool];
  const second = invoke([path], messages, "cache-second", {}, cacheDir);
  assert.equal(second.output.content[0].text, "done");
  const records = envelopes(second.judgePath);
  assert.equal(records.length, 1, "入口 judge 命中后不重跑");
  assert.equal(records[0].pointer, 2, "新回执的下标");
});

test("exact repeated request replays the stored reply without rerunning any judge", () => {
  mkdirSync(artifact, { recursive: true });
  const path = join(artifact, "repeat.md");
  const cacheDir = join(artifact, "repeat-store");
  writeFileSync(path, [block("user", judgeCase), block("say", "hi")].join("\n\n"));
  const user = { role: "user", content: "begin" };
  const first = invoke([path], [user], "repeat-first", {}, cacheDir);
  const again = invoke([path], [user], "repeat-again", {}, cacheDir);
  assert.deepEqual(again.output, first.output, "完全重复请求逐字节重放");
  assert.equal(envelopes(join(artifact, "repeat-again-judge.jsonl")).length, 0, "重放不再执行判决");
});

test("judge faults stay hard errors, never no-match fallthrough", () => {
  mkdirSync(artifact, { recursive: true });
  const path = join(artifact, "fault.md");
  writeFileSync(path, [block("user", `- judge: 'exit 3'`), block("say", "no")].join("\n\n"));
  const result = invoke([path], [{ role: "user", content: "go" }], "fault");
  assert.equal(result.output.error.code, "playbook_judge_error");
});

test.after(() => {
  try { rmSync(artifact, { recursive: true, force: true }); } catch { /* 保留诊断 */ }
});
