import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { deepDiff } from "./harness.mjs";
import { decodedContext } from "./property-context.mjs";

export function replyComposition(api, source, first, second, model, windows) {
	const expectedFirst = canonicalReply(api, source, model);
	const expectedSecond = canonicalReply(api, first.parsed, model);
	const rawFrameDiffs = deepDiff(second.frames, first.frames);
	return {
		expectedFirst, expectedSecond, first: first.parsed, actual: second.parsed,
		frames: first.frames, repeatedFrames: second.frames,
		rawFrameStable: rawFrameDiffs.length === 0, rawFrameDiffs,
		diffs: [...compareReply(first.parsed, expectedFirst, deepDiff, ...windows[0]).map((diff) => `first: ${diff}`),
			...compareReply(second.parsed, expectedSecond, deepDiff, ...windows[1]).map((diff) => `second: ${diff}`)],
	};
}

export function crossProjection(source, first, repeated, canonical, model, options) {
	const expected = canonical(decodedContext(source), model, options);
	const repeatedExpected = canonical(decodedContext(expected), model, options);
	const rawStabilityDiffs = deepDiff(repeated, first, [], "$", [], model.api);
	return { expected, actual: first, repeated, repeatedExpected,
		rawStable: rawStabilityDiffs.length === 0, rawStabilityDiffs,
		diffs: [...deepDiff(first, expected, [], "$", [], model.api).map((diff) => `projection: ${diff}`),
			...deepDiff(repeated, repeatedExpected, [], "$", [], model.api).map((diff) => `composition: ${diff}`)],
	};
}
