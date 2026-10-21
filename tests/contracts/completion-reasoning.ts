import type { Model, Options } from "./behavior.ts";
import { nativeSampling } from "./native-sampling.ts";
export function completionReasoning(model: Model, options: Options): unknown {
	const p = model.provider, url = String(model.baseUrl ?? ""), compat = model.compat ?? {};
	const zai = ["zai", "zai-coding-cn"].includes(p) || /api\.z\.ai|open\.bigmodel\.cn/.test(url);
	const together = p === "together" || /api\.together\.(ai|xyz)/.test(url);
	const ant = p === "ant-ling" || url.includes("api.ant-ling.com");
	const router = p === "openrouter" || url.includes("openrouter.ai");
	const deepseek = p === "deepseek" || url.toLowerCase().includes("deepseek.com");
	const format = compat.thinkingFormat ?? (deepseek ? "deepseek" : zai ? "zai" : together ? "together" : ant ? "ant-ling" : router ? "openrouter" : "openai");
	const supports = compat.supportsReasoningEffort ?? !(zai || together || ant || p === "xai" || url.includes("api.x.ai") || ["moonshotai", "moonshotai-cn", "nvidia", "cloudflare-ai-gateway"].includes(p) || /api\.moonshot\.|integrate\.api\.nvidia\.com|gateway\.ai\.cloudflare\.com/.test(url));
	const requested = options.reasoningEffort;
	const mapped = requested ? model.thinkingLevelMap?.[requested] : model.thinkingLevelMap?.off;
	const params: Record<string, unknown> = {};
	if (model.reasoning) {
		if (format === "openrouter") {
			if (requested || mapped !== null) params.reasoning = { effort: mapped ?? requested ?? "none" };
		} else if (format === "ant-ling") {
			if (requested && typeof mapped === "string") params.reasoning = { effort: mapped };
		} else if (format === "string-thinking") {
			if (requested || mapped !== null) params.thinking = mapped ?? requested ?? "none";
		} else if (!["chat-template", "qwen-chat-template"].includes(String(format)) && supports) {
			const canDisable = ["openai", "baseten"].includes(String(format));
			if (requested) params.reasoning_effort = format === "zai" ? mapped === undefined ? requested : mapped : mapped ?? requested;
			else if (canDisable && typeof mapped === "string") params.reasoning_effort = mapped;
		}
	}
	Object.assign(params, nativeSampling(model, options));
	const reasoning = params.reasoning;
	return typeof params.reasoning_effort === "string" ? params.reasoning_effort
		: reasoning && typeof reasoning === "object" && "effort" in reasoning && typeof reasoning.effort === "string" ? reasoning.effort
			: typeof params.thinking === "string" ? params.thinking : undefined;
}
