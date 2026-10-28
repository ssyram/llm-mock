// Atlas G2: two passes, with image downgrade before cross-model projection.
export function transformMessages(messages, model, normalizeId) {
	const ids = new Map();
	const first = messages.map((original) => {
		const message = structuredClone(original);
		message.content ??= [];
		if (["user", "toolResult"].includes(message.role) && Array.isArray(message.content) && !model.input.includes("image")) {
			const note = message.role === "user" ? "(image omitted: model does not support images)" : "(tool image omitted: model does not support images)";
			message.content = message.content.reduce((blocks, block) => {
				if (block.type !== "image") blocks.push(block);
				else if (blocks.at(-1)?.text !== note) blocks.push({ type: "text", text: note });
				return blocks;
			}, []);
		}
		if (message.role === "assistant") {
			const same = message.api === model.api && message.provider === model.provider && message.model === model.id;
			message.content = message.content.flatMap((block) => {
				if (block.type === "thinking") {
					// pi-ai 1.4: cross-source thinking is DROPPED (signatures and
					// encrypted reasoning are only valid for the producing model;
					// readable thinking sent as plain text reads as part of the
					// visible reply), not downgraded to text.
					if (block.redacted || block.thinkingSignature) return same ? [block] : [];
					if (!block.thinking.trim()) return [];
					return same ? [block] : [];
				}
				if (!same && block.type === "text") delete block.textSignature;
				if (!same && block.type === "toolCall") {
					delete block.thoughtSignature;
					const id = normalizeId(block.id, model, message);
					ids.set(block.id, id);
					block.id = id;
				}
				return [block];
			});
		} else if (message.role === "toolResult" && ids.has(message.toolCallId)) message.toolCallId = ids.get(message.toolCallId);
		return message;
	});
	const result = [];
	let pending = [];
	let systems = [];
	const flush = () => {
		for (const call of pending) result.push({ role: "toolResult", toolCallId: call.id, toolName: call.name,
			content: [{ type: "text", text: "No result provided" }], isError: true, timestamp: 0 });
		pending = [];
		result.push(...systems);
		systems = [];
	};
	for (const message of first) {
		if (message.role === "assistant" && ["error", "aborted"].includes(message.stopReason)) continue;
		if (["user", "assistant"].includes(message.role)) flush();
		if (message.role === "system" && pending.length) { systems.push(message); continue; }
		result.push(message);
		if (message.role === "assistant") pending = message.content.filter((block) => block.type === "toolCall");
		if (message.role === "toolResult") {
			pending = pending.filter((call) => call.id !== message.toolCallId);
			if (!pending.length) flush();
		}
	}
	flush();
	return result;
}
