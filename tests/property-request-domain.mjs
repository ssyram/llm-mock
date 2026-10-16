export function requestDomain(api, model, options) {
	if (!["openai-responses", "openai-codex-responses", "mistral-conversations"].includes(api)
		|| options.cacheRetention === "none" || !options.sessionId) return undefined;
	try {
		if (api === "openai-responses") {
			const headers = { ...model.headers };
			const format = model.compat?.sessionAffinityFormat ?? "openai";
			if (format === "openrouter") headers["x-session-id"] = options.sessionId;
			else {
				if (format === "openai") headers.session_id = options.sessionId;
				headers["x-client-request-id"] = options.sessionId;
			}
			Object.assign(headers, options.headers);
			new Headers(headers);
		} else {
			const headers = new Headers();
			for (const source of [model.headers, options.headers]) {
				for (const [key, value] of Object.entries(source ?? {})) {
					if (value === null) headers.delete(key);
					else headers.set(key, value);
				}
			}
			if (api === "openai-codex-responses") {
				const session = [...options.sessionId].slice(0, 64).join("");
				headers.set("session-id", session);
				headers.set("x-client-request-id", session);
			} else if (![model.headers, options.headers].some((source) =>
				Object.keys(source ?? {}).some((key) => key.toLowerCase() === "x-affinity"))) {
				headers.set("x-affinity", options.sessionId);
			}
		}
	} catch (error) {
		return { kind: "expected-rejection", boundary: "request-header", reason: String(error.message) };
	}
	return undefined;
}
