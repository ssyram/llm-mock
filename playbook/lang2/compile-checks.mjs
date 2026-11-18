// next-language 编译期检查：pass 目标限本文件管理单元起点、affine 按 RV、
// save 只写 front matter vars、{{}} 引用静态形态、segment 两种形式互斥已在
// 词法层完成。
import { PlaybookError } from "../parse-yaml.mjs";
import { walkRefForm } from "./refs.mjs";

function checkTargets(unit) {
	const known = Object.keys(unit.labels);
	const checkCase = (item, where) => {
		if (item.pass && !known.includes(item.pass.to)) {
			throw new PlaybookError(`pass 目标未知 label: ${item.pass.to}（${where}）`, 0, unit.source);
		}
	};
	for (const node of unit.nodes) {
		if (node.kind === "rv") {
			for (const slot of node.calls) {
				for (const item of slot.resultCases ?? []) checkCase(item, `toolResult #${slot.callIndex}`);
			}
			for (const item of node.aggregation?.cases ?? []) checkCase(item, `aggregation of RV @${node.openIndex}`);
		} else if (node.kind === "user") {
			for (const item of node.cases ?? []) checkCase(item, `user @${node.openIndex}`);
		} else if (node.kind === "segment" && node.form === "command") {
			for (const item of node.cases ?? []) checkCase(item, `segment @${node.openIndex}`);
		}
	}
	for (const match of unit.matches) {
		for (const item of match.cases) checkCase(item, `match ${match.data} @${match.openIndex}`);
	}
}

function checkAffine(unit) {
	for (const node of unit.nodes) {
		if (node.kind !== "rv") continue;
		const holders = node.calls.filter((slot) => (slot.resultCases ?? []).some((item) => item.pass));
		if (node.aggregation) {
			if (holders.length) {
				throw new PlaybookError(`AFFINE: 有 aggregation 的 RV 内局部 toolResult 禁 pass.to（call #${holders[0].callIndex}）`, 0, unit.source);
			}
			continue;
		}
		if (holders.length > 1) {
			throw new PlaybookError(`AFFINE: 单个 RV 至多一个 toolResult 可声明 pass.to（#${holders[0].callIndex} 与 #${holders[1].callIndex}）`, 0, unit.source);
		}
	}
}

function checkSaveAndRefs(unit) {
	for (const node of unit.nodes) {
		if (node.kind === "rv") {
			if (node.say !== null) walkRefForm(node.say, unit, `say @${node.openIndex}`);
			for (const slot of node.calls) walkRefForm(slot.args, unit, `call ${slot.tool} #${slot.callIndex}`);
		}
		if (node.kind !== "segment") continue;
		walkRefForm(node.with, unit, `segment @${node.openIndex}`);
		for (const name of Object.keys(node.save)) {
			if (Object.prototype.hasOwnProperty.call(unit.params, name)) {
				throw new PlaybookError(`save 只能写 vars，${name} 是 params（segment @${node.openIndex}）`, 0, unit.source);
			}
			if (!Object.prototype.hasOwnProperty.call(unit.vars, name)) {
				throw new PlaybookError(`save 目标 ${name} 不在 front matter vars 中（segment @${node.openIndex}）`, 0, unit.source);
			}
		}
	}
}

export function compileChecks(unit) {
	checkTargets(unit);
	checkAffine(unit);
	checkSaveAndRefs(unit);
	return unit;
}
