// next-language 会话编排：transcript 与流推进交错。walk 逐条核对历史（user
// 吸收/回显核对/工具回执归属），耗尽后 runFlow 产出下一条回复。User 不是
// validation：显式 user 单元匹配下一条新输入；无显式 user 单元时新输入直接
// 激活下一管理单元；回合仍开时 user 单元先回 empty say 收束。
import { evaluateCases } from "./case-eval.mjs";
import { absorbToolResult, clearMatchesAfter, selectRoot } from "./absorb.mjs";
import { runFlow } from "./run-flow.mjs";
import { deepEqual } from "../transcript-check.mjs";
import { bashExitCode, resultText } from "../bash-exit.mjs";
import { userTextOf } from "./mount-reply.mjs";

const fail = (code, message) => ({ error: { status: 422, code, message } });
const projection = (content) => (Array.isArray(content) ? content.filter((b) => !(b?.type === "text" && b.text === "")) : content);

// 已落地历史 assistant 回显到达时流停 user 单元：引擎自身无待决发射，唯一能
// 核对该回显的是最近命令 segment（回声归属由其程序 fail closed）。重入该
// segment（fresh 入口，reader=当前回显位）；无 segment 可接管则维持原故障。
function adoptOrphanSegment(session) {
	if (session.pendingEcho || session.replyOwed || session.segment || !session.lastSegment) return false;
	const last = session.lastSegment;
	if (last.frame >= session.frames.length) return false;
	const unit = session.units.get(session.frames[last.frame].path);
	const node = unit?.nodes[last.nodeIndex];
	if (!node || node.kind !== "segment" || node.form === "file") return false;
	const currentUnit = session.units.get(session.frames[session.pc.frame].path);
	if (currentUnit?.nodes[session.pc.node]?.kind !== "user") return false;
	session.pc = { frame: last.frame, node: last.nodeIndex };
	session.segment = null;
	return true;
}

export function freshSession(rootUnits, opts) {
	return {
		roots: [...rootUnits.keys()], units: rootUnits, frames: [], pc: { frame: 0, node: 0 },
		readerPos: 0, callSeq: 0, steps: 0, reader: null, pending: null,
		replyOwed: false, lastReply: null, pendingEcho: false, emitIndex: -1,
		segment: null, lastSegment: null, pendingAggregation: null, executedVolatile: [], matchesRun: [],
		ended: false, selectedRoot: null, opts,
	};
}

export function continuationOf(session) {
	const { opts, units, ...rest } = session;
	const unitHashes = {};
	for (const [path, unit] of units) unitHashes[path] = unit.hash;
	return { ...rest, units: null, unitPaths: [...units.keys()], unitHashes };
}

export function restoreSession(continuation, units, opts) {
	return { ...continuation, units, opts };
}

export function judgeEnv(opts, unit, subject, pointer, transcript, translate = null) {
	return {
		forCase: () => ({ transcript, pointer, ...(subject === undefined ? {} : { subject }) }),
		cwd: opts.cwdOf(unit), timeoutMs: opts.timeoutMs,
		...(translate ? { translate, transcript, pointer } : {}),
	};
}

export function handleRequest(session, input) {
	const messages = input?.request?.context?.messages ?? [];
	while (session.readerPos < messages.length) {
		const message = messages[session.readerPos];
		if (message.role === "system") { session.readerPos += 1; continue; }
		if (message.role === "user") {
			if (session.pending) return fail("playbook_state", "批未完成时收到 user 输入（empty say 不能撤销未完成调用）");
			if (session.replyOwed) return fail("playbook_state", "宿主在续行回复未落地时发来 user 输入（协议外顺序）");
			if (!session.selectedRoot) {
				const bad = selectRoot(session, message, input);
				if (bad) return bad;
			} else {
				const unit = session.units.get(session.frames[session.pc.frame].path);
				const node = unit.nodes[session.pc.node];
				if (node && node.kind === "user") {
					if (node.cases.length > 0) {
						const outcome = evaluateCases(node.cases, userTextOf(message), judgeEnv(session.opts, unit, undefined, session.readerPos, session.opts.ensureTranscript(), node.translate));
						if (outcome.error) return outcome;
						if (outcome.noMatch) return fail("playbook_mismatch", `user 输入不匹配（单元 @${node.openIndex}）: ${JSON.stringify(userTextOf(message).slice(0, 80))}`);
						session.pc.node += 1;
						if (outcome.case.pass) { session.pc.node = unit.labels[outcome.case.pass.to]; clearMatchesAfter(session, unit, session.pc.node); }
					} else {
						session.pc.node += 1;
					}
				}
			}
			session.replyOwed = true;
			session.readerPos += 1;
			continue;
		}
		if (message.role === "assistant") {
			if (!session.pendingEcho) {
				adoptOrphanSegment(session);
				const before = session.readerPos;
				const stop = runFlow(session, input);
				if (stop.error) return stop;
				if (stop.reply) {
					if (session.readerPos > before) {
						session.pendingReply = stop.reply;
						continue;
					}
				} else if (session.readerPos > before) {
					continue;
				} else {
					return fail("playbook_state", "流停在 user/已结束，但 transcript 还有未产出的历史 assistant");
				}
			}
			if (session.pendingEcho) {
				if (!session.lastReply || !deepEqual(projection(session.lastReply), projection(message.content))) {
					return fail("playbook_segment_drift", `历史 assistant 与播放器续行不一致（message ${session.readerPos}）`);
				}
				session.pendingEcho = false;
				session.pendingReply = null;
				session.emitIndex = session.readerPos;
				if (session.pending) session.pending.emitIndex = session.readerPos;
				if (session.segment) session.segment.rvMessage = session.readerPos;
			}
			session.readerPos += 1;
			continue;
		}
		if (message.role === "toolResult") {
			if (!session.segment) {
				const bad = absorbToolResult(session, message, input);
				if (bad) return bad;
			}
			session.readerPos += 1;
			continue;
		}
		return fail("playbook_state", `transcript 出现未预期角色 ${JSON.stringify(message.role)}`);
	}
	if (session.pending) {
		const waiting = session.pending.entries.filter((e) => !e.got).map((e) => e.id);
		return fail("playbook_state", `批未完成（awaiting toolResult for ${waiting.join(", ")}），宿主发来模型请求——不隐式重试`);
	}
	if (session.pendingReply) {
		const reply = session.pendingReply;
		session.pendingReply = null;
		return { reply };
	}
	if (session.ended) return fail("playbook_exhausted", "会话已结束（根 EOF），不再产出回复");
	if (!session.replyOwed && !session.segment) {
		return fail("playbook_state", "上一回复已结束回合（纯 say 后），等待新 user 输入；重复请求不能冒充新用户");
	}
	return runFlow(session, input);
}
