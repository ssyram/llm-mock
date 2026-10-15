import { decodedContext } from "./property-context.mjs";
import { deepDiff } from "./harness.mjs";

export function requestProjection(first, actual, canonical, model, options) {
	const expected = canonical(decodedContext(first), model, options);
	const rawDiffs = deepDiff(actual, first, [], "$", [], model.api);
	return {
		first,
		expected,
		actual,
		rawIdempotent: rawDiffs.length === 0,
		rawDiffs,
		diffs: deepDiff(actual, expected, [], "$", [], model.api),
	};
}
