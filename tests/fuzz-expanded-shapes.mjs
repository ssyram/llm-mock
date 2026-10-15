export const SHAPES = ["user-image", "system-replay", "deep-12-assistants", "long-text", "empty-text", "unicode-controls", "nested-arguments", "mixed-tool-errors"];
export const shapeFor = (seed) => SHAPES[(seed - 1) % SHAPES.length];
export const image = () => ({ type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" });
export const specialText = "中文 café e\u0301 Ελληνικά العربية 日本語 🚀🙂👩‍💻\u0000\u0001\b\f\n\r\t\u001f\u007f\u2028\u2029";
export const longText = (seed) => `${seed}:` + "长文🚀abc\n".repeat(4096);
export function largeArguments(seed) {
	let value = { leaf: specialText, empty: "", "": "Bedrock Q removes this key", number: seed, nil: null, yes: true };
	for (let depth = 0; depth < 8; depth++) value = { depth, child: value, items: Array.from({ length: 24 }, (_, i) => ({ i, text: `${seed}-${depth}-${i}🚀` })) };
	return value;
}
const tool = (name, description) => ({ name, description, parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } });
const assistant = (ident, content, timestamp = 2) => ({ role: "assistant", content, api: ident.api, provider: ident.provider, model: ident.id,
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp });

// Expectations stay in the frozen canonicals; this module constructs only source inputs.
export function expandContext(context, ident, seed) {
	const shape = shapeFor(seed);
	const messages = context.messages;
	if (shape === "user-image") messages.push({ role: "user", content: [{ type: "text", text: "before" }, image(), { type: "text", text: "after" }, image()], timestamp: 100 });
	if (shape === "system-replay") {
		messages.unshift({ role: "system", content: "initial", sections: { z: "old-z", a: "old-a", remove: "gone" }, toolsAdded: [tool("echo", "v1"), tool("retire", "gone")], timestamp: 0 });
		messages.push({ role: "system", content: "middle", sections: { z: "new-z", remove: null, fresh: specialText }, toolsRemoved: [{ name: "retire" }, { name: "echo" }], toolsAdded: [tool("echo", "v2"), tool("fresh", "new")], timestamp: 100 });
		messages.push({ role: "user", content: "after patch", timestamp: 101 }, { role: "system", content: "", sections: { a: null, remove: "restored" }, toolsRemoved: [{ name: "fresh" }], toolsAdded: [tool("echo", "v3")], timestamp: 102 });
	}
	if (shape === "deep-12-assistants") {
		for (let i = 0; i < 12; i++) messages.push({ role: "user", content: `turn ${i}`, timestamp: 100 + i * 2 }, assistant(ident, [{ type: "text", text: `answer ${i} ${specialText}` }], 101 + i * 2));
	}
	if (["long-text", "empty-text", "unicode-controls"].includes(shape)) {
		const value = shape === "long-text" ? longText(seed) : shape === "empty-text" ? "" : specialText;
		messages.push({ role: "user", content: value, timestamp: 100 }, { role: "user", content: [{ type: "text", text: value }, { type: "text", text: "" }], timestamp: 101 }, assistant(ident, [{ type: "text", text: value }, { type: "text", text: "" }]));
	}
	if (["nested-arguments", "mixed-tool-errors"].includes(shape)) {
		const count = shape === "mixed-tool-errors" ? 4 : 1;
		const calls = Array.from({ length: count }, (_, i) => ({ type: "toolCall", id: `expanded_${seed}_${i}`, name: `expanded${i}`, arguments: largeArguments(seed + i) }));
		messages.push({ ...assistant(ident, calls), stopReason: "toolUse" });
		for (const [i, call] of calls.entries()) messages.push({ role: "toolResult", toolCallId: call.id, toolName: call.name,
			content: [{ type: "text", text: specialText }, ...(shape === "mixed-tool-errors" ? [image(), { type: "text", text: "tail" }] : [])], isError: i % 2 === 1, timestamp: 103 + i });
	}
	return { ...context, shape, ...(ident.api === "mistral-conversations" ? { mount: "mistral" } : {}) };
}

export function expandReply(reply, seed) {
	const shape = shapeFor(seed);
	const content = reply.message.content;
	if (["long-text", "empty-text", "unicode-controls"].includes(shape)) content.push({ type: "text", text: shape === "long-text" ? longText(seed) : shape === "empty-text" ? "" : specialText });
	if (["nested-arguments", "mixed-tool-errors"].includes(shape)) {
		for (let i = 0; i < (shape === "mixed-tool-errors" ? 4 : 1); i++) content.push({ type: "toolCall", id: `expanded_r${seed}_${i}`, name: `expanded${i}`, arguments: largeArguments(seed + i) });
	}
	return { ...reply, shape };
}
