import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";

// readline treats U+2028/U+2029 inside valid JSON strings as record delimiters.
export async function* parseFuzzRecords(chunks) {
	let buffered = "";
	for await (const chunk of chunks) {
		buffered += chunk;
		let newline;
		while ((newline = buffered.indexOf("\n")) >= 0) {
			yield JSON.parse(buffered.slice(0, newline));
			buffered = buffered.slice(newline + 1);
		}
	}
	if (buffered.length) throw new Error("incomplete fuzz evidence record: missing LF terminator");
}
export function readFuzzEvidence(path) {
	const source = createReadStream(path);
	const input = String(path).endsWith(".gz") ? source.pipe(createGunzip()) : source;
	return parseFuzzRecords(input.setEncoding("utf8"));
}
