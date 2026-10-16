import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function testOpenCodeHarness({ dir, baseUrl, run, captures }) {
	const project = join(dir, "project");
	const config = {
		provider: { mockpi: { npm: "@ai-sdk/openai-compatible", name: "Mock Pi",
			options: { baseURL: `${baseUrl}/roundtext/v1`, apiKey: "mockpi-key" },
			models: { "mock-m": { name: "Mock", limit: { context: 100000, output: 1024 } } } } },
		model: "mockpi/mock-m", small_model: "mockpi/mock-m", enabled_providers: ["mockpi"],
		plugin: [], autoupdate: false, share: "disabled", permission: { "*": "deny" },
	};
	writeFileSync(join(project, "opencode.json"), JSON.stringify(config));
	const configDir = join(dir, "config");
	mkdirSync(configDir);
	const env = { ...process.env, XDG_CONFIG_HOME: configDir, OPENCODE_CONFIG_DIR: configDir,
		XDG_DATA_HOME: join(dir, "data"), XDG_STATE_HOME: join(dir, "state"), XDG_CACHE_HOME: join(dir, "cache"),
		OPENCODE_CONFIG_CONTENT: JSON.stringify(config), OPENCODE_DISABLE_AUTOUPDATE: "true",
		OPENCODE_DISABLE_DEFAULT_PLUGINS: "true", OPENCODE_DISABLE_MODELS_FETCH: "true" };
	for (let round = 1; round <= 2; round++) {
		const result = run("opencode", ["run", "-m", "mockpi/mock-m", ...(round > 1 ? ["-c"] : []), `what round is it: ${round}?`], { cwd: project, env });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, new RegExp(`ROUND-${round}: ${round}`));
	}
	assert.ok(captures().some((capture) => capture.api === "openai-completions" && capture.keyId === "mockpi-key" && capture.request.context.messages.some((message) => message.role === "assistant" && message.content.some((block) => block.text === "ROUND-1: 1"))), "OpenCode continuation reaches server with prior assistant reply");
}
