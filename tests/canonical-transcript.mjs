// Atlas G1 and the frozen protocol §4 transcript rules, independent of pi helpers.
export function normalizeContext(context) {
	const messages = structuredClone(context.messages ?? []);
	if (context.systemPrompt || context.tools?.length) messages.unshift({ role: "system", content: context.systemPrompt ?? "", timestamp: 0,
		...(context.tools?.length ? { toolsAdded: structuredClone(context.tools) } : {}) });
	return { messages };
}

export function contentText(content) {
	return typeof content === "string" ? content : (content ?? []).filter((block) => block.type === "text" || "text" in block).map((block) => block.text).join("\n");
}

export function getSystemMessageText(message) {
	return [contentText(message.content), ...Object.values(message.sections ?? {}).filter((value) => value !== null)]
		.filter((value) => value.length > 0).join("\n\n");
}

export function getCurrentTools(messages) {
	const tools = new Map();
	for (const message of messages) {
		if (message.role !== "system") continue;
		for (const removed of message.toolsRemoved ?? []) tools.delete(removed.name);
		for (const tool of message.toolsAdded ?? []) tools.set(tool.name, structuredClone(tool));
	}
	return [...tools.values()];
}

export function resolveTranscript(context, supportsMidConvo = false) {
	const normalized = normalizeContext(context);
	if (supportsMidConvo) return normalized;
	const systems = normalized.messages.filter((message) => message.role === "system");
	if (!systems.length) return normalized;
	const sections = new Map();
	for (const message of systems) {
		for (const [name, value] of Object.entries(message.sections ?? {})) {
			if (value === null) sections.delete(name);
			else sections.set(name, value);
		}
	}
	const tools = getCurrentTools(systems);
	return { messages: [{ role: "system", content: systems.map((message) => contentText(message.content)).filter(Boolean).join("\n\n"),
		timestamp: systems[0].timestamp, ...(sections.size ? { sections: Object.fromEntries(sections) } : {}),
		...(tools.length ? { toolsAdded: tools } : {}) }, ...normalized.messages.filter((message) => message.role !== "system")] };
}

export const collapseSystemMessages = (context) => resolveTranscript(context, false);
export const withoutInitialSystemMessage = (messages) => messages[0]?.role === "system" ? messages.slice(1) : messages;
export const resolveTranscriptTools = (messages) => ({ requestTools: getCurrentTools(messages) });
