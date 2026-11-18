// next-language 消息吸收与入口选择：toolResult 按 callId 归属/expect 判定/
// 批完结（含 aggregation 外发批的再入武装）与多根入口扫描（头部 match + 首
// user 直接匹配启动输入）。
import { evaluateCases } from "./case-eval.mjs";
import { bashExitCode, resultText } from "../bash-exit.mjs";
import { userTextOf } from "./mount-reply.mjs";
import { judgeEnv } from "./interp.mjs";

const fail = (code, message) => ({ error: { status: 422, code, message } });

export function absorbToolResult(session, message, input) {
	const pending = session.pending;
	if (!pending) return fail("playbook_state", `无待决调用却收到 toolResult（toolCallId ${JSON.stringify(message.toolCallId)}）`);
	const slot = pending.entries.find((e) => e.id === message.toolCallId);
	if (!slot) return fail("playbook_state", `toolResult 的 toolCallId ${JSON.stringify(message.toolCallId)} 不属于当前批（${pending.entries.map((e) => e.id).join(", ")}）`);
	if (slot.got) return fail("playbook_state", `toolCallId ${message.toolCallId} 重复回执`);
	if (message.toolName && message.toolName !== slot.tool) {
		return fail("playbook_state", `toolResult toolName ${JSON.stringify(message.toolName)} ≠ 批内 ${slot.tool}`);
	}
	const text = resultText(message);
	if (slot.expect) {
		const expect = slot.expect;
		if (expect.contains !== undefined && !text.includes(expect.contains)) {
			return fail("playbook_mismatch", `expect contains 不符（call ${slot.id}）: ${JSON.stringify(expect.contains)}`);
		}
		if (expect.exitCode !== undefined) {
			const exit = bashExitCode(message);
			if (!exit.ok || exit.code !== expect.exitCode) {
				return fail("playbook_mismatch", `expect exit_code ${expect.exitCode} 不符（call ${slot.id}）: ${exit.ok ? `实际 ${exit.code}` : exit.reason}`);
			}
		}
	}
	let verdict = "expect ok";
	if (slot.resultCases) {
		const { units, pc } = session;
		const unit = units.get(session.frames[pc.frame].path);
		const outcome = evaluateCases(slot.resultCases, text, judgeEnv(session.opts, unit, undefined, session.readerPos, session.opts.ensureTranscript(), slot.resultTranslate));
		if (outcome.error) return outcome;
		if (outcome.noMatch) return fail("playbook_mismatch", `toolResult 不匹配（call ${slot.id}）: ${JSON.stringify(text.slice(0, 80))}`);
		verdict = `${outcome.case.matcher}:${outcome.case.value ?? true}`;
		if (outcome.case.pass) {
			if (pending.batchPass) return fail("playbook_state", "同一批出现第二个 pass（编译期已禁止，运行期防御）");
			pending.batchPass = outcome.case.pass.to;
		}
	} else {
		verdict = "default otherwise";
	}
	slot.got = true;
	pending.batch.push({ callId: slot.id, tool: slot.tool, verdict });
	if (pending.batch.length === pending.entries.length) {
		session.pending = null;
		session.replyOwed = true;
		const { units, pc } = session;
		const unit = units.get(session.frames[pc.frame].path);
		const aggregation = pending.external ? null : (unit.nodes[pc.node - 1]?.kind === "rv" ? unit.nodes[pc.node - 1].aggregation : null);
		if (aggregation) session.pendingAggregation = { path: unit.path, frame: pc.frame, nodeIndex: pc.node - 1, emitIndex: pending.emitIndex };
		if (pending.external && pending.aggregationRef) {
			session.pendingAggregation = { path: unit.path, frame: pending.aggregationRef.frame, nodeIndex: pending.aggregationRef.nodeIndex, emitIndex: pending.emitIndex };
		}
		if (pending.batchPass) {
			if (aggregation) return fail("playbook_state", "有 aggregation 的 RV 禁局部 pass（编译期已禁止，运行期防御）");
			session.pc.node = unit.labels[pending.batchPass];
			clearMatchesAfter(session, unit, session.pc.node);
		}
	}
	return null;
}

export function clearMatchesAfter(session, unit, nodeIndex) {
	session.matchesRun = session.matchesRun.filter((key) => {
		const [path, mi] = key.split("#");
		if (path !== unit.path) return true;
		return unit.matches[Number(mi)].at <= nodeIndex;
	});
}

export function selectRoot(session, message, input) {
	const text = userTextOf(message);
	const transcript = session.opts.ensureTranscript();
	for (const rootPath of session.roots) {
		const unit = session.units.get(rootPath);
		const firstUserIdx = unit.nodes.findIndex((n) => n.kind === "user");
		if (firstUserIdx < 0) continue;
		let rejected = false;
		const consumed = [];
		for (let mi = 0; mi < unit.matches.length; mi += 1) {
			const match = unit.matches[mi];
			if (match.at > firstUserIdx) continue;
			const outcome = evaluateCases(match.cases, matchSubject(session, input, match), judgeEnv(session.opts, unit, matchSubject(session, input, match), session.readerPos, transcript, match.translate));
			if (outcome.error) return outcome;
			consumed.push(`${unit.path}#${mi}`);
			if (outcome.noMatch) { rejected = true; break; }
		}
		if (rejected) continue;
		const entry = unit.nodes[firstUserIdx];
		const outcome = entry.cases.length === 0
			? { case: null }
			: evaluateCases(entry.cases, text, judgeEnv(session.opts, unit, undefined, session.readerPos, transcript, entry.translate));
		if (outcome.error) return outcome;
		if (outcome.noMatch) continue;
		session.selectedRoot = rootPath;
		session.frames = [{ path: rootPath, params: { ...unit.params }, vars: { ...unit.vars } }];
		session.pc = { frame: 0, node: firstUserIdx + 1 };
		session.matchesRun = consumed;
		if (outcome.case?.pass) session.pc.node = unit.labels[outcome.case.pass.to];
		return null;
	}
	return fail("playbook_mismatch", `所有入口剧本都不匹配该 user 输入: ${JSON.stringify(text.slice(0, 80))}`);
}

function matchSubject(session, input, match) {
	const messages = input?.request?.context?.messages ?? [];
	if (match.data === "system") return session.opts.systemText(input, messages);
	return session.opts.compactionSubject(input, messages);
}
