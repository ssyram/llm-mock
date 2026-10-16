import { withCapture } from "./harness.mjs";

export async function emptyGoogleRejection(server, stream, model, context, options) {
	const original = globalThis.fetch;
	let fetchCalls = 0;
	globalThis.fetch = (...args) => { fetchCalls++; return original(...args); };
	try {
		const { value } = await withCapture(server, () => stream(model, context, { ...options, signal: AbortSignal.timeout(10000) }).result(), 0);
		const diffs = [];
		if (fetchCalls !== 0) diffs.push(`expected no fetch calls, got ${fetchCalls}`);
		if (value.stopReason !== "error" || !value.errorMessage?.includes("contents are required")) diffs.push(`expected empty contents rejection, got ${JSON.stringify(value)}`);
		return { outcome: "expected-rejection", boundary: "empty-google-contents", ok: !diffs.length, diffs,
			actual: { fetchCalls, captures: 0, stopReason: value.stopReason, errorMessage: value.errorMessage } };
	} finally { globalThis.fetch = original; }
}
