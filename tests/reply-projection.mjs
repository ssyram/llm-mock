import { finalizeUsage } from "./canonical-reply-usage.mjs";
import { projectEncodeThinking } from "./canonical-encode-thinking.mjs";

export function projectReply(api, source, model, fill) {
	const output = structuredClone(source);
	output.content = projectEncodeThinking(api, output.content);
	Object.assign(output, { role: "assistant", api: model.api, provider: model.provider, model: model.id });
	for (const key of ["timestamp", "durationMs", "thinkingLevel", "providerThinkingLevel", "diagnostics", "deferred"]) delete output[key];
	fill(output, model, source);
	finalizeUsage(output, model, api);
	return output;
}
