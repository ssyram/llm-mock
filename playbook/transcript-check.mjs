// transcript 核对层：历史 assistant 消息与剧本组的逐项比对（文本/toolCall
// id/工具名/参数）、expect 断言复检、以及 call 工具名对宿主 toolsAdded 声明
// 的校验。被 playbook-runtime 在逐请求重建时调用；全部纯函数、无进程状态。
import { bashExitCode, resultText } from "./bash-exit.mjs";
import { snippet } from "./parse-yaml.mjs";

const deepEqual = (a, b) => equalJson(a, b);
function equalJson(a, b) {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	const ka = Object.keys(a).sort();
	const kb = Object.keys(b).sort();
	if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
	return ka.every((k) => equalJson(a[k], b[k]));
}
export { deepEqual };

const mismatch = (code, message) => ({ error: { status: 422, code, message } });

export function checkAssistant(message, unit) {
	const blocks = Array.isArray(message.content) ? message.content : [];
	const text = blocks.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");
	const calls = blocks.filter((b) => b?.type === "toolCall");
	if (unit.text !== null && text !== unit.text) {
		return `historical assistant text drifted from playbook: expected ${JSON.stringify(snippet(unit.text))}, transcript has ${JSON.stringify(snippet(text))}`;
	}
	if (unit.calls.length === 0) return calls.length === 0 ? null : `unexpected toolCall in a text-only assistant message: ${calls.map((c) => c.name).join(",")}`;
	if (calls.length !== unit.calls.length) return `expected exactly ${unit.calls.length} toolCall(s), transcript assistant has ${calls.length}`;
	for (let idx = 0; idx < calls.length; idx++) {
		const call = calls[idx];
		const want = unit.calls[idx];
		if (call.id !== want.id) return `toolCall ${idx} id mismatch: expected ${want.id}, transcript has ${call.id}`;
		if (call.name !== want.step.tool) return `toolCall ${idx} name mismatch: expected ${want.step.tool}, transcript has ${call.name}`;
		if (!deepEqual(call.arguments, want.step.params)) {
			return `toolCall ${idx} arguments mismatch: expected ${JSON.stringify(want.step.params)}, transcript has ${JSON.stringify(call.arguments)}`;
		}
	}
	return null;
}

export function checkExpect(step, toolResult) {
	if (step.contains !== undefined && !resultText(toolResult).includes(step.contains)) {
		return `expected toolResult text to contain ${JSON.stringify(step.contains)}, actual: ${JSON.stringify(snippet(resultText(toolResult)))}`;
	}
	if (step.exitCode !== undefined) {
		const exit = bashExitCode(toolResult);
		if (!exit.ok) return `expected exit_code ${step.exitCode}, but ${exit.reason}`;
		if (exit.code !== step.exitCode) {
			return `expected exit_code ${step.exitCode}, actual exit_code ${exit.code} (isError=${toolResult.isError === true}, text: ${JSON.stringify(snippet(resultText(toolResult)))})`;
		}
	}
	return null;
}

export function validateTools(steps, messages) {
	for (const message of messages) {
		const declared = message.role === "system" ? message.toolsAdded : undefined;
		if (!Array.isArray(declared) || declared.length === 0) continue;
		const names = declared.map((tool) => tool?.name).filter((n) => typeof n === "string");
		const missing = steps.filter((s) => s.kind === "call" && !names.includes(s.tool)).map((s) => s.tool);
		if (missing.length > 0) {
			return mismatch("playbook_tool_undeclared", `playbook calls tool(s) ${missing.join(", ")} but the host declares only: ${names.join(", ")}; use the host's actual tool name and parameter names`);
		}
		return null;
	}
	return null;
}
