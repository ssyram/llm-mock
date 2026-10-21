import { nativeSessionHeaders } from "./native-session-headers.mjs";

export function requestDomain(api, model, options) {
	if (!["openai-completions", "openai-responses", "openai-codex-responses", "mistral-conversations", "anthropic-messages"].includes(api)) return undefined;
	try {
		new Headers(nativeSessionHeaders(api, model, options));
	} catch (error) {
		return { kind: "expected-rejection", boundary: "request-header", reason: String(error.message) };
	}
	return undefined;
}
