// next-language reply 拼装：与 v1 mock 挂载契约同形（content/stopReason/usage）。
export function buildReply(input, { text, calls }) {
	const content = [];
	if (text !== null && text !== undefined) content.push({ type: "text", text });
	for (const call of calls) content.push({ type: "toolCall", id: call.id, name: call.tool, arguments: call.args });
	const messages = input?.request?.context?.messages ?? [];
	return {
		content,
		api: input.api,
		provider: "markdown-playbook2",
		model: input.model,
		usage: {
			input: messages.length,
			output: content.length,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: messages.length + content.length,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: calls.length > 0 ? "toolUse" : "stop",
		timestamp: 0,
	};
}

export function userTextOf(message) {
	if (typeof message.content === "string") return message.content;
	const blocks = Array.isArray(message.content) ? message.content : [];
	return blocks.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");
}

export function systemTextOf(input, messages) {
	const context = input?.request?.context ?? {};
	if (typeof context.system === "string" && context.system) return context.system;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (message.role !== "system") continue;
		if (typeof message.content === "string" && message.content) return message.content;
		const blocks = Array.isArray(message.content) ? message.content : [];
		const text = blocks.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");
		if (text) return text;
	}
	return "";
}

export function compactionSubjectOf(input, messages) {
	const context = input?.request?.context ?? {};
	return JSON.stringify({
		system: context.system ?? null,
		compaction: input?.request?.compaction ?? context.compaction ?? null,
		messages: messages.length,
	});
}
