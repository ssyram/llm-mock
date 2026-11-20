// 本地对偶：旧 moc18a t/ 真实 Main 会话数据 → 新解释器+adapter 逐请求重放。
// 每个真实 main 决策回显（工具 id/名/参数或文本）必须与重放产出逐字一致；
// action/tool 序列另与旧 controller-calls.jsonl（class=main）逐条对齐。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const domain = join(here, "..");
const mock2 = join(domain, "..", "..", "..", "mock2.mjs");
// 旧会话证据不入库：经 MOC18A_OLD_EVIDENCE 显式给出，缺则显式 skip（不造数据）。
const OLD = process.env.MOC18A_OLD_EVIDENCE || "";
const LANE = mkdtempSync(join(tmpdir(), "pb2-cca-dual-"));

function toUnified(ocMessages, sessionId) {
  const messages = [];
  for (const message of ocMessages) {
    const role = message.info.role;
    const parts = message.parts || [];
    if (role === "user") {
      const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      messages.push({ role: "user", content: text || message.info.summary?.text || "" });
    } else if (role === "assistant") {
      const calls = parts.filter((p) => p.type === "tool" && p.state?.status === "completed")
        .map((p) => ({ id: p.callID, name: p.tool, arguments: p.state.input ?? {} }));
      const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      if (calls.length) {
        messages.push({ role: "assistant", content: calls.map((c) => ({ type: "toolCall", ...c })) });
        for (const part of parts.filter((p) => p.type === "tool" && p.state?.status === "completed")) {
          messages.push({ role: "toolResult", toolCallId: part.callID, toolName: part.tool,
            content: [{ type: "text", text: part.state.output ?? "" }] });
        }
      } else if (text) {
        messages.push({ role: "assistant", content: [{ type: "text", text }] });
      }
    }
  }
  return messages;
}

function askMain(messages, sessionId, systemHead) {
  const input = { api: "openai-completions", model: "bench-mock",
    request: { options: { sessionId },
      context: { messages: systemHead ? [{ role: "system", content: systemHead }, ...messages] : messages } } };
  const run = spawnSync(process.execPath, [mock2, "--playbook", join(domain, "main.md"),
    "--no-cache", "--judge-timeout-ms", "120000"], { input: JSON.stringify(input), encoding: "utf8",
    timeout: 120000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CCA_NEW_LANE: LANE, CCA_NEW_WORKSPACE: join(OLD, "w"),
      CCA_NEW_ROOT_SESSION: sessionId, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test("旧 Main 真实会话在新解释器+冻结业务 adapter 下逐决策重放一致",
     { skip: !OLD || !existsSync(OLD) ? "set MOC18A_OLD_EVIDENCE to the old lane evidence dir (private, not in repo)" : false },
     () => {
  const oc = JSON.parse(readFileSync(join(OLD, "main-messages.json"), "utf8"));
  const calls = readFileSync(join(OLD, "controller-calls.jsonl"), "utf8").trim().split("\n")
    .map((line) => JSON.parse(line)).filter((row) => row.class === "main");
  const sessionId = oc[0].info.sessionID;
  const unified = toUnified(oc, sessionId);
  mkdirSync(join(LANE, "records"), { recursive: true });
  const spec = JSON.parse(readFileSync(
    process.env.MOC18A_INPUT_SPEC || join(OLD, "input-spec.json"),
    "utf8"));
  writeFileSync(join(LANE, "input-spec.json"), JSON.stringify(spec));
  const entries = { analysis: null, eqclass: null };
  const seenEntryNames = new Set();
  for (const message of unified) {
    if (message.role !== "assistant") continue;
    const call = (message.content || []).find((b) => b.type === "toolCall" && b.name === "fsm_enter_fsm");
    if (!call || seenEntryNames.has(call.arguments.name)) continue;
    seenEntryNames.add(call.arguments.name);
    const phase = entries.analysis ? "eqclass" : "analysis";
    entries[phase] = { enter_fsm: call.arguments, prompt: "" };
  }
  assert.ok(entries.analysis && entries.eqclass, "transcript must carry both enter_fsm entries");
  writeFileSync(join(LANE, "entries.json"), JSON.stringify(entries));
  let checked = 0;
  const seen = [];
  for (let index = 0; index < unified.length; index += 1) {
    const message = unified[index];
    if (message.role !== "assistant") continue;
    const content = message.content;
    if (content.some((b) => b.type === "toolCall" && b.name === "StructuredOutput")) continue;
    if (content.some((b) => b.type === "text" && /continue from \d+/.test(b.text))) continue;
    const reply = askMain(unified.slice(0, index), sessionId);
    assert.equal(reply.error, undefined, `@index ${index}: ${JSON.stringify(reply.error || {})}`);
    assert.deepEqual(reply.content, content, `决策回显不一致 @message ${index}`);
    checked += 1;
    seen.push(content.some((b) => b.type === "toolCall") ? content.find((b) => b.type === "toolCall").name : "text");
  }
  assert.ok(checked >= 30, `重放决策数 ${checked} 异常偏小`);
  const expected = calls.map((row) => (row.action === "text" ? "text" : row.tool));
  assert.deepEqual(seen, expected, "action/tool 序列与旧 controller-calls 不一致");
  rmSync(LANE, { recursive: true, force: true });
});
