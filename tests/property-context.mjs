export function decodedContext(request) {
	const context = structuredClone(request.context);
	for (const message of context.messages) {
		if (message.role === "assistant" || !Array.isArray(message.content)) continue;
		message.content = message.content.map((block) => block.type ? block : {
			...block, type: Object.hasOwn(block, "text") ? "text" : "image",
		});
	}
	return context;
}
