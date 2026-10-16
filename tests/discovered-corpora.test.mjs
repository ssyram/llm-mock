import test from "node:test";
import assert from "node:assert/strict";
import { loadDiscoveredCorpora } from "./discovered-corpora.mjs";
import { corpusContexts } from "./corpus.mjs";
import { corpusReplies } from "./extended-matrix-cases.mjs";

test("all public fragments enter request and reply case builders with provenance", () => {
	const corpora = loadDiscoveredCorpora();
	assert.equal(corpora.length, 5);
	assert.equal(corpora.reduce((n, c) => n + c.messages.length, 0), 25);
	const contexts = corpusContexts(corpora), replies = corpusReplies(corpora);
	assert.equal(contexts.length, 5);
	assert.equal(replies.length, corpora.flatMap((c) => c.messages).filter((m) => m.role === "assistant").length);
	for (const context of contexts) {
		assert.equal(context.provenance.classification, "sanitized-real-excerpts");
		assert.equal(context.provenance.fragment, true);
		assert.deepEqual(context.messages, corpora.find((c) => context.name.includes(c.name)).messages);
	}
	assert.ok(replies.every((reply) => reply.provenance.fragment));
});
