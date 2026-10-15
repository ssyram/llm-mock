// Shared matrix machinery for duality.mjs and fuzz.mjs: per-API stream entry
// points, request-direction and reply-direction runners, and the reply-side
// providerFill expectations (per api/*.md §c providerFill notes).
import { writeFileSync } from "node:fs";
import { withCapture, deepDiff } from "./harness.mjs";
import { occ, ores, am, gai, azure, codex, vertex, bedrock, mistral, pm, piAi } from "./pi-ai-imports.mjs";
import { streamOptions } from "./models-shared.mjs";
import { replyCases } from "./corpus.mjs";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { compareRequest } from "./canonical-request-comparison.mjs";

export const STREAMERS = {
	"openai-completions": (m, ctx, opts) => occ.stream(m, ctx, opts),
	"openai-responses": (m, ctx, opts) => ores.stream(m, ctx, opts),
	"anthropic-messages": (m, ctx, opts) => am.stream(m, ctx, opts),
	"google-generative-ai": (m, ctx, opts) => gai.stream(m, ctx, opts),
	"azure-openai-responses": (m, ctx, opts) => azure.stream(m, ctx, opts),
	"openai-codex-responses": (m, ctx, opts) => codex.stream(m, ctx, opts),
	"google-vertex": (m, ctx, opts) => vertex.stream(m, ctx, opts),
	"bedrock-converse-stream": (m, ctx, opts) => bedrock.stream(m, ctx, opts),
	"mistral-conversations": (m, ctx, opts) => mistral.stream(m, ctx, opts),
	"pi-messages": (m, ctx, opts) => pm.stream(m, ctx, opts),
};

export async function requestDirection(api, model, server, cases, canonicalFn, results) {
	for (const tc of cases) {
		try {
			const caseModel = { ...model, ...tc.modelOverrides, ...(tc.mount === "mistral" ? { baseUrl: server.mistralBaseUrl } : {}) };
			const options = { ...streamOptions(api), ...tc.options };
			const started = Date.now();
			const cap = await withCapture(server, () =>
				STREAMERS[api](caseModel, piAi.normalizeContext(tc), { ...options, signal: AbortSignal.timeout(10000) }).result(),
			);
			const expected = canonicalFn(tc, caseModel, options);
			const diffs = compareRequest(cap.record.request, expected, api, started, Date.now());
			if (cap.record.api !== api) diffs.unshift(`capture API: expected ${api}, got ${cap.record.api}`);
			results.push({ api, dir: "req", name: tc.name, ...(tc.mount ? { mount: tc.mount } : {}), ok: diffs.length === 0, diffs, expected, actual: cap.record.request });
		} catch (e) {
			results.push({ api, dir: "req", name: tc.name, ok: false, diffs: [String(e?.message ?? e).slice(0, 800)], expected: null, actual: null });
		}
	}
}

// cases: [{name, message}] in Rust serde AssistantMessage shape. Defaults to
// the fixed replyCases(ident) set; fuzz.mjs passes its own generated cases.
export async function replyDirection(api, model, server, results, cases, optionsOverride = {}) {
	const list = cases ?? replyCases({ api, provider: model.provider, id: model.id });
	for (const tc of list) {
		let phase = "capture";
		try {
			writeFileSync(server.replyPath, JSON.stringify(tc.message));
			const started = Date.now();
			const { value: got, record } = await withCapture(server, () =>
				STREAMERS[api](model, piAi.normalizeContext({ messages: [{ role: "user", content: "go", timestamp: 1 }] }), { ...streamOptions(api), ...optionsOverride, signal: AbortSignal.timeout(10000) }).result(),
			);
			phase = "oracle";
			const expected = canonicalReply(api, tc.message, model);
			phase = "compare";
			const diffs = compareReply(got, expected, deepDiff, started, Date.now());
			if (record.api !== api) diffs.unshift(`capture API: expected ${api}, got ${record.api}`);
			results.push({ api, dir: "reply", name: tc.name, ok: diffs.length === 0, diffs, expected, actual: got });
		} catch (e) {
			results.push({ api, dir: "reply", name: tc.name, phase, ok: false, diffs: [String(e?.message ?? e).slice(0, 800)], expected: null, actual: null });
		}
	}
}

