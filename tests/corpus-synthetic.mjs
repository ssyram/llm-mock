const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
const zeroUsage = () => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { ...zeroCost },
});

function sameModelAssistant(api, provider, id, content, extra = {}) {
	return {
		role: "assistant",
		content,
		api,
		provider,
		model: id,
		usage: zeroUsage(),
		stopReason: "stop",
		timestamp: 1,
		...extra,
	};
}

// Synthetic shapes the real corpus lacks. `ident` supplies the harness model
// identity so same-model thinking/signature roundtrips can be exercised.
export function syntheticContexts(ident) {
	const { api, provider, id } = ident;
	// Same-model thinking signatures are API-specific: completions uses a field
	// name, responses uses a reasoning-item JSON, anthropic any string.
	const thinkingSig =
		["openai-responses", "azure-openai-responses", "openai-codex-responses"].includes(api)
			? JSON.stringify({ type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "s" }] })
			: "reasoning_content";
	const echoTool = {
		name: "echo",
		description: "Echo the given text.",
		parameters: {
			type: "object",
			required: ["text"],
			properties: { text: { type: "string", description: "text to echo" } },
		},
	};
	const cases = [];

	cases.push({
		name: "syn-tools-declared",
		messages: [
			{
				role: "system",
				content: "You have tools.",
				toolsAdded: [structuredClone(echoTool)],
				timestamp: 1,
			},
			{ role: "user", content: "call the tool", timestamp: 2 },
		],
	});

	cases.push({
		name: "syn-multi-toolcall",
		messages: [
			{ role: "user", content: "echo twice", timestamp: 1 },
			sameModelAssistant(api, provider, id, [
				{ type: "text", text: "Calling twice." },
				{ type: "toolCall", id: "call_a1", name: "echo", arguments: { text: "one" } },
				{ type: "toolCall", id: "call_a2", name: "echo", arguments: { text: "two" } },
			], { stopReason: "toolUse" }),
			{
				role: "toolResult",
				toolCallId: "call_a1",
				toolName: "echo",
				content: [{ type: "text", text: "one" }],
				isError: false,
				timestamp: 2,
			},
			{
				role: "toolResult",
				toolCallId: "call_a2",
				toolName: "echo",
				content: [{ type: "text", text: "two" }],
				isError: true,
				timestamp: 3,
			},
		],
	});

	cases.push({
		name: "syn-same-model-thinking",
		messages: [
			{ role: "user", content: "think hard", timestamp: 1 },
			sameModelAssistant(api, provider, id, [
				{ type: "thinking", thinking: "first thought", thinkingSignature: thinkingSig },
				{ type: "thinking", thinking: "second thought", thinkingSignature: thinkingSig },
				{ type: "text", text: "done" },
			]),
		],
	});

	cases.push({
		name: "syn-assistant-multi-text",
		messages: [
			{ role: "user", content: "say two things", timestamp: 1 },
			sameModelAssistant(api, provider, id, [
				{ type: "text", text: "part one" },
				{ type: "text", text: "part two" },
			]),
		],
	});

	cases.push({
		name: "syn-error-assistant-dropped",
		messages: [
			{ role: "user", content: "trigger failure", timestamp: 1 },
			sameModelAssistant(api, provider, id, [{ type: "text", text: "boom" }], {
				stopReason: "error",
				errorMessage: "Provider exploded",
			}),
			{ role: "user", content: "retry", timestamp: 2 },
		],
	});

	cases.push({
		name: "syn-user-blocks",
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: "line one" },
					{ type: "text", text: "" },
					{ type: "text", text: "line two" },
				],
				timestamp: 1,
			},
		],
	});

	// 1x1 transparent PNG. All four request encoders emit user image blocks
	// unconditionally; canonicals expect decode to preserve data/mimeType.
	const tinyPng =
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
	cases.push({
		name: "syn-user-image",
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: "what is in this picture?" },
					{ type: "image", data: tinyPng, mimeType: "image/png" },
					{ type: "text", text: "answer briefly" },
				],
				timestamp: 1,
			},
		],
	});

	return cases;
}
