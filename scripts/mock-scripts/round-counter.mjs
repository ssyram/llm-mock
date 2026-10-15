#!/usr/bin/env node
// 无状态多轮 mock 范式：轮数不存状态，按 transcript 中 role=assistant 的
// 条数推导——第 r 轮 = assistant 条数 + 1。行为全在本脚本，框架只做协议层。
//
// 用法：node round-counter.mjs [--mode=text|tool]
//   stdin : {"api","keyId","model","sessionSignal","request"}（request.context.messages 为已解码 transcript）
//   stdout: AssistantMessage JSON，或 {"error":{"status","code","message"}}
//
// mode=text（默认）：每轮回文本 "ROUND-r: r"。
// mode=tool：第 1 轮回 toolCall（stopReason=toolUse），第 2 轮起回文本收尾。
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const modeFlag = argv.find((a) => a.startsWith("--mode="));
const mode = modeFlag ? modeFlag.slice("--mode=".length) : "text";
if (mode !== "text" && mode !== "tool") {
  process.stderr.write(`round-counter: unknown mode "${mode}" (expected text|tool)\n`);
  process.exit(1);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch (e) {
  process.stderr.write(`round-counter: cannot parse stdin JSON: ${e}\n`);
  process.exit(1);
}

const messages = input.request?.context?.messages ?? [];
const round = messages.filter((m) => m.role === "assistant").length + 1;

const reply = {
  api: input.api,
  provider: "mockpi",
  model: input.model,
  usage: {
    input: messages.length,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: messages.length + 1,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  timestamp: 0,
};

if (mode === "tool" && round === 1) {
  reply.stopReason = "toolUse";
  reply.content = [
    { type: "toolCall", id: `call_round_${round}`, name: "round_probe", arguments: { round } },
  ];
} else {
  reply.stopReason = "stop";
  reply.content = [{ type: "text", text: `ROUND-${round}: ${round}` }];
}

process.stdout.write(JSON.stringify(reply));
