// next-language 流执行：按管理单元推进——RV 原子发射、segment（命令/文件两
// 形式）、aggregation（RV 的 validation 处理者，从回执下标入口）、user 单元
// 的 empty say 收束、match 数据选择器。帧栈/步数/深度预算在此维护。
import { evaluateCases, describeCases } from "./case-eval.mjs";
import { runExternal, applySave } from "./external.mjs";
import { safeRefs } from "./refs.mjs";
import { bindFrame, resolveImport } from "./load-unit.mjs";
import { buildReply } from "./mount-reply.mjs";
import { runAggregation, runMatches, runSegment } from "./run-segment.mjs";

const fail = (code, message) => ({ error: { status: 422, code, message } });
export const MAX_STEPS = 100000;

function current(session) {
	const frame = session.frames[session.pc.frame];
	return { frame, unit: session.units.get(frame.path) };
}

export function emit(session, input, content) {
	session.lastReply = content;
	session.pendingEcho = true;
	session.emitIndex = (input?.request?.context?.messages ?? []).length;
	session.replyOwed = false;
	return { reply: { ...buildReply(input, { text: null, calls: [] }), content, stopReason: content.some((b) => b.type === "toolCall") ? "toolUse" : "stop" } };
}

function emitRv(session, input, node, frame) {
	const { unit } = current(session);
	const content = [];
	if (node.say !== null) {
		const said = safeRefs(node.say, frame, `say @${node.openIndex}`);
		if (said.error) return said;
		content.push({ type: "text", text: String(said.value) });
	}
	const entries = [];
	for (const slot of node.calls) {
		const args = safeRefs(slot.args, frame, `call ${slot.tool} #${slot.callIndex}`);
		if (args.error) return args;
		session.callSeq += 1;
		const id = `p2_${session.callSeq}`;
		content.push({ type: "toolCall", id, name: slot.tool, arguments: args.value });
		entries.push({ id, tool: slot.tool, args: args.value, expect: slot.expect ?? null, resultCases: slot.resultCases ?? null, got: false });
	}
	session.pc.node += 1;
	const reply = emit(session, input, content);
	if (entries.length > 0) {
		session.pending = { entries, batch: [], batchPass: null, emitIndex: session.emitIndex };
	}
	return reply;
}

export function runFlow(session, input) {
	for (let steps = 0; steps < MAX_STEPS; steps += 1) {
		session.steps += 1;
		if (session.steps > MAX_STEPS) return fail("playbook_budget", `步数预算耗尽（${MAX_STEPS}）——纯 CPU 死循环必须被终止`);
		if (session.pendingAggregation) {
			const bad = runAggregation(session, input);
			if (bad) return bad;
			continue;
		}
		const { unit, frame } = current(session);
		if (!unit.nodes[session.pc.node]) {
			if (session.frames.length > 1) {
				const returning = session.frames.pop();
				session.pc = returning.returnPc;
				continue;
			}
			session.ended = true;
			return fail("playbook_exhausted", "根剧本已到 EOF（会话结束）");
		}
		const matchBad = runMatches(session, unit, input);
		if (matchBad) return matchBad;
		const node = unit.nodes[session.pc.node];
		if (!node) continue;
		if (node.kind === "rv") return emitRv(session, input, node, frame);
		if (node.kind === "user") {
			if (session.replyOwed) return emit(session, input, [{ type: "text", text: "" }]);
			return fail("playbook_state", "流在 user 单元等待新 user 输入，宿主却请求模型回复");
		}
		if (node.kind === "segment") {
			const bad = runSegment(session, input, node);
			if (bad) return bad;
			continue;
		}
		return fail("playbook_invalid", `未预期管理单元类型 ${node.kind}`);
	}
	return fail("playbook_budget", "runFlow 步数耗尽");
}
