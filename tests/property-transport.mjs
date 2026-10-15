import { writeFileSync } from "node:fs";
import { withCapture } from "./harness.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { piAi } from "./pi-ai-imports.mjs";

const nativeFetch = globalThis.fetch;

export function parseFrames(body) {
	return body.replace(/\r\n?/g, "\n").split(/\n\n+/).filter((frame) => frame.trim()).map((frame) => {
		const lines = frame.split("\n");
		const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
		const metadata = lines.filter((line) => !line.startsWith("data:"));
		return { metadata, data: data === "[DONE]" ? data : JSON.parse(data) };
	});
}

export async function captureRequest(api, model, options, server, context) {
	const { record, value } = await withCapture(server, () => STREAMERS[api](model,
		piAi.normalizeContext(context), { ...options, signal: AbortSignal.timeout(10000) }).result());
	if (record.api !== api) throw new Error(`capture API ${record.api}, expected ${api}`);
	return { request: record.request, parsed: value };
}

export async function captureReply(api, model, options, server, message) {
	writeFileSync(server.replyPath, JSON.stringify(message));
	const responses = [];
	globalThis.fetch = async (...args) => {
		const response = await nativeFetch(...args);
		const body = await response.clone().text();
		responses.push({ status: response.status, body });
		return response;
	};
	let captured;
	try {
		captured = await captureRequest(api, model, options, server,
			{ messages: [{ role: "user", content: "go", timestamp: 1 }] });
	} finally {
		globalThis.fetch = nativeFetch;
	}
	if (responses.length !== 1) throw new Error(`expected one encoder response, received ${responses.length}`);
	const wire = responses[0];
	if (wire.status !== 200) throw new Error(`encoder HTTP ${wire.status}: ${wire.body.slice(0, 600)}`);
	return { parsed: captured.parsed, frames: parseFrames(wire.body) };
}
