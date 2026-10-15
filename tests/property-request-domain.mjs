export function requestDomain(api, model, options) {
	if (api !== "openai-responses" || options.cacheRetention === "none" || !options.sessionId) return undefined;
	const headers = { ...model.headers };
	const format = model.compat?.sessionAffinityFormat ?? "openai";
	if (format === "openrouter") headers["x-session-id"] = options.sessionId;
	else {
		if (format === "openai") headers.session_id = options.sessionId;
		headers["x-client-request-id"] = options.sessionId;
	}
	Object.assign(headers, options.headers);
	try {
		new Headers(headers);
	} catch (error) {
		return { kind: "expected-rejection", boundary: "request-header", reason: String(error.message) };
	}
	return undefined;
}
