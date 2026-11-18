// next-language IR 构建：原始块 → 三种管理单元（rv/user/segment）+ 数据行为
// matches。RV = say（或首个 call）+ 相邻 call（各带 expect/toolResult）+ 至多
// 一个 aggregation；label 只能挂单元开头（say、无 say RV 的首个 call、user、
// segment），RV 内部不可设跳转入口。
import { PlaybookError } from "../parse-yaml.mjs";

function closeRv(nodes, rv) {
	if (rv === null) return;
	nodes.push(rv);
}

export function buildNodes(blocks, source) {
	const nodes = [];
	const matches = [];
	const labels = {};
	let rv = null;
	let lastAttachable = -1;

	const openRv = (say, label, openIndex) => {
		rv = { kind: "rv", label: label ?? null, say, sayIndex: say === null ? null : openIndex, openIndex, calls: [], aggregation: null };
	};

	for (const block of blocks) {
		if (block.kind === "say") {
			closeRv(nodes, rv);
			openRv(block.text, block.label, block.index);
			lastAttachable = -1;
			continue;
		}
		if (block.kind === "call") {
			if (rv === null) {
				if (block.label === null) openRv(null, null, block.index);
				else openRv(null, block.label, block.index);
			} else if (block.label !== null) {
				throw new PlaybookError(`$label ${block.label} 不能挂在 RV 内部的后续 call（block #${block.index}）：label 只能标记 RV 开头`, 0, source);
			}
			rv.calls.push({ tool: block.tool, args: block.args, expect: null, resultCases: null, resultTranslate: null, callIndex: block.index });
			lastAttachable = rv.calls.length - 1;
			continue;
		}
		if (block.kind === "expect" || block.kind === "toolResult") {
			if (rv === null || lastAttachable === -1) {
				throw new PlaybookError(`${block.kind} 块必须紧跟自己的 call（block #${block.index}）`, 0, source);
			}
			const slot = rv.calls[lastAttachable];
			if (block.kind === "expect") {
				if (slot.expect) throw new PlaybookError(`call #${slot.callIndex} 已有 expect`, 0, source);
				slot.expect = block;
			} else {
				if (slot.resultCases) throw new PlaybookError(`call #${slot.callIndex} 已有 toolResult（一个 call 至多一个）`, 0, source);
				slot.resultCases = block.cases;
				slot.resultTranslate = block.translate ?? null;
			}
			continue;
		}
		if (block.kind === "aggregation") {
			if (rv === null || rv.calls.length === 0) {
				throw new PlaybookError(`aggregation 必须挂靠在含 call 的 RV 之后（block #${block.index}）`, 0, source);
			}
			if (rv.aggregation) throw new PlaybookError(`一个 RV 至多一个 aggregation（block #${block.index}）`, 0, source);
			rv.aggregation = block;
			lastAttachable = -1;
			continue;
		}
		closeRv(nodes, rv);
		rv = null;
		lastAttachable = -1;
		if (block.kind === "user") nodes.push({ kind: "user", label: block.label ?? null, cases: block.cases, translate: block.translate ?? null, openIndex: block.index });
		else if (block.kind === "segment") nodes.push({ kind: "segment", label: block.label ?? null, form: block.form, command: block.command ?? null, path: block.path ?? null, with: block.with, save: block.save ?? {}, cases: block.cases ?? null, translate: block.translate ?? null, volatile: block.volatile ?? false, openIndex: block.index });
		else if (block.kind === "match") matches.push({ at: nodes.length, data: block.data, cases: block.cases, translate: block.translate ?? null, openIndex: block.index });
	}
	closeRv(nodes, rv);

	for (const node of nodes) {
		if (!node.label) continue;
		if (Object.prototype.hasOwnProperty.call(labels, node.label)) {
			throw new PlaybookError(`重复 label: ${node.label}（node @${node.openIndex}）`, 0, source);
		}
		labels[node.label] = nodes.indexOf(node);
	}
	return { nodes, matches, labels };
}
