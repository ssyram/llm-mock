// AFFINE 跳转权与 aggregator 结构的编译期分析。批次（response 批次）=
// 两条 user 输入之间的剧本片段：playbook 开头或某 user 块之后，到下一个
// user 块为止（user 块本身是下一批次的头，不计入前一批）。
// 规则（违反即在解析期拒绝）：
//  1) 无 aggregator 的批次：最多一个 toolResult 块可以声明 pass.to——统计
//     【持有 to 的块数】，不是去重跳转目标，也不是限制块内 to 总数（块内
//     互斥 cases 可 to 不同 ID）；
//  2) 有 aggregator 的批次：所有局部 toolResult 块禁止 to；不允许 segment；
//     至多一个 aggregator；aggregator 之后不得再有 call；aggregator 之前
//     不得出现 end（会提前终结绕过汇合）；aggregator 之前的 say 必须能并入
//     其后、aggregator 之前的 call 组（纯文本消息会先结束回合、绕过汇合）；
//  3) 任何位置早于 aggregator 的 case 不得 pass.to 到该 aggregator 之后
//     （唯一例外是 aggregator 自己的 cases）——否则运行时跳转会绕过汇合点。
import { PlaybookError } from "./parse-yaml.mjs";

const where = (step) => `${step.kind} step ${step.index}${step.heading ? ` (under heading "${step.heading}")` : ""} at line ${step.line}`;

const holdsPass = (step) => step.cases?.some((item) => item.pass) ?? false;

const casePasses = function* (steps) {
	for (const step of steps) {
		if (!step.cases) continue;
		for (const item of step.cases) {
			if (item.pass) yield { step, item };
		}
	}
};

function spans(steps) {
	const out = [];
	let start = 0;
	for (let idx = 0; idx < steps.length; idx++) {
		if (steps[idx].kind !== "user") continue;
		if (idx > start) out.push({ start, end: idx });
		start = idx + 1;
	}
	out.push({ start, end: steps.length });
	return out;
}

export function analyzeAffine(steps) {
	for (const { start, end } of spans(steps)) {
		const slice = steps.slice(start, end);
		const aggPositions = [];
		slice.forEach((step, i) => {
			if (step.kind === "aggregator") aggPositions.push({ pos: start + i, step });
		});
		if (aggPositions.length > 1) {
			throw new PlaybookError(`a response batch may contain at most one aggregator; found ${aggPositions.length} (${aggPositions.map((a) => where(a.step)).join("; ")})`, aggPositions[1].step.line);
		}
		if (aggPositions.length === 1) checkAggregatorBatch(steps, start, end, aggPositions[0].pos, aggPositions[0].step);
		else checkAffineBatch(slice, start);
	}
}

function checkAffineBatch(slice, start) {
	const holders = [];
	slice.forEach((step, i) => {
		if (step.kind === "toolResult" && holdsPass(step)) holders.push({ step, pos: start + i });
	});
	if (holders.length > 1) {
		throw new PlaybookError(
			`affine violation: ${holders.length} toolResult blocks declare pass.to in one response batch (max 1 without an aggregator); the count is of blocks holding jump rights, not of distinct targets: ${holders.map((h) => where(h.step)).join("; ")}`,
			holders[1].step.line,
		);
	}
}

function checkAggregatorBatch(steps, start, end, aggPos, aggStep) {
	for (let idx = start; idx < end; idx++) {
		const step = steps[idx];
		if (step.kind === "toolResult" && holdsPass(step)) {
			throw new PlaybookError(`aggregator batch forbids local pass.to: ${where(step)} holds a jump but the batch's aggregator (${where(aggStep)}) decides the only jump; remove the local pass or the aggregator`, step.line);
		}
		if (step.kind === "segment") {
			throw new PlaybookError(`a response batch with an aggregator cannot contain a segment: ${where(step)} would run outside the mandatory convergence of ${where(aggStep)}`, step.line);
		}
		if (step.kind === "call" && idx > aggPos) {
			throw new PlaybookError(`no call may follow the aggregator in its batch: ${where(step)} sits after ${where(aggStep)}; start a new batch with a user block instead`, step.line);
		}
		if (step.kind === "end" && idx < aggPos) {
			throw new PlaybookError(`end before the aggregator would bypass the mandatory convergence: ${where(step)} precedes ${where(aggStep)}`, step.line);
		}
		if (step.kind === "say" && idx < aggPos && !steps.slice(idx + 1, aggPos).some((s) => s.kind === "call")) {
			throw new PlaybookError(`a text-only assistant message would end the model turn before the aggregator runs: ${where(step)} has no call between it and ${where(aggStep)}; put the say after the aggregator or merge it into a call group`, step.line);
		}
	}
	for (const { step, item } of casePasses(steps)) {
		const sourcePos = step.index - 1;
		if (sourcePos === aggPos) continue;
		if (sourcePos < aggPos && item.pass.toIndex > aggPos) {
			throw new PlaybookError(`pass.to from ${where(step)} targets "${item.pass.to}" after ${where(aggStep)} and would skip the mandatory convergence; only the aggregator's own cases may jump past it`, step.line);
		}
	}
}
