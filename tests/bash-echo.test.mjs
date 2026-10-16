import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/mock-scripts/echo-message.mjs", import.meta.url));
const user = (content) => ({ role: "user", content, timestamp: 1 });
function run(messages) {
	const input = { api: "pi-messages", model: "pi-echo", keyId: "", sessionSignal: null,
		request: { model: "pi-echo", context: { messages }, options: {} } };
	const result = spawnSync(process.execPath, [script, "--bash-echo"], { input: JSON.stringify(input), encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout);
}

test("bash mode emits speech before a real bash tool call", () => {
	const reply = run([user("你好 ' $USER `printf WRONG`\\n")]);
	assert.equal(reply.stopReason, "toolUse");
	assert.equal(reply.content.length, 2);
	assert.equal(reply.content[0].type, "text");
	assert.match(reply.content[0].text, /先说一句话.*bash/);
	assert.deepEqual(reply.content[1], { type: "toolCall", id: "echo_1", name: "bash",
		arguments: { command: "echo -E '你好 '\\'' $USER `printf WRONG`\\n'", timeout: 10 } });
});

test("tool result completes the turn without calling bash again, new user starts a new call", () => {
	const messages = [user("first")];
	const first = run(messages);
	messages.push({ role: "assistant", content: first.content },
		{ role: "toolResult", toolCallId: "echo_1", toolName: "bash", content: [{ text: "first\n" }], isError: false });
	const final = run(messages);
	assert.equal(final.stopReason, "stop");
	assert.equal(final.content.length, 1);
	assert.equal(final.content[0].type, "text");
	assert.match(final.content[0].text, /toolResult/);
	messages.push(user("second"));
	const second = run(messages);
	assert.equal(second.stopReason, "toolUse");
	assert.equal(second.content[1].id, "echo_2");
	assert.equal(second.content[1].arguments.command, "echo -E 'second'");
});

test("echo option-shaped input uses literal printing rather than becoming an option", () => {
	for (const value of ["-n", "-e", "-E", "-neE"]) {
		assert.equal(run([user(value)]).content[1].arguments.command, `printf '%s\\n' '${value}'`);
	}
});
