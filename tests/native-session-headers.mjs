export function nativeSessionHeaders(api, model, options) {
	const headers = {};
	const merge = (source) => { for (const [key, value] of Object.entries(source ?? {})) {
		const name = key.toLowerCase();
		if (value == null) delete headers[name]; else headers[name] = value;
	} };
	const compat = model.compat ?? {};
	const router = model.provider === "openrouter" || String(model.baseUrl).includes("openrouter.ai");
	const session = options.cacheRetention === "none" ? undefined : options.sessionId;
	if (api !== "anthropic-messages") merge(model.headers);
	if (session) {
		if (api === "anthropic-messages") {
			if ((compat.sendSessionAffinityHeaders ?? router) && model.provider !== "github-copilot" && !String(options.apiKey ?? "").includes("sk-ant-oat")) {
				headers[(compat.sessionAffinityFormat ?? (router ? "openrouter" : undefined)) === "openrouter" ? "x-session-id" : "x-session-affinity"] = session;
			}
		} else if (api === "openai-responses" || api === "openai-completions" && (compat.sendSessionAffinityHeaders ?? router)) {
			const format = compat.sessionAffinityFormat ?? (router ? "openrouter" : "openai");
			if (format === "openrouter") headers["x-session-id"] = session;
			else {
				if (format === "openai") headers.session_id = session;
				headers["x-client-request-id"] = session;
				if (api === "openai-completions") headers["x-session-affinity"] = session;
			}
		}
	}
	if (api === "anthropic-messages") merge(model.headers);
	merge(options.headers);
	if (session && api === "openai-codex-responses") {
		headers["session-id"] = [...session].slice(0, 64).join(""); headers["x-client-request-id"] = headers["session-id"];
	}
	if (session && api === "mistral-conversations" && ![model.headers, options.headers].some((source) => Object.keys(source ?? {}).some((key) => key.toLowerCase() === "x-affinity"))) headers["x-affinity"] = session;
	return headers;
}

export function nativeSession(api, model, options) {
	const h = nativeSessionHeaders(api, model, options);
	const retained = options.cacheRetention !== "none" && options.sessionId ? options.sessionId : undefined;
	const short = retained === undefined ? undefined : [...retained].slice(0, 64).join("");
	if (api === "anthropic-messages") return h["x-session-affinity"] ?? h["x-session-id"];
	if (api === "openai-completions") return model.provider === "openai" ? short ?? h["x-session-id"] ?? h["x-session-affinity"] ?? h["x-client-request-id"] : h["x-session-id"] ?? h["x-session-affinity"] ?? h["x-client-request-id"];
	if (api === "openai-responses") return h.session_id ?? h["x-client-request-id"] ?? h["x-session-id"] ?? short;
	if (api === "mistral-conversations") return h["x-affinity"];
	return undefined;
}
