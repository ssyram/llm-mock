import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function testPiHarness({ dir, baseUrl, run, captures }) {
	const agent = join(dir, "agent");
	mkdirSync(agent);
	const providers = {};
	for (const [name, mount, api, suffix] of [
		["roundtext", "roundtext", "openai-completions", "/v1"],
		["roundtool", "roundtool", "openai-completions", "/v1"],
		["failtest", "failtest", "openai-completions", "/v1"],
		["respmock", "roundtext", "openai-responses", "/v1"],
		["pimock", "roundtext", "pi-messages", ""],
	]) {
		providers[name] = { baseUrl: `${baseUrl}/${mount}${suffix}`, api, apiKey: name,
			models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] };
	}
	writeFileSync(join(agent, "models.json"), JSON.stringify({ providers }));
	const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
	const invoke = (provider, label, extra = [], tool = false) => {
		const sessions = join(dir, `sessions-${provider}`);
		return run("pi", ["--print", "--offline", "--approve", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--thinking", "off",
			"--model", `${provider}/mock-m`, "--session-dir", sessions,
			...(tool ? ["--tools", "round_probe"] : ["--no-tools"]), ...extra, label], { cwd: join(dir, "project"), env });
	};
	for (const [provider, api, rounds] of [["roundtext", "openai-completions", 3], ["respmock", "openai-responses", 2], ["pimock", "pi-messages", 2]]) {
		for (let round = 1; round <= rounds; round++) {
			const result = invoke(provider, `what round is it: ${round}?`, round > 1 ? ["-c"] : []);
			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, new RegExp(`ROUND-${round}: ${round}`));
		}
		assert.ok(captures().some((capture) => capture.api === api && capture.keyId === provider && capture.request.context.messages.filter((message) => message.role === "assistant").length === rounds - 1), `${provider}: captured real continued transcript`);
	}
	const extension = join(dir, "round-probe.mjs");
	writeFileSync(extension, `export default function(pi) {
		pi.registerTool({ name: "round_probe", label: "Round Probe", description: "Echo the round",
			parameters: { type: "object", properties: { round: { type: "number" } }, required: ["round"] },
			execute: async (_id, params) => ({ content: [{ type: "text", text: "probe-ok:" + params.round }], details: params }) });
	}`);
	const tool = invoke("roundtool", "please probe the round", ["-e", extension], true);
	assert.equal(tool.status, 0, tool.stderr);
	assert.match(tool.stdout, /ROUND-2: 2/);
	assert.ok(captures().some((capture) => capture.keyId === "roundtool" && capture.request.context.messages.some((message) => message.role === "toolResult" && message.content.some((block) => block.text === "probe-ok:1"))), "real extension tool result returned to server");
	const error = invoke("failtest", "trigger intentional mock failure");
	assert.notEqual(error.status, 0);
	assert.match(error.stdout + error.stderr, /mock_failure|intentional mock failure/);
	assert.ok(captures().some((capture) => capture.keyId === "failtest"), "error request reached mock server");
}
