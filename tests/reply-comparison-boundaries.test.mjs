import test from "node:test";
import assert from "node:assert/strict";
import { compareReply } from "./canonical-reply.mjs";
import { deepDiff } from "./harness.mjs";

const expected = {
	api: "openai-responses", content: [{ type: "toolCall", id: "call", name: "echo", arguments: {
		timestamp: 11, durationMs: 22, nested: { timestamp: "business-time" }, thinkingSignature: '{"a":1,"b":2}',
	} }],
};

test("only root client clocks are normalized; business clock fields and opaque strings remain exact", () => {
	const actual = { ...structuredClone(expected), timestamp: 1000, durationMs: 3 };
	assert.deepEqual(compareReply(actual, expected, deepDiff, 999, 1001), []);
	for (const mutate of [
		(a) => { a.timestamp = 999; },
		(a) => { a.durationMs = 888; },
		(a) => { a.nested.timestamp = "WRONG"; },
		(a) => { a.thinkingSignature = '{"b":2,"a":1}'; },
	]) {
		const broken = structuredClone(actual);
		mutate(broken.content[0].arguments);
		assert.notDeepEqual(compareReply(broken, expected, deepDiff, 999, 1001), []);
	}
});

test("ordered system sections are not treated like unordered tool argument objects", () => {
	const request = { context: { messages: [{ role: "system", sections: { z: "FIRST", a: "SECOND" } }] } };
	const broken = structuredClone(request);
	broken.context.messages[0].sections = { a: "SECOND", z: "FIRST" };
	assert.notDeepEqual(deepDiff(broken, request), []);
	assert.deepEqual(deepDiff({ arguments: { sections: { a: 2, z: 1 } } }, { arguments: { sections: { z: 1, a: 2 } } }), []);
});
