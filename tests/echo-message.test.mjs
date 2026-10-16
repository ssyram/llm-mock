import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/mock-scripts/echo-message.mjs", import.meta.url));
function run(messages, api = "pi-messages") {
	const input = { api, keyId: "private-key-must-not-be-echoed", model: "gpt-echo", sessionSignal: "session-1",
		request: { model: "gpt-echo", context: { messages }, options: { maxTokens: 128, temperature: 0.2 } } };
	const result = spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	const reply = JSON.parse(result.stdout);
	const text = reply.content[0].text;
	const blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));
	return { reply, text, blocks };
}

test("echo preserves the latest message and metadata but never exposes the bearer key", () => {
	const last = { role: "user", content: "你好 😀\nsecond line", timestamp: 12 };
	const { reply, text, blocks } = run([{ role: "system", content: "system" }, last]);
	assert.match(text, /^第 1 句/);
	assert.ok(text.includes(`Echo:\n${last.content}\n`));
	assert.deepEqual(blocks[0], last);
	assert.deepEqual(blocks[1], { api: "pi-messages", model: "gpt-echo", keyId: "[redacted]", sessionSignal: "session-1",
		options: { maxTokens: 128, temperature: 0.2 }, userTurns: 1, messageCount: 2 });
	assert.doesNotMatch(text, /private-key-must-not-be-echoed|system"/);
	assert.equal(reply.stopReason, "stop");
	assert.equal(reply.usage.totalTokens, 0);
});

test("sentence counter counts users, not system, assistant, or tool messages", () => {
	const last = { role: "user", content: [{ text: "second" }, { type: "text", text: "message" }], timestamp: 9 };
	const messages = [{ role: "system", content: "system" }, { role: "user", content: "first" },
		{ role: "assistant", content: [{ type: "text", text: "reply" }] }, { role: "toolResult", content: [{ text: "tool" }] }, last];
	for (const api of ["openai-completions", "google-generative-ai", "anthropic-messages"]) {
		const { reply, text, blocks } = run(messages, api);
		assert.equal(reply.api, api);
		assert.match(text, /^第 2 句/);
		assert.ok(text.includes("Echo:\nsecond\nmessage\n"));
		assert.deepEqual(blocks[0], last);
		assert.equal(blocks[1].messageCount, 5);
	}
});

test("empty transcript is represented explicitly", () => {
	const { text, blocks } = run([]);
	assert.match(text, /^第 0 句/);
	assert.equal(blocks[0], null);
});
