import test from "node:test";
import assert from "node:assert/strict";
import { replyComposition, crossProjection } from "./property-composition.mjs";
import { canonicalReply } from "./canonical-reply.mjs";
import { makeModel } from "./models-shared.mjs";
import { replyCases } from "./corpus.mjs";
import { propertySummary } from "./property-report.mjs";

test("property counters never count rejected or inapplicable rows as semantic matches", () => {
	const result = propertySummary([{ ok: true }, { ok: true, outcome: "expected-rejection" },
		{ ok: true, outcome: "not-applicable" }, { ok: false }, { ok: true, rawFrameStable: false, rawStable: false }]);
	assert.deepEqual(result, { matched: 2, expectedRejections: 1, notApplicable: 1, failed: 1, rawFrameChanges: 1, rawProjectionChanges: 1 });
});

const stamp = (value) => ({ ...structuredClone(value), timestamp: 150 });
test("frame changes are retained while both independent semantic checks remain mandatory", () => {
	const api = "openai-responses", model = makeModel(api, 1);
	const source = replyCases({ api, provider: model.provider, id: model.id })[0].message;
	const first = { parsed: stamp(canonicalReply(api, source, model)), frames: [{ data: { usage: {} } }] };
	const second = { parsed: stamp(canonicalReply(api, first.parsed, model)), frames: [{ data: { usage: { reasoning: 0 } } }] };
	const windows = [[100, 200], [100, 200]];
	const result = replyComposition(api, source, first, second, model, windows);
	assert.deepEqual(result.diffs, []);
	assert.equal(result.rawFrameStable, false);
	assert.ok(result.rawFrameDiffs.length);
	for (const index of [0, 1]) {
		const changed = structuredClone(index ? second : first);
		changed.parsed.usage.input++;
		assert.ok(replyComposition(api, source, index ? first : changed, index ? changed : second, model, windows).diffs.length);
	}
});

test("cross projection checks canonical composition instead of assuming a fixed point", () => {
	const model = makeModel("google-generative-ai", 1);
	const wrap = (n) => ({ model: "m", context: { messages: [{ role: "user", content: String(n) }] }, options: {} });
	const canonical = (context) => wrap(Number(context.messages[0].content) + 1);
	const source = wrap(0), first = wrap(1), repeated = wrap(2);
	const result = crossProjection(source, first, repeated, canonical, model, {});
	assert.deepEqual(result.diffs, []);
	assert.equal(result.rawStable, false);
	assert.ok(result.rawStabilityDiffs.length);
	assert.ok(crossProjection(source, first, wrap(3), canonical, model, {}).diffs.length);
	assert.ok(crossProjection(source, wrap(9), repeated, canonical, model, {}).diffs.length);
});
