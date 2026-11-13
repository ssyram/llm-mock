// aggregator 与 segment 的运行时：共用 program-exec 的外接程序执行机制。
// aggregator 在批次全部工具结果到齐、流程走到它的位置时执行一次：stdin
// envelope 携带原始结果与局部匹配结论（results），stdout 即聚合结果，交给
// 同一套 case 匹配决定唯一跳转/继续。segment 是跨多轮的子对话处理者：程序
// 被反复调用（每次带当前 transcript 前缀），输出 {"assistant":…} 向宿主继续
// 交互（真实工具由宿主执行）、或 {"result": …} 内部完成返回（绝不泄露为
// assistant 消息），由外层 cases 选择后续。历史重建 = 用同一程序对前缀逐点
// 重放并逐字比对，程序必须是 transcript 前缀的确定性函数。
import { evaluateCases, describeCases } from "./case-matcher.mjs";
import { runExternalProgram, parseSegmentOutput, stripOneTrailingNewline } from "./program-exec.mjs";
import { snippet } from "./parse-yaml.mjs";
import { deepEqual } from "./transcript-check.mjs";

const mismatch = (code, message) => ({ error: { status: 422, code, message } });

const where = (step) => step ? `${step.kind} step ${step.index}${step.heading ? ` under heading "${step.heading}"` : ""}` : "end of playbook";

const buildLocation = (step, options) => ({
	playbook: options.playbookPath ?? "(playbook)",
	step: step.index,
	kind: step.kind,
	heading: step.heading ?? null,
	anchor: step.nearestAnchor ?? null,
});

const programResultMessage = (result) => ({ role: "programResult", toolCallId: null, content: [{ type: "text", text: result }] });

export function runAggregator(step, messages, frontier, batchResults, options) {
	const envelope = {
		context: { messages: messages.slice(0, frontier) },
		results: batchResults,
		location: buildLocation(step, options),
	};
	const outcome = runExternalProgram(step.command, envelope, { cwd: options.judgeCwd, timeoutMs: options.judgeTimeoutMs });
	if (outcome.error) return outcome;
	const result = stripOneTrailingNewline(outcome.stdout);
	const verdict = evaluateCases(step, result, programResultMessage(result), { messages, index: frontier - 1, playbookPath: options.playbookPath, judgeCwd: options.judgeCwd, judgeTimeoutMs: options.judgeTimeoutMs });
	if (verdict.error) return verdict;
	if (!verdict.case) {
		return mismatch("playbook_aggregator_mismatch", `aggregator ${where(step)}: none of ${describeCases(step)} matched the aggregated result ${JSON.stringify(snippet(result))}; script stopped, no tool calls issued`);
	}
	return { nextIndex: verdict.case.pass ? verdict.case.pass.toIndex : step.index };
}

export function runSegment(step, messages, startM, options) {
	const declared = declaredToolNames(messages);
	const judgeContext = { messages, playbookPath: options.playbookPath, judgeCwd: options.judgeCwd, judgeTimeoutMs: options.judgeTimeoutMs };
	let cursor = startM;
	const pending = new Set();
	for (;;) {
		if (cursor < messages.length && messages[cursor].role === "toolResult") {
			const message = messages[cursor];
			if (!pending.has(message.toolCallId)) {
				return mismatch("playbook_toolresult_unexpected", `toolResult at message ${cursor} does not match a pending segment call (toolCallId ${JSON.stringify(message.toolCallId)}); pending segment call(s): ${[...pending].join(", ") || "(none)"}`);
			}
			pending.delete(message.toolCallId);
			cursor++;
			continue;
		}
		if (cursor === messages.length && pending.size > 0) {
			return mismatch("playbook_state", `awaiting toolResult for segment call(s) ${[...pending].join(", ")}: the host sent a model request before all segment tool results arrived — the batch must complete before the segment continues`);
		}
		const outcome = runExternalProgram(step.command, { context: { messages: messages.slice(0, cursor) }, location: buildLocation(step, options) }, { cwd: options.judgeCwd, timeoutMs: options.judgeTimeoutMs });
		if (outcome.error) return outcome;
		const parsed = parseSegmentOutput(outcome.stdout);
		if (parsed.error) return parsed;
		if (parsed.assistant) {
			const undeclared = undeclaredToolNames(parsed.assistant, declared);
			if (undeclared) return mismatch("playbook_tool_undeclared", undeclared);
			if (cursor >= messages.length) return { reply: { content: parsed.assistant.content } };
			const message = messages[cursor];
			if (message.role !== "assistant") {
				return mismatch("playbook_segment_drift", `segment program would emit an assistant message here but the transcript has a ${message.role} message at ${cursor}: segments span a single user turn (user input mid-segment is not supported) and the program must be a deterministic function of the transcript prefix`);
			}
			const diff = diffAssistant(message, parsed.assistant);
			if (diff) return mismatch("playbook_segment_drift", `segment ${where(step)}: ${diff}`);
			for (const call of parsed.assistant.content.filter((block) => block?.type === "toolCall")) pending.add(call.id);
			cursor++;
			continue;
		}
		const verdict = evaluateCases(step, parsed.result, programResultMessage(parsed.result), { ...judgeContext, index: cursor - 1 });
		if (verdict.error) return verdict;
		if (!verdict.case) {
			return mismatch("playbook_segment_mismatch", `segment ${where(step)}: none of ${describeCases(step)} matched the segment result ${JSON.stringify(snippet(parsed.result))}; script stopped, no tool calls issued`);
		}
		return { nextIndex: verdict.case.pass ? verdict.case.pass.toIndex : step.index, consumed: cursor };
	}
}

function declaredToolNames(messages) {
	for (const message of messages) {
		if (message.role !== "system" || !Array.isArray(message.toolsAdded)) continue;
		const names = message.toolsAdded.map((tool) => tool?.name).filter((n) => typeof n === "string");
		return names.length > 0 ? new Set(names) : null;
	}
	return null;
}

function undeclaredToolNames(assistant, declared) {
	if (!declared) return null;
	const missing = [...new Set(assistant.content.filter((block) => block?.type === "toolCall").map((block) => block.name))].filter((name) => !declared.has(name));
	if (missing.length === 0) return null;
	return `segment calls tool(s) ${missing.join(", ")} but the host declares only: ${[...declared].join(", ")}; use the host's actual tool name`;
}

function diffAssistant(message, emitted) {
	// 宿主回放的历史 assistant 不保证保留原 stopReason（与 v1 checkAssistant
	// 同口径）：内容逐字节相等才是重建判据；stopReason 只在程序输出侧校验。
	if (!deepEqual(message.content, emitted.content)) {
		return `historical assistant drifted from the segment output: expected ${JSON.stringify(snippet(JSON.stringify(emitted.content), 160))}, transcript has ${JSON.stringify(snippet(JSON.stringify(message.content), 160))}`;
	}
	return null;
}
