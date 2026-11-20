// next-language segment 执行体：命令/文件两种形式、交互续行（入口=自己 RV
// 起点）、matches 数据选择器与 pass 跳转、reader 锚定与返回 pointer 的整单元
// 消费提交。
import { evaluateCases, describeCases } from "./case-eval.mjs";
import { runExternal, applySave } from "./external.mjs";
import { safeRefs } from "./refs.mjs";
import { bindFrame, resolveImport } from "./load-unit.mjs";
import { emit } from "./run-flow.mjs";

const fail = (code, message) => ({ error: { status: 422, code, message } });
export const MAX_DEPTH = 64;

function current(session) {
	const frame = session.frames[session.pc.frame];
	return { frame, unit: session.units.get(frame.path) };
}

export function runMatches(session, unit, input) {
	const transcript = session.opts.ensureTranscript();
	const messages = input?.request?.context?.messages ?? [];
	for (let mi = 0; mi < unit.matches.length; mi += 1) {
		const match = unit.matches[mi];
		if (match.at !== session.pc.node || session.matchesRun.includes(`${unit.path}#${mi}`)) continue;
		const subject = match.data === "system" ? session.opts.systemText(input, messages) : session.opts.compactionSubject(input, messages);
		const outcome = evaluateCases(match.cases, subject, {
			forCase: () => ({ transcript, pointer: session.readerPos, subject }),
			cwd: session.opts.cwdOf(unit), timeoutMs: session.opts.timeoutMs,
			...(match.translate ? { translate: match.translate, transcript, pointer: session.readerPos } : {}),
		});
		if (outcome.error) return outcome;
		session.matchesRun.push(`${unit.path}#${mi}`);
		if (outcome.noMatch) return fail("playbook_mismatch", `match ${match.data} 全不匹配 ${describeCases(match.cases)}`);
		if (outcome.case.pass) {
			session.pc.node = unit.labels[outcome.case.pass.to];
			session.matchesRun = session.matchesRun.filter((key) => {
				const [path, idx] = key.split("#");
				return path !== unit.path || unit.matches[Number(idx)].at <= session.pc.node;
			});
		}
	}
	return null;
}

export function runAggregation(session, input) {
	const pending = session.pendingAggregation;
	session.pendingAggregation = null;
	const frame = session.frames[pending.frame];
	const unit = session.units.get(frame.path);
	const node = unit.nodes[pending.nodeIndex];
	const block = node.aggregation;
	const withValues = safeRefs(block.with, frame, `aggregation @${node.openIndex}`);
	if (withValues.error) return withValues;
	session.reader = pending.emitIndex + 1;
	const outcome = runExternal(block, { role: "aggregation", transcript: session.opts.ensureTranscript(), pointer: session.reader, with: withValues.value }, {
		messages: input?.request?.context?.messages ?? [], cwd: session.opts.cwdOf(unit), timeoutMs: session.opts.timeoutMs,
	});
	if (outcome.error) return outcome;
	if (block.volatile) session.executedVolatile.push(`${unit.path}#${pending.nodeIndex}:aggregation`);
	if (outcome.output.pointer !== undefined) session.reader = outcome.output.pointer;
	const saveBad = applySave(frame, block.save, outcome.output, `aggregation @${node.openIndex}`);
	if (saveBad) return saveBad;
	session.pc.node = pending.nodeIndex + 1;
	if (outcome.output.assistant) {
		const content = outcome.output.assistant.content;
		if (content.some((block) => block.type === "toolCall")) {
			const entries = content.filter((block) => block.type === "toolCall").map((block) => ({ id: block.id, tool: block.name, args: block.arguments, expect: null, resultCases: null, got: false }));
			const reply = emit(session, input, content);
			session.pending = { entries, batch: [], batchPass: null, emitIndex: session.emitIndex, external: true, aggregationRef: { frame: pending.frame, nodeIndex: pending.nodeIndex } };
			return reply;
		}
		return emit(session, input, content);
	}
	const out = outcome.output;
	if (out.result === undefined && out.values === undefined && out.pointer === undefined && block.cases) {
		return fail("playbook_mismatch", `aggregation @${node.openIndex}: 程序空输出但有已声明 cases ${describeCases(block.cases)}`);
	}
	if (out.result !== undefined && block.cases) {
		const outcome2 = evaluateCases(block.cases, out.result, {
			forCase: () => ({ transcript: session.opts.ensureTranscript(), pointer: null, subject: out.result }),
			cwd: session.opts.cwdOf(unit), timeoutMs: session.opts.timeoutMs,
			...(block.translate ? { translate: block.translate, transcript: session.opts.ensureTranscript(), pointer: null } : {}),
		});
		if (outcome2.error) return outcome2;
		if (outcome2.noMatch) return fail("playbook_mismatch", `aggregation @${node.openIndex}: ${describeCases(block.cases)}，result=${JSON.stringify(String(out.result).slice(0, 80))}`);
		if (outcome2.case.pass) session.pc.node = unit.labels[outcome2.case.pass.to];
	}
	return null;
}

export function runSegment(session, input, node) {
	const { unit, frame } = current(session);
	if (node.form === "file") {
		if (session.frames.length >= MAX_DEPTH) return fail("playbook_budget", `文件调用深度超限（${MAX_DEPTH}）`);
		let nextFrame;
		const resolved = safeRefs(node.with, frame, `segment @${node.openIndex}`);
		if (resolved.error) return resolved;
		try {
			const target = session.opts.loadUnit(resolveImport(unit, node.path));
			session.units.set(target.path, target);
			session.matchesRun = session.matchesRun.filter((key) => !key.startsWith(`${target.path}#`));
			nextFrame = bindFrame(target, resolved.value);
		} catch (error) {
			return fail(error.code === "playbook_ref_error" ? "playbook_ref_error" : "playbook_invalid", `segment @${node.openIndex}: ${error.message}`);
		}
		nextFrame.returnPc = { frame: session.pc.frame, node: session.pc.node + 1 };
		session.frames.push(nextFrame);
		session.pc = { frame: session.frames.length - 1, node: 0 };
		return null;
	}
	const active = session.segment && session.segment.path === unit.path && session.segment.nodeIndex === session.pc.node;
	session.reader = active ? session.segment.rvMessage : session.readerPos;
	session.lastSegment = { frame: session.pc.frame, nodeIndex: session.pc.node };
	const resolvedWith = safeRefs(node.with, frame, `segment @${node.openIndex}`);
	if (resolvedWith.error) return resolvedWith;
	const outcome = runExternal(node, { role: "segment", transcript: session.opts.ensureTranscript(), pointer: session.reader, with: resolvedWith.value }, {
		messages: input?.request?.context?.messages ?? [], cwd: session.opts.cwdOf(unit), timeoutMs: session.opts.timeoutMs,
	});
	if (outcome.error) return outcome;
	if (node.volatile) session.executedVolatile.push(`${unit.path}#${session.pc.node}`);
	if (outcome.output.pointer !== undefined) {
		session.reader = outcome.output.pointer;
		if (outcome.output.pointer > session.readerPos) {
			session.readerPos = outcome.output.pointer;
			session.pendingEcho = false;
		}
	}
	const saveBad = applySave(frame, node.save, outcome.output, `segment @${node.openIndex}`);
	if (saveBad) return saveBad;
	if (outcome.output.assistant) {
		const content = outcome.output.assistant.content;
		if (content.some((block) => block.type === "toolCall")) {
			const anchor = Number.isInteger(outcome.output.pointer) ? outcome.output.pointer : session.emitIndex;
			session.segment = { path: unit.path, nodeIndex: session.pc.node, rvMessage: anchor };
			return emit(session, input, content);
		}
		session.segment = null;
		session.pc.node += 1;
		return emit(session, input, content);
	}
	session.segment = null;
	const out = outcome.output;
	if (out.result === undefined && out.values === undefined && out.pointer === undefined && node.cases) {
		return fail("playbook_mismatch", `segment @${node.openIndex}: 程序空输出但有已声明 cases ${describeCases(node.cases)}`);
	}
	if (out.result !== undefined && node.cases) {
		const outcome2 = evaluateCases(node.cases, out.result, {
			forCase: () => ({ transcript: session.opts.ensureTranscript(), pointer: null, subject: out.result }),
			cwd: session.opts.cwdOf(unit), timeoutMs: session.opts.timeoutMs,
			...(node.translate ? { translate: node.translate, transcript: session.opts.ensureTranscript(), pointer: null } : {}),
		});
		if (outcome2.error) return outcome2;
		if (outcome2.noMatch) return fail("playbook_mismatch", `segment @${node.openIndex}: ${describeCases(node.cases)}，result=${JSON.stringify(String(out.result).slice(0, 80))}`);
		session.pc.node += 1;
		if (outcome2.case.pass) session.pc.node = unit.labels[outcome2.case.pass.to];
		session.matchesRun = session.matchesRun.filter((key) => {
			const [path, idx] = key.split("#");
			return path !== unit.path || unit.matches[Number(idx)].at <= session.pc.node;
		});
		return null;
	}
	session.pc.node += 1;
	return null;
}
