// 真实 compiled-IR 导出：--compile-observations 的唯一实现。纯 parse+compile
//（loadUnit 递归编译文件调用闭包），不执行外部程序、不按文件名分流、不含
// 派生期望。管理节点 kind 枚举恰为 rv/user/segment，label 是属性；match 是
// 数据选择器，单列 matches（at=其在流中位置，第 at 个管理单元之前）。
import { loadUnit, resolveImport } from "./load-unit.mjs";

const cleanRv = (node) => ({
	kind: "rv", ...(node.label ? { label: node.label } : {}), say: node.say,
	calls: node.calls.map((slot) => ({
		tool: slot.tool, args: slot.args,
		...(slot.expect ? { expect: { exitCode: slot.expect.exitCode, contains: slot.expect.contains } } : {}),
		...(slot.resultCases ? { resultCases: slot.resultCases } : {}),
	})),
	...(node.aggregation ? { aggregation: { command: node.aggregation.command, with: node.aggregation.with, save: node.aggregation.save, ...(node.aggregation.cases ? { cases: node.aggregation.cases } : {}), volatile: node.aggregation.volatile } } : {}),
});

const cleanSegment = (node) => ({
	kind: "segment", ...(node.label ? { label: node.label } : {}), form: node.form,
	...(node.form === "file" ? { path: node.path, with: node.with } : { command: node.command, with: node.with, save: node.save, ...(node.cases ? { cases: node.cases } : {}), volatile: node.volatile }),
});

const cleanNode = (node) => {
	if (node.kind === "rv") return cleanRv(node);
	if (node.kind === "user") return { kind: "user", ...(node.label ? { label: node.label } : {}), cases: node.cases };
	return cleanSegment(node);
};

export function exportIR(rootPath, cache = new Map()) {
	const root = loadUnit(rootPath, cache);
	const closure = [];
	const visited = new Set();
	const walk = (unit) => {
		if (visited.has(unit.path)) return;
		visited.add(unit.path);
		for (const node of unit.nodes) {
			if (node.kind !== "segment" || node.form !== "file") continue;
			walk(loadUnit(resolveImport(unit, node.path), cache));
		}
	};
	walk(root);
	for (const path of [...visited].sort()) {
		const unit = cache.get(path);
		closure.push({
			path,
			front: { params: unit.front.params, vars: unit.front.vars },
			nodes: unit.nodes.map(cleanNode),
			matches: unit.matches.map((match) => ({ at: match.at, data: match.data, cases: match.cases })),
			labels: unit.labels,
		});
	}
	return { accepted: true, ir: { schemaVersion: 2, root: root.path, units: closure } };
}

const canonical = (error) => ({
	class: error.code === "playbook_ref_error" || error.code === "playbook_invalid" ? error.code : "playbook_invalid",
	message: error.message,
});

export function exportOutcome(rootPath, cache = new Map()) {
	try {
		return exportIR(rootPath, cache);
	} catch (error) {
		return { accepted: false, error: canonical(error) };
	}
}
