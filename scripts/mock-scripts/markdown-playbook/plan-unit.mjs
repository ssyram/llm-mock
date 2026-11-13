// assistant 单元规划器（纯函数）：从 steps[start] 起规划一个 assistant 单元。
// say 连续合并为文本（空 say 已在解析期丢弃、不构成屏障）；其后首个 call 开启
// call 区段——显式 response 组取整组（组内 say 并入文本、每个 call 可带
// expect/toolResult matcher，matcher 与最近的前一个 call 配对）；旧式裸 call
// 只带自身与紧随的一个 matcher。返回 {text, calls, matchers, endIndex}；
// text 为 null 表示该消息没有文本块（toolCalls-only）。
const callOrdinals = (steps) => {
	const ordinals = new Map();
	let ordinal = 0;
	for (const step of steps) if (step.kind === "call") ordinals.set(step.index, ordinal++);
	return ordinals;
};

export function planUnit(steps, start, ordinals) {
	let text = null;
	let i = start;
	while (i < steps.length && steps[i].kind === "say") {
		text = text === null ? steps[i].text : `${text}\n\n${steps[i].text}`;
		i++;
	}
	const step = steps[i];
	if (step?.kind === "end") {
		if (text === null) return null;
		return { text, calls: [], matchers: new Map(), endIndex: steps.length };
	}
	if (step?.kind === "call") {
		if (step.groupId !== undefined) return planGroupedUnit(steps, i, text, ordinals, step.groupId);
		const id = `mdp_${ordinals.get(step.index)}`;
		const calls = [{ step, id }];
		const matchers = new Map([[id, null]]);
		let endIndex = i + 1;
		const next = steps[i + 1];
		if ((next?.kind === "expect" || next?.kind === "toolResult") && next.groupId === undefined) {
			matchers.set(id, next);
			endIndex = i + 2;
		}
		return { text, calls, matchers, endIndex };
	}
	if (text === null) return null;
	return { text, calls: [], matchers: new Map(), endIndex: i };
}

function planGroupedUnit(steps, i, text, ordinals, groupId) {
	const calls = [];
	const matchers = new Map();
	let k = i;
	while (k < steps.length && steps[k].groupId === groupId) {
		const s = steps[k];
		if (s.kind === "call") {
			const id = `mdp_${ordinals.get(s.index)}`;
			calls.push({ step: s, id });
			matchers.set(id, null);
		} else if (s.kind === "say") {
			text = text === null ? s.text : `${text}\n\n${s.text}`;
		} else if (s.kind === "expect" || s.kind === "toolResult") {
			matchers.set(calls[calls.length - 1].id, s);
		}
		k++;
	}
	return { text, calls, matchers, endIndex: k };
}

export const describeCaseOf = (item) => {
	const target = item.pass ? ` -> ${item.pass.to}` : "";
	if (item.matcher === "any" || item.matcher === "otherwise") return `${item.matcher}: true${target}`;
	return `${item.matcher}: ${JSON.stringify(item.value)}${target}`;
};

// aggregator envelope 的 results：按剧本 call 顺序（与结果到达顺序无关）。
export const orderedBatchResults = (batchCalls) => batchCalls.slice().sort((a, b) => a.ordinal - b.ordinal).map(({ ordinal, ...rest }) => rest);

export { callOrdinals };
