// aggregator/segment 外接程序执行器：与 judge 同样由播放器（本 mock 脚本
// 进程）以 spawnSync(shell) 执行，绝不作为工具交给宿主模型。契约：
// stdin = JSON envelope（context/messages 前缀 + location；aggregator 另有
// results），退出码必须为 0；aggregator 的 stdout 是自由文本（结果字符串，
// 去掉恰好一个结尾换行）；segment 的 stdout 必须是 {"assistant":{content,
// stopReason}}（向宿主生成 assistant 消息继续交互）或 {"result": <string>}
//（内部完成返回值，绝不泄露为 assistant 消息）二选一的 JSON。非零退出、
// 超时、无法启动、segment 输出不合法 ⇒ playbook_program_error 硬停，
// 绝不 fallback。超时与 judge 共用 --judge-timeout-ms（同一类外接程序）。
import { spawnSync } from "node:child_process";

export const DEFAULT_PROGRAM_TIMEOUT_MS = 10000;

const snippet = (text, cap = 200) => {
	const flat = String(text ?? "").replace(/\s+/g, " ");
	return flat.length > cap ? `${flat.slice(0, cap)}…` : flat;
};

const programError = (message) => ({ error: { status: 422, code: "playbook_program_error", message } });

export function runExternalProgram(command, envelope, { cwd, timeoutMs = DEFAULT_PROGRAM_TIMEOUT_MS }) {
	let result;
	try {
		result = spawnSync(command, { shell: true, input: JSON.stringify(envelope), timeout: timeoutMs, encoding: "utf8", cwd, maxBuffer: 1024 * 1024 });
	} catch (error) {
		return programError(`program command could not be executed: ${error}`);
	}
	if (result.error) {
		if (result.error.code === "ETIMEDOUT" || result.signal) return programError(`program command timed out after ${timeoutMs}ms and was killed: ${snippet(command)}`);
		return programError(`program command failed to start: ${result.error.message} (${snippet(command)})`);
	}
	if (result.status !== 0) {
		return programError(`program command must exit 0, got status ${result.status}: ${snippet(command)}; stderr: ${snippet(result.stderr)}`);
	}
	return { stdout: String(result.stdout ?? "") };
}

export const stripOneTrailingNewline = (text) => (text.endsWith("\n") ? text.slice(0, -1) : text);

// segment stdout 契约：{"assistant": {content: [...], stopReason: "toolUse"}}
// 或 {"result": "<string>"}；二选一、键精确、结构校验。校验失败返回
// programError；合法则归一为 {assistant} 或 {result}。
export function parseSegmentOutput(stdout) {
	let value;
	try {
		value = JSON.parse(stdout);
	} catch (error) {
		return programError(`segment stdout must be JSON {"assistant":{content,stopReason}} or {"result":"…"}, got non-JSON ${JSON.stringify(snippet(stdout))}: ${error}`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return programError(`segment stdout must be a JSON object with exactly one key "assistant" or "result", got ${JSON.stringify(snippet(stdout))}`);
	}
	const keys = Object.keys(value);
	if (keys.length !== 1) {
		return programError(`segment stdout must carry exactly one key "assistant" or "result", got ${keys.join(", ") || "(none)"}`);
	}
	if (keys[0] === "result") {
		if (typeof value.result !== "string") return programError(`segment result must be a string, got ${JSON.stringify(value.result)}`);
		return { result: value.result };
	}
	if (keys[0] !== "assistant") {
		return programError(`segment stdout key must be "assistant" or "result", got ${JSON.stringify(keys[0])}`);
	}
	const invalid = validateSegmentAssistant(value.assistant);
	if (invalid) return programError(invalid);
	return { assistant: value.assistant };
}

function validateSegmentAssistant(message) {
	if (typeof message !== "object" || message === null || Array.isArray(message)) return `segment assistant must be a mapping {content: [...], stopReason: "toolUse"}, got ${JSON.stringify(message)}`;
	if (message.stopReason !== "toolUse") return `segment assistant stopReason must be "toolUse" (a text-only message would end the model turn; emit {"result": …} to finish instead), got ${JSON.stringify(message.stopReason)}`;
	if (!Array.isArray(message.content) || message.content.length === 0) return "segment assistant content must be a non-empty array of blocks";
	const seen = new Set();
	for (const block of message.content) {
		if (block?.type === "text" && typeof block.text === "string") continue;
		if (block?.type !== "toolCall") return `segment assistant block must be {type: "text", text} or {type: "toolCall", …}, got ${JSON.stringify(snippet(JSON.stringify(block)))}`;
		if (typeof block.id !== "string" || block.id === "" || block.id.startsWith("mdp_")) return `segment toolCall id must be a non-empty string that does not start with the reserved prefix "mdp_", got ${JSON.stringify(block.id)}`;
		if (seen.has(block.id)) return `segment toolCall id must be unique within the message, duplicate ${JSON.stringify(block.id)}`;
		seen.add(block.id);
		if (typeof block.name !== "string" || block.name === "") return `segment toolCall name must be a non-empty string, got ${JSON.stringify(block.name)}`;
		if (typeof block.arguments !== "object" || block.arguments === null || Array.isArray(block.arguments)) return `segment toolCall arguments must be an object, got ${JSON.stringify(block.arguments)}`;
	}
	if (!message.content.some((block) => block.type === "toolCall")) return 'segment assistant must contain at least one toolCall (emit {"result": …} to finish the segment; text-only assistant messages would end the model turn)';
	return null;
}
