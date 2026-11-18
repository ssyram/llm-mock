// 无状态剧本运行时：每次请求从 transcript 从头确定性重建进度，绝不依赖进程
// 内计数。宿主（真实 Pi）执行工具并回传 toolResult；本运行时只决定下一条
// assistant 消息，并核对历史 assistant/toolResult 与剧本逐项一致。
// 一个 response 批次 = 两条 user 输入之间的剧本片段：```response 显式分组
//（或旧式 say+单 call）产出一条 assistant 消息（文本 + 多个 toolCalls）；
// 每个 call 可带自己的 expect/toolResult matcher，按 toolCall ID（mdp_全局
// 序号）关联真实结果；整批结果到齐才决定后续（不能先到先跳），同批 AFFINE
// 规则由编译期保证（affine-analysis.mjs）。aggregator/segment 外接程序见
// program-runtime.mjs。失配路径：返回 {"error":{...}}（协议可见），不推进、
// 不再生成任何 toolCall。
import { resultText } from "./bash-exit.mjs";
import { snippet } from "./parse-yaml.mjs";
import { checkAssistant, checkExpect, validateTools } from "./transcript-check.mjs";
import { evaluateCases, describeCases } from "./case-matcher.mjs";
import { runAggregator, runSegment } from "./program-runtime.mjs";
import { planUnit, callOrdinals, describeCaseOf, orderedBatchResults } from "./plan-unit.mjs";

export { matchUser } from "./case-matcher.mjs";

export function userText(message) {
	if (typeof message.content === "string") return message.content;
	const blocks = Array.isArray(message.content) ? message.content : [];
	return blocks.filter((block) => typeof block?.text === "string").map((block) => block.text).join("\n");
}

const mismatch = (code, message) => ({ error: { status: 422, code, message } });

const where = (step) => step ? `${step.kind} step ${step.index}${step.heading ? ` under heading "${step.heading}"` : ""}` : "end of playbook";

export function runPlaybook(steps, input, options = {}) {
	const judgeOptions = {
		playbookPath: options.playbookPath,
		judgeCwd: options.judgeCwd ?? process.cwd(),
		judgeTimeoutMs: options.judgeTimeoutMs,
	};
	const ordinals = callOrdinals(steps);
	const messages = input?.request?.context?.messages ?? [];
	const toolError = validateTools(steps, messages);
	if (toolError) return toolError;
	let i = 0;
	let pending = null;
	let batchCalls = [];
	let m = 0;
	while (m < messages.length) {
		const message = messages[m];
		if (message.role === "system") {
			m++;
			continue;
		}
		if (pending === null && steps[i]?.kind === "segment") {
			const seg = runSegment(steps[i], messages, m, judgeOptions);
			if (seg.error) return seg;
			if (seg.reply) return { reply: buildContentReply(input, seg.reply.content, "toolUse") };
			i = seg.nextIndex;
			m = seg.consumed;
			continue;
		}
		if (pending === null && steps[i]?.kind === "aggregator") {
			const agg = runAggregator(steps[i], messages, m, orderedBatchResults(batchCalls), judgeOptions);
			if (agg.error) return agg;
			i = agg.nextIndex;
			batchCalls = [];
			continue;
		}
		if (message.role === "user") {
			const step = steps[i];
			const text = userText(message);
			if (step?.kind === "user") {
				const verdict = evaluateCases(step, text, message, { messages, index: m, ...judgeOptions });
				if (verdict.error) return verdict;
				if (verdict.case) {
					i = verdict.case.pass ? verdict.case.pass.toIndex : step.index;
					batchCalls = [];
					m++;
					continue;
				}
				return mismatch("playbook_user_mismatch", `unexpected user input at message ${m}: none of ${describeCases(step)} matched, actual ${JSON.stringify(snippet(text))}; input not consumed, script not advanced, no tool calls issued`);
			}
			if (i >= steps.length) {
				return mismatch("playbook_exhausted", `playbook finished (reached the explicit end block or the last step) but new user input arrived: ${JSON.stringify(snippet(text))}; no tool calls issued`);
			}
			return mismatch("playbook_user_mismatch", `unexpected user input at message ${m}: expected no matching user step (next is ${where(step)}), actual ${JSON.stringify(snippet(text))}; input not consumed, script not advanced, no tool calls issued`);
		}
		if (message.role === "assistant") {
			if (pending) {
				return mismatch("playbook_state", `awaiting toolResult for call(s) ${[...pending.remaining.keys()].join(", ")} but the transcript has another assistant message at ${m}: the whole response batch must complete before the script continues`);
			}
			const unit = planUnit(steps, i, ordinals);
			if (!unit) return mismatch("playbook_exhausted", `unexpected assistant message at ${m}: ${where(steps[i])}`);
			const drift = checkAssistant(message, unit);
			if (drift) return mismatch("playbook_transcript_drift", `at ${where(unit.calls[0]?.step ?? steps[i])}: ${drift}`);
			if (unit.calls.length > 0) {
				pending = {
					unit,
					remaining: new Map(unit.calls.map((c) => [c.id, { call: c.step, matcher: unit.matchers.get(c.id) }])),
					heldPassTo: null,
				};
			} else {
				i = unit.endIndex;
			}
			m++;
			continue;
		}
		if (message.role === "toolResult") {
			if (!pending) return mismatch("playbook_toolresult_unexpected", `toolResult at message ${m} without a pending playbook call (toolCallId ${JSON.stringify(message.toolCallId)})`);
			const entry = pending.remaining.get(message.toolCallId);
			if (!entry) {
				return mismatch("playbook_toolresult_unexpected", `toolResult at message ${m} does not match the pending call(s) ${[...pending.remaining.keys()].join(", ")}: got ${JSON.stringify(message.toolCallId)}`);
			}
			// 部分宿主协议（如 openai-completions 的 tool 消息）不回传工具名，解码后为空串：
			// 只有宿主确实携带了非空名字时才校验，ID 始终严格关联。
			if (typeof message.toolName === "string" && message.toolName !== "" && message.toolName !== entry.call.tool) {
				return mismatch("playbook_toolresult_unexpected", `toolResult at message ${m} toolName ${JSON.stringify(message.toolName)} does not match pending call tool ${entry.call.tool}`);
			}
			let verdict = null;
			let passTo = null;
			if (entry.matcher?.kind === "expect") {
				const failure = checkExpect(entry.matcher, message);
				if (failure) return mismatch("playbook_expect_mismatch", `expect ${where(entry.matcher)}: ${failure}; script stopped, no further tool calls issued`);
				verdict = "expect ok";
			} else if (entry.matcher?.kind === "toolResult") {
				const text = resultText(message);
				const outcome = evaluateCases(entry.matcher, text, message, { messages, index: m, ...judgeOptions });
				if (outcome.error) return outcome;
				if (!outcome.case) {
					return mismatch("playbook_toolresult_mismatch", `toolResult ${where(entry.matcher)}: none of ${describeCases(entry.matcher)} matched the tool result text ${JSON.stringify(snippet(text))}; script stopped, no further tool calls issued`);
				}
				verdict = describeCaseOf(outcome.case);
				if (outcome.case.pass) passTo = outcome.case.pass.toIndex;
			}
			batchCalls.push({ callId: message.toolCallId, tool: entry.call.tool, ordinal: ordinals.get(entry.call.index), text: resultText(message), verdict });
			pending.remaining.delete(message.toolCallId);
			if (pending.remaining.size === 0) {
				i = pending.heldPassTo ?? passTo ?? pending.unit.endIndex;
				pending = null;
			} else if (passTo !== null) {
				pending.heldPassTo = passTo;
			}
			m++;
			continue;
		}
		return mismatch("playbook_transcript_drift", `unexpected message role ${JSON.stringify(message.role)} at message ${m}`);
	}
	if (pending) {
		return mismatch("playbook_state", `awaiting toolResult for call(s) ${[...pending.remaining.keys()].join(", ")}; the host sent a model request without all tool results — no implicit retry`);
	}
	for (;;) {
		if (i >= steps.length) return mismatch("playbook_exhausted", "playbook finished but the host sent another model request");
		const step = steps[i];
		if (step.kind === "end") return mismatch("playbook_exhausted", `reached the explicit end block at step ${step.index} with nothing to say this turn; add a say before end or route cases with pass`);
		if (step.kind === "user") return mismatch("playbook_state", `playbook waits for user input (${describeCases(step)}) but the model was requested without a new user message`);
		if (step.kind === "expect" || step.kind === "toolResult") return mismatch("playbook_state", `playbook is at ${where(step)} but no tool result is pending; the host sent a model request mid-turn — no implicit retry`);
		if (step.kind === "segment") {
			const seg = runSegment(step, messages, messages.length, judgeOptions);
			if (seg.error) return seg;
			if (seg.reply) return { reply: buildContentReply(input, seg.reply.content, "toolUse") };
			i = seg.nextIndex;
			continue;
		}
		if (step.kind === "aggregator") {
			const agg = runAggregator(step, messages, messages.length, orderedBatchResults(batchCalls), judgeOptions);
			if (agg.error) return agg;
			i = agg.nextIndex;
			batchCalls = [];
			continue;
		}
		break;
	}
	const unit = planUnit(steps, i, ordinals);
	if (!unit) return mismatch("playbook_exhausted", `no playable step remains (${where(steps[i])})`);
	return { reply: buildReply(input, unit) };
}

function buildReply(input, unit) {
	const content = [];
	if (unit.text !== null) content.push({ type: "text", text: unit.text });
	for (const call of unit.calls) content.push({ type: "toolCall", id: call.id, name: call.step.tool, arguments: call.step.params });
	return buildContentReply(input, content, unit.calls.length > 0 ? "toolUse" : "stop");
}

function buildContentReply(input, content, stopReason) {
	const messages = input?.request?.context?.messages ?? [];
	return {
		content,
		api: input.api,
		provider: "markdown-playbook",
		model: input.model,
		usage: {
			input: messages.length,
			output: content.length,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: messages.length + content.length,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: 0,
	};
}
