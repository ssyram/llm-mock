export function* streamPartitions(bytes, windowSize = 12) {
	const length = bytes.length;
	yield { label: "whole", cuts: [] };
	for (let cut = 1; cut < length; cut++) yield { label: "single", cuts: [cut] };
	yield { label: "one-byte", cuts: Array.from({ length: Math.max(0, length - 1) }, (_, index) => index + 1) };
	const nonAscii = bytes.findIndex((byte) => byte >= 128);
	const start = Math.max(1, nonAscii < 0 ? 1 : nonAscii - 2);
	const end = Math.min(length - 1, start + windowSize - 1);
	for (let a = start; a <= end; a++) for (let b = a + 1; b <= end; b++) yield { label: "double-window", cuts: [a, b], window: [start, end] };
}

export function partitionBytes(bytes, cuts) {
	const boundaries = [0, ...cuts, bytes.length];
	return boundaries.slice(0, -1).map((from, index) => bytes.subarray(from, boundaries[index + 1]));
}

export function streamChunks(bytes, cuts, options = {}) {
	const parts = partitionBytes(bytes, cuts);
	let index = 0;
	return new ReadableStream({
		pull(controller) {
			if (options.abortAfter !== undefined && index === options.abortAfter) {
				options.abort.abort();
				controller.error(new DOMException("cancelled experiment", "AbortError"));
				return;
			}
			if (index < parts.length) controller.enqueue(parts[index++]);
			else controller.close();
		},
	});
}
