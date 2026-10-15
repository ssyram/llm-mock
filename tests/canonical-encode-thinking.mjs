// Target-domain projection, independent of reply provenance and request-side TM.
export function projectEncodeThinking(api, content) {
	return content.flatMap((block) => {
		if (block.type !== "thinking" || block.thinkingSignature == null) return [block];
		let supported = true;
		if (api.endsWith("responses")) {
			try { supported = JSON.parse(block.thinkingSignature)?.type === "reasoning"; }
			catch { supported = false; }
		} else if (api === "openai-completions") {
			supported = ["reasoning_content", "reasoning", "reasoning_text"].includes(block.thinkingSignature);
			if (!supported) {
				try {
					const details = JSON.parse(block.thinkingSignature);
					supported = Array.isArray(details) && details.every((detail) =>
						["reasoning.summary", "reasoning.encrypted", "reasoning.text"].includes(detail?.type));
				} catch { supported = false; }
			}
		} else if (api === "mistral-conversations") supported = false;
		if (supported) return [block];
		if (block.redacted || !block.thinking.trim()) return [];
		return [{ type: "text", text: block.thinking }];
	});
}
