// Pi Bash toolResult 的 exit_code 适配器：观测规则 + 无法判定/可能误判边界
//（以真实 E2E 捕获实证校准，详见模块 README 同名一节）。
// Pi 1.5.2 实源码 dist/core/tools/bash.js：exitCode!==0 时 content 文本为
// `<output>\n\nCommand exited with code N`（输出为空时 output 段是占位符
// "(no output)"），exitCode===0 时文本只有输出、无状态行。
// 关键宿主边界（E2E 捕获实证）：openai-completions 的 tool 消息在线上不
// 携带 isError，框架解码后丢失归 false —— 因此 isError 不可作为精确码来源；
// 文本末尾的原生状态行是唯一可靠通道。isError=true 且无状态行（超时/中止/
// 截断）时明确判"不可判定"，绝不猜数字。
// 已知边界：exit 0 的命令若自身输出恰好以同样的状态行结尾，文本通道无法
// 区分（记录于 README 限制一节）。
const STATUS_LINE = /^Command exited with code (\d+)$/;
const KNOWN_UNDETERMINED = [/^Command timed out after \d+(?:\.\d+)? seconds/, /^Command aborted/, /^Command terminated without an exit code/];

export function bashExitCode(toolResult) {
	const text = resultText(toolResult);
	const body = text.replace(/[\r\n]+$/, "");
	const cut = body.lastIndexOf("\n\n");
	const tail = cut === -1 ? body : body.slice(cut + 2);
	const match = STATUS_LINE.exec(tail);
	if (match) return { ok: true, code: Number.parseInt(match[1], 10) };
	const undetermined = KNOWN_UNDETERMINED.find((pattern) => pattern.test(tail));
	if (undetermined || toolResult.isError === true) {
		return { ok: false, reason: `exact exit code is not visible (error without a status line: ${snippet(tail)})` };
	}
	return { ok: true, code: 0 };
}

export function resultText(toolResult) {
	const blocks = Array.isArray(toolResult?.content) ? toolResult.content : [];
	return blocks.filter((block) => typeof block?.text === "string").map((block) => block.text).join("\n");
}

function snippet(text, cap = 160) {
	const flat = String(text).replace(/\s+/g, " ");
	return flat.length > cap ? `${flat.slice(0, cap)}…` : flat;
}
