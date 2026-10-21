import { nativeSampling } from "./native-sampling.ts";
import type { Model, Options } from "./behavior.ts";
export function sampledOutputLimit(model: Model, options: Options, fallback: unknown): unknown {
	const params = nativeSampling(model, options);
	if (model.api === "openai-responses") return Object.hasOwn(params, "max_output_tokens") ? params.max_output_tokens ?? undefined : fallback;
	const provider = model.provider, url = String(model.baseUrl ?? "");
	const legacy = ["deepseek", "moonshotai", "moonshotai-cn", "cloudflare-ai-gateway", "together", "nvidia", "ant-ling", "zai", "zai-coding-cn"].includes(provider) || /chutes\.ai|deepseek\.com|api\.moonshot\.|gateway\.ai\.cloudflare\.com|api\.together\.|integrate\.api\.nvidia\.com|api\.ant-ling\.com|api\.z\.ai|open\.bigmodel\.cn/.test(url);
	const field = model.compat?.maxTokensField ?? (legacy ? "max_tokens" : "max_completion_tokens");
	const values = { [String(field)]: fallback, ...params };
	return values.max_completion_tokens ?? values.max_tokens;
}
