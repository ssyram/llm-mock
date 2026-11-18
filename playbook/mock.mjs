#!/usr/bin/env node
// markdown-playbook 挂载入口（薄 wrapper）：读框架 stdin 统一 JSON，输出
// AssistantMessage 或 {"error":{...}}。剧本从 Markdown 文件解析，每次请求
// 全量重建，适配 mock-llm-server "每请求一个新进程"的脚本契约。
// 可重复 --playbook 挂载多剧本：按 argv 顺序对首条 user 输入路由（见
// route-scripts.mjs）；--judge-timeout-ms 覆盖 judge 子进程默认超时（10s）。
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parsePlaybook } from "./parse-markdown.mjs";
import { runPlaybook } from "./playbook-runtime.mjs";
import { selectPlaybook } from "./route-scripts.mjs";
import { DEFAULT_JUDGE_TIMEOUT_MS } from "./judge-exec.mjs";

const usage = "usage: node mock.mjs --playbook <a.md> [--playbook <b.md> …] [--judge-timeout-ms <n>]";
const args = process.argv.slice(2);
const playbookPaths = [];
let judgeTimeoutMs = DEFAULT_JUDGE_TIMEOUT_MS;
let sawJudgeTimeout = false;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--playbook" && args[i + 1]) {
		playbookPaths.push(args[++i]);
	} else if (args[i] === "--judge-timeout-ms" && args[i + 1]) {
		if (sawJudgeTimeout) {
			process.stderr.write(`markdown-playbook: --judge-timeout-ms given more than once; conflicting flags must fail loudly instead of last-wins\n${usage}\n`);
			process.exit(1);
		}
		sawJudgeTimeout = true;
		const parsed = Number.parseInt(args[i + 1], 10);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			process.stderr.write(`markdown-playbook: --judge-timeout-ms must be a positive integer, got ${args[i + 1]}\n${usage}\n`);
			process.exit(1);
		}
		judgeTimeoutMs = parsed;
		i++;
	} else {
		process.stderr.write(`markdown-playbook: unknown argument(s): ${args[i]}\n${usage}\n`);
		process.exit(1);
	}
}
if (playbookPaths.length === 0) {
	process.stderr.write(`markdown-playbook: at least one --playbook is required\n${usage}\n`);
	process.exit(1);
}

const configError = (message) => {
	process.stdout.write(JSON.stringify({ error: { status: 422, code: "playbook_invalid", message } }));
	process.exit(0);
};

const entries = [];
for (const path of playbookPaths) {
	let steps;
	try {
		steps = parsePlaybook(readFileSync(path, "utf8"));
	} catch (error) {
		configError(`${path}: ${error.message}`);
	}
	if (playbookPaths.length > 1 && steps[0]?.kind !== "user") {
		configError(`${path}: multi-playbook mounts require every playbook to start with a user block so the first input can route (first step here is ${steps[0]?.kind ?? "none"})`);
	}
	entries.push({ path, steps, options: { playbookPath: path, judgeCwd: dirname(path), judgeTimeoutMs } });
}

let input;
try {
	input = JSON.parse(readFileSync(0, "utf8"));
} catch (error) {
	process.stderr.write(`markdown-playbook: cannot parse stdin JSON: ${error}\n`);
	process.exit(1);
}

let outcome;
if (entries.length === 1) {
	outcome = runPlaybook(entries[0].steps, input, entries[0].options);
} else {
	const selection = selectPlaybook(entries, input?.request?.context?.messages ?? []);
	outcome = selection.error ? selection : runPlaybook(selection.selected.steps, input, selection.selected.options);
}
if (outcome.error) process.stderr.write(`markdown-playbook: ${outcome.error.code}: ${outcome.error.message}\n`);
process.stdout.write(JSON.stringify(outcome.reply ?? { error: outcome.error }));
