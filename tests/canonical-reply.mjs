import { providerContract } from "./provider-contracts.mjs";
import { expectsGeneratedToolId } from "./generated-tool-id.mjs";

export function canonicalReply(api, source, model) {
	return providerContract(api).reply(source, model);
}

export function compareReply(actual, expected, deepDiff, started, ended) {
	const comparableActual = structuredClone(actual);
	const comparableExpected = structuredClone(expected);
	const diffs = [];
	const ids = new Set();
	let lastCounter;
	for (let index = 0; index < expected.content.length; index++) {
		const block = expected.content[index];
		if (block.type !== "toolCall") continue;
		if (!expectsGeneratedToolId(block)) {
			ids.add(block.id);
			continue;
		}
		const id = actual.content[index]?.id;
		const prefix = `${block.name}_`;
		const suffix = typeof id === "string" && id.startsWith(prefix) ? id.slice(prefix.length) : "";
		const match = /^(\d+)_(\d+)$/.exec(suffix);
		if (!match || Number(match[1]) < started || Number(match[1]) > ended || Number(match[2]) < 1 || (lastCounter !== undefined && Number(match[2]) !== lastCounter + 1) || ids.has(id)) {
			diffs.push(`$.content[${index}].id: invalid pi-generated ID ${JSON.stringify(id)}`);
		}
		if (match) lastCounter = Number(match[2]);
		ids.add(id);
		if (comparableActual.content[index]) delete comparableActual.content[index].id;
		delete comparableExpected.content[index].id;
	}
	if (!Number.isFinite(actual.timestamp) || actual.timestamp < started || actual.timestamp > ended) diffs.push("$.timestamp: outside client request clock interval");
	if (actual.durationMs !== undefined && (!Number.isInteger(actual.durationMs) || actual.durationMs < 0)) diffs.push("$.durationMs: invalid local duration");
	for (const value of [comparableActual, comparableExpected]) {
		delete value.timestamp;
		delete value.durationMs;
	}
	return deepDiff(comparableActual, comparableExpected, [], "$", diffs);
}
