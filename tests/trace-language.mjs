const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
export const traceTools = ["echo", "other"].map((name) => ({ name, description: `bounded ${name}`, parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } }));

export function* traceLanguage() {
	yield { count: 0, sameName: true, sameId: false, errors: [], order: [] };
	for (const error of [false, true]) yield { count: 1, sameName: true, sameId: false, errors: [error], order: [0] };
	for (const sameName of [false, true]) for (const sameId of [false, true]) for (let flags = 0; flags < 4; flags++) {
		for (const order of [[0, 1], [1, 0]]) yield { count: 2, sameName, sameId, errors: [Boolean(flags & 1), Boolean(flags & 2)], order };
	}
}
export function traceReply(scenario, api, model) {
	const calls = Array.from({ length: scenario.count }, (_, index) => ({ type: "toolCall", id: scenario.sameId ? "call" : `call_${index}`,
		name: index === 0 || scenario.sameName ? "echo" : "other", arguments: { value: `value-${index}-界` } }));
	return { role: "assistant", api, provider: "trace-fixture", model, usage: structuredClone(usage), timestamp: 0,
		content: [{ type: "text", text: "trace ready" }, ...calls], stopReason: calls.length ? "toolUse" : "stop" };
}
export function traceFinal(messages, api, model, dropResult = false) {
	let results = messages.filter((message) => message.role === "toolResult");
	if (dropResult) results = results.slice(1);
	const receipts = results.map(({ toolCallId, toolName, content, isError }) => ({ toolCallId, toolName, content, isError }));
	return { ...traceReply({ count: 0 }, api, model), content: [{ type: "text", text: JSON.stringify(receipts) }] };
}
