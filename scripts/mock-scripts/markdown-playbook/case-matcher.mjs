// 有序 case 匹配器：同一输入（user 文本或 toolResult 文本）按声明顺序依次
// 尝试 case，首个匹配即消费；不匹配试下一个；全不匹配且无 otherwise 即
// no-match（由调用方转为 user/toolResult mismatch 错误）。judge case 由
// 播放器执行外接命令（judge-exec），其 envelope 的 context 只含到当前消息
// 为止的前缀 —— 历史重建时绝不向 judger 泄露未来消息。
import { runJudgeCommand } from "./judge-exec.mjs";
import { snippet } from "./parse-yaml.mjs";

export function matchUser(matcher, text) {
	const mode = matcher.mode ?? matcher.matcher;
	if (mode === "any" || mode === "otherwise") return true;
	if (mode === "exact") return text === matcher.value;
	return text.includes(matcher.value);
}

export function evaluateCases(step, subject, message, evalContext) {
	let ordinal = 0;
	for (const item of step.cases) {
		ordinal += 1;
		if (item.matcher !== "judge" && item.matcher !== "judger") {
			if (matchUser(item, subject)) return { case: item };
			continue;
		}
		const outcome = runJudgeCommand(item.value, buildEnvelope(step, ordinal, message, evalContext), {
			cwd: evalContext.judgeCwd,
			timeoutMs: evalContext.judgeTimeoutMs,
		});
		if (outcome.error) return outcome;
		if (outcome.pass) return { case: item };
	}
	return { noMatch: true };
}

function buildEnvelope(step, ordinal, message, { messages, index, playbookPath }) {
	const targets = [...new Set(step.cases.filter((item) => item.pass).map((item) => item.pass.to))];
	return {
		message,
		context: { messages: messages.slice(0, index + 1) },
		location: {
			playbook: playbookPath ?? "(playbook)",
			step: step.index,
			kind: step.kind,
			heading: step.heading ?? null,
			case: ordinal,
			anchor: step.nearestAnchor ?? null,
		},
		targets,
	};
}

export function describeCases(step) {
	return `${step.cases.length} case(s) [${step.cases.map(describeCase).join("; ")}]`;
}

function describeCase(item) {
	if (item.matcher === "any" || item.matcher === "otherwise") return `${item.matcher}: true`;
	if (item.matcher === "judge" || item.matcher === "judger") return `${item.matcher}: ${snippet(item.value, 80)}${item.pass ? ` -> ${item.pass.to}` : ""}`;
	return `${item.matcher}: ${JSON.stringify(item.value)}${item.pass ? ` -> ${item.pass.to}` : ""}`;
}
