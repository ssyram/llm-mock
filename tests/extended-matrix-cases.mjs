const clone = (value) => structuredClone(value);

export function additionalContexts(model) {
	const tools = [{ name: "echo", description: "Echo", parameters: {
		$schema: "https://json-schema.org/draft/2020-12/schema", $comment: "schema metadata",
		type: "object", properties: { text: { type: "string" } }, required: ["text"],
	} }];
	const cases = [
		{ name: "syn-no-system", messages: [{ role: "user", content: "hello", timestamp: 9 }] },
		{ name: "syn-schema-metadata", messages: [
			{ role: "system", content: "Use tools", toolsAdded: tools, timestamp: 7 },
			{ role: "user", content: "echo", timestamp: 8 },
		] },
	];
	if (model.api !== "pi-messages") return cases;
	const usage = { input: 10, output: 5, cacheRead: 3, cacheWrite: 2, reasoning: 1,
		totalTokens: 20, cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 } };
	cases.push({ name: "syn-pi-identity-metadata", messages: [
		{ role: "system", content: "", sections: { z: "last", a: "first", removed: null }, toolsAdded: tools, timestamp: 41 },
		{ role: "user", content: [{ type: "text", text: "" }], timestamp: 42 },
		{ role: "assistant", api: "origin-api", provider: "origin-provider", model: "origin-model", content: [
			{ type: "thinking", thinking: "", thinkingSignature: "opaque", redacted: false },
			{ type: "text", text: "", textSignature: "signed" },
			{ type: "toolCall", id: "unaltered|call!?", name: "echo", arguments: { text: "你好" }, thoughtSignature: "thought", namespace: "space" },
		], usage, stopReason: "error", errorMessage: "retained", responseId: "history-id", responseModel: "history-model",
			providerThinkingLevel: "high", rawStopReason: "raw", endTurn: false, durationMs: 123, timestamp: 43,
			diagnostics: [{ type: "fixture", timestamp: 43, details: { retained: true } }], deferred: { provider: "origin-provider", modelId: "origin-model", api: "origin-api", id: "fixture-handle" } },
		{ role: "system", content: "update", toolsRemoved: [{ name: "echo" }], timestamp: 44 },
		{ role: "toolResult", toolCallId: "unaltered|call!?", toolName: "echo", content: [], isError: true,
			timestamp: 45, durationMs: 5, details: { retained: true }, usage, nestedCalls: { calls: [], complete: true } },
	] });
	return cases;
}

export function corpusReplies(corpora) {
	return corpora.flatMap(({ name, messages, provenance }) => messages.flatMap((message, index) => message.role === "assistant"
		? [{ name: `reply-corpus-${name}-${index}`, message: clone(message), ...(provenance ? { provenance } : {}) }] : []));
}

export function additionalReplies(model, base) {
	const cache = clone(base);
	cache.usage = { input: 11, output: 5, cacheRead: 13, cacheWrite: 17, totalTokens: 46,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	cache.usage.cacheWrite1h = 7;
	const cacheCase = { name: "reply-nonzero-cache-usage", message: cache };
	const businessCase = { name: "reply-business-clock-fields", message: { ...clone(base), stopReason: "toolUse", content: [
		{ type: "toolCall", id: "clock_call", name: "echo", arguments: { timestamp: 11, durationMs: 22, nested: { timestamp: "business-time", thinkingSignature: '{"a":1,"b":2}' } } },
	] } };
	if (model.api !== "pi-messages") return [cacheCase, businessCase];
	const message = clone(base);
	message.content = [
		{ type: "text", text: "", textSignature: "signed" },
		{ type: "thinking", thinking: "", thinkingSignature: "opaque", redacted: false },
		{ type: "toolCall", id: "opaque|id!?", name: "echo", arguments: { text: "你好" }, thoughtSignature: "thought", namespace: "space" },
	];
	message.responseId = "pi-id";
	message.providerThinkingLevel = "custom";
	message.usage = { input: 10, output: 5, cacheRead: 3, cacheWrite: 2, reasoning: 1, totalTokens: 123,
		cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 } };
	return [
		cacheCase, businessCase,
		{ name: "reply-pi-identity-metadata", message },
		{ name: "reply-pi-empty", message: { ...clone(base), content: [] } },
		{ name: "reply-pi-aborted", message: { ...clone(message), stopReason: "aborted", errorMessage: "cancelled" } },
	];
}
