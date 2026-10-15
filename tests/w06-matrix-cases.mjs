const ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const image = { type: "image", data: "AQID", mimeType: "image/png" };
const tool = { name: "echo", description: "Echo", parameters: { type: "object", properties: { value: { type: "string" } } } };
const assistant = (model, content) => ({ role: "assistant", api: model.api, provider: model.provider, model: model.id, content, usage: structuredClone(ZERO), stopReason: "stop", timestamp: 1 });

export function w06RequestCases(model) {
	const call = { type: "toolCall", id: "call-1|fc_item", name: "echo", arguments: { value: "hello" }, namespace: "space", thoughtSignature: "AQID" };
	const signed = assistant(model, [{ type: "text", text: "", textSignature: model.api.endsWith("responses") ? '{"v":1,"id":"phase-id","phase":"commentary"}' : "AQID" }, call]);
	const result = { role: "toolResult", toolCallId: call.id, toolName: "echo", content: [image, { type: "text", text: "middle" }, image], isError: true, timestamp: 2 };
	const cases = [
		{ name: "w06-signed-empty-and-call", messages: [signed, { ...result, content: [{ type: "text", text: "ok" }] }] },
		{ name: "w06-vision-error-image-order", modelOverrides: { input: ["text", "image"] }, messages: [assistant(model, [call]), result] },
		{ name: "w06-vision-image-only", modelOverrides: { input: ["text", "image"] }, messages: [assistant(model, [call]), { ...result, content: [image], isError: false }] },
		{ name: "w06-tools-only-strict", messages: [{ role: "system", content: "", toolsAdded: [{ ...tool, constrainedSampling: { type: "json_schema", strict: "prefer" } }], timestamp: 1 }, { role: "user", content: "tools", timestamp: 2 }] },
		{ name: "w06-native-zero-max", options: { maxTokens: 0, temperature: 0 }, messages: [{ role: "user", content: "zero", timestamp: 1 }] },
		{ name: "w06-long-session", options: { sessionId: "s".repeat(70) }, messages: [{ role: "user", content: "session", timestamp: 1 }] },
		{ name: "w06-unicode-session", options: { sessionId: "😀".repeat(70) }, messages: [{ role: "user", content: "session", timestamp: 1 }] },
		{ name: "w06-retention-none", ...(model.api === "mistral-conversations" ? { mount: "mistral" } : {}), options: { cacheRetention: "none" }, messages: [{ role: "user", content: "session", timestamp: 1 }] },
	];
	if (model.api !== "pi-messages") cases.push({ name: "w06-surrogate-order", messages: [
		{ role: "system", content: "s\ud800x", timestamp: 1 }, { role: "user", content: [{ type: "text", text: "\ud800" }, { type: "text", text: "u\udc00x" }], timestamp: 2 },
		assistant(model, [{ type: "text", text: "\ud800" }, { type: "text", text: "a\ud800x" }]),
	] });
	if (model.api === "openai-completions") cases.push({ name: "w06-q-details-first", messages: [assistant(model, [
		{ type: "thinking", thinking: "", thinkingSignature: '[{"type":"reasoning.text","text":"first"}]' },
		{ type: "thinking", thinking: "visible", thinkingSignature: "reasoning_content" }, { type: "text", text: "kept" },
	])] });
	if (model.api === "bedrock-converse-stream") for (const signature of ["AQID", "!!!"]) cases.push({ name: `w06-q-redacted-${signature === "AQID" ? "valid" : "invalid"}`,
		messages: [assistant(model, [{ type: "thinking", thinking: "hidden", thinkingSignature: signature, redacted: true }, { type: "text", text: "kept" }])] });
	if (["google-generative-ai", "google-vertex"].includes(model.api)) cases.push({ name: "w06-gemini3-cross-id", modelOverrides: { id: "gemini-3-test", input: ["text", "image"] },
		messages: [assistant(model, [{ ...call, id: "foreign!|id", thoughtSignature: "AQID" }]), { ...result, toolCallId: "foreign!|id", isError: false }] });
	if (model.api.endsWith("responses")) cases.push({ name: "w06-foreign-item-id", modelOverrides: { provider: model.api === "azure-openai-responses" ? "azure" : "openai" },
		messages: [assistant({ ...model, provider: "foreign" }, [call]), { ...result, content: [{ type: "text", text: "ok" }] }] });
	return cases;
}

export function w06ReplyCases(model, base) {
	const make = (name, changes) => ({ name, message: { ...structuredClone(base), ...changes } });
	const text = [{ type: "text", text: "first", textSignature: "legacy" }, { type: "text", text: "second", textSignature: '{"v":1,"id":"second","phase":"final_answer"}' }];
	const cases = [
		make("w06-r-text-signatures", { content: text, responseId: "independent-id", responseModel: model.id, rawStopReason: "ignored-source", endTurn: false, errorMessage: "not-on-success" }),
		make("w06-r-toolUse-no-call", { content: [{ type: "text", text: "no tools" }], stopReason: "toolUse" }),
		make("w06-r-usage-zero-total", { content: [], usage: { input: 11, output: 1, cacheRead: 13, cacheWrite: 17, cacheWrite1h: 0, reasoning: 5, totalTokens: 0, cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 } } }),
		make("w06-r-error-missing", { content: [], stopReason: "error", errorMessage: undefined }),
		make("w06-r-error-empty", { content: [], stopReason: "error", errorMessage: "" }),
	];
	if (model.api === "openai-completions") cases.push(make("w06-r-duplicate-call", { content: [
		{ type: "toolCall", id: "duplicate", name: "first", arguments: { first: 1 } },
		{ type: "toolCall", id: "duplicate", name: "second", arguments: { second: 2 } },
	] }), make("w06-r-error-reserved", { stopReason: "error", errorMessage: "Provider finish_reason: stop" }), make("w06-r-error-nonprefix", { stopReason: "error", errorMessage: "noise Provider finish_reason: length" }));
	if (["google-generative-ai", "google-vertex"].includes(model.api)) {
		cases.push(make("w06-r-raw-stop", { stopReason: "error", rawStopReason: "STOP", errorMessage: "ignored" }));
		cases.push(make("w06-r-unique-and-duplicate-id", { model: "gemini-3-test", content: [
			{ type: "toolCall", id: "unique", name: "echo", arguments: { n: 1 }, thoughtSignature: "signature" },
			{ type: "toolCall", id: "unique", name: "echo", arguments: { n: 2 }, namespace: "lost" },
		], stopReason: "toolUse" }));
	}
	if (["bedrock-converse-stream", "mistral-conversations", "anthropic-messages", "pi-messages"].includes(model.api)) cases.push(make("w06-r-aborted", { stopReason: "aborted", errorMessage: "cancelled" }));
	if (["bedrock-converse-stream", "mistral-conversations", "anthropic-messages"].includes(model.api)) cases.push(make("w06-r-deferred", { stopReason: "deferred" }));
	return cases;
}
