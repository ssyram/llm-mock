export function matrixSummary(results) {
	return {
		matched: results.filter((row) => row.ok && row.outcome !== "expected-rejection").length,
		expectedRejections: results.filter((row) => row.ok && row.outcome === "expected-rejection").length,
		failed: results.filter((row) => !row.ok).length,
	};
}

export function matrixSummaryText(results) {
	const { matched, expectedRejections, failed } = matrixSummary(results);
	return `${matched} matched / ${expectedRejections} expected rejections / ${failed} fail`;
}
