import { withCapture } from "./harness.mjs";

export async function headerRejection(server, stream, model, context, options, domain) {
	let fetchCalls = 0;
	const countedFetch = (...args) => { fetchCalls++; return globalThis.fetch(...args); };
	const { value } = await withCapture(server, () => stream(model, context, {
		...options, fetch: countedFetch, signal: AbortSignal.timeout(10000),
	}).result(), 0);
	const diffs = [];
	if (fetchCalls !== 0) diffs.push(`expected no fetch calls, got ${fetchCalls}`);
	if (value.stopReason !== "error") diffs.push(`expected error stopReason, got ${value.stopReason}`);
	if (!value.errorMessage?.includes(domain.reason)) diffs.push(`expected header rejection ${JSON.stringify(domain.reason)}, got ${JSON.stringify(value.errorMessage)}`);
	return { outcome: "expected-rejection", domain, ok: diffs.length === 0, diffs,
		expected: { fetchCalls: 0, captures: 0, stopReason: "error", errorMessage: domain.reason },
		actual: { fetchCalls, captures: 0, stopReason: value.stopReason, errorMessage: value.errorMessage } };
}
