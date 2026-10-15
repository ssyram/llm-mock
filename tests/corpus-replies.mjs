const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

// Reply-direction cases: an AssistantMessage (Rust serde shape) per case.
export function replyCases(ident) {
	const { api, provider, id } = ident;
	const thinkingSig =
		["openai-responses", "azure-openai-responses", "openai-codex-responses"].includes(api)
			? JSON.stringify({ type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Let me compute." }] })
			: "reasoning_content";
	const usage = (i, o, extra = {}) => ({
		input: i,
		output: o,
		cacheRead: 0,
		cacheWrite: 0,
		...(extra.reasoning !== undefined ? { reasoning: extra.reasoning } : {}),
		totalTokens: i + o,
		cost: { ...zeroCost },
	});
	const mk = (content, stopReason, extra = {}) => ({
		content,
		api,
		provider,
		model: id,
		usage: usage(10, 5, extra),
		stopReason,
		timestamp: 0,
		...(extra.responseId ? { responseId: extra.responseId } : {}),
		...(extra.errorMessage ? { errorMessage: extra.errorMessage } : {}),
	});
	return [
		{ name: "reply-text-stop", message: mk([{ type: "text", text: "7 + 8 = 15." }], "stop") },
		{
			name: "reply-thinking-text",
			message: mk(
				[
					{ type: "thinking", thinking: "Let me compute.", thinkingSignature: thinkingSig },
					{ type: "text", text: "15" },
				],
				"stop",
				{ reasoning: 2 },
			),
		},
		{
			name: "reply-single-toolcall",
			message: mk(
				[
					{ type: "text", text: "Calling." },
					{ type: "toolCall", id: "call_x1", name: "echo", arguments: { text: "hi" } },
				],
				"toolUse",
			),
		},
		{
			name: "reply-multi-toolcall",
			message: mk(
				[
					{ type: "toolCall", id: "call_b1", name: "echo", arguments: { text: "one" } },
					{ type: "toolCall", id: "call_b2", name: "echo", arguments: { text: "two" } },
				],
				"toolUse",
			),
		},
		{ name: "reply-length", message: mk([{ type: "text", text: "trunc" }], "length") },
		{
			name: "reply-error-finish-reason",
			message: mk([{ type: "text", text: "partial" }], "error", {
				errorMessage: "Provider finish_reason: content_filter",
			}),
		},
		{
			name: "reply-response-id",
			message: mk([{ type: "text", text: "tagged" }], "stop", { responseId: "chatcmpl-duality-1" }),
		},
	];
}
