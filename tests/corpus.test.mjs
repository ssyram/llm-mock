import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCorpora, corpusContexts, syntheticContexts } from "./corpus.mjs";

function temporaryRoot(t) {
	const root = mkdtempSync(join(tmpdir(), "corpus-test-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return root;
}

function captureDirectory(root, name) {
	const directory = join(root, name, "real-session/.pi/mock-corpus");
	mkdirSync(directory, { recursive: true });
	return directory;
}

test("loadCorpora: absent private captures skip all 18 sessions, not synthetic cases", (t) => {
	const output = [];
	t.mock.method(console, "log", (line) => output.push(line));
	const corpora = loadCorpora(temporaryRoot(t));
	assert.deepEqual(corpora, []);
	assert.deepEqual(corpusContexts(corpora), []);
	assert.equal(output.filter((line) => line.startsWith("SKIP corpus/")).length, 18);
	assert.equal(output.at(-1), "Corpus sessions: 0 loaded / 18 skipped");
	assert.ok(syntheticContexts({ api: "openai-completions", provider: "mock", id: "mock" }).length > 0);
});

test("loadCorpora: partial private capture set runs available cases", (t) => {
	t.mock.method(console, "log", () => {});
	const root = temporaryRoot(t);
	const directory = captureDirectory(root, ".tmp-corpus-sample-claude2");
	const message = { role: "user", content: "synthetic example", timestamp: 0 };
	writeFileSync(join(directory, "synthetic.jsonl"), JSON.stringify({ message }) + "\n");
	const corpora = loadCorpora(root);
	assert.deepEqual(corpora, [{ name: "claude2", messages: [message] }]);
	assert.deepEqual(corpusContexts(corpora), [{ name: "corpus-thinking", messages: [message] }]);
});

test("loadCorpora: malformed available captures still fail", (t) => {
	t.mock.method(console, "log", () => {});
	const root = temporaryRoot(t);
	const directory = captureDirectory(root, ".tmp-corpus-sample-claude2");
	assert.throws(() => loadCorpora(root), /expected 1 corpus jsonl/);
	writeFileSync(join(directory, "synthetic.jsonl"), "invalid JSON\n");
	assert.throws(() => loadCorpora(root), SyntaxError);
});
