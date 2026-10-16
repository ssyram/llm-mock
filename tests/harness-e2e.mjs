import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { artifactDir } from "./test-artifacts.mjs";
import { startServer, repoRoot, serverBin } from "./harness.mjs";
import { testPiHarness } from "./pi-harness-e2e.mjs";
import { testOpenCodeHarness } from "./opencode-harness-e2e.mjs";

const harness = process.argv[2];
assert.ok(["pi", "opencode"].includes(harness), "usage: node tests/harness-e2e.mjs pi|opencode");
const dir = mkdtempSync(join(artifactDir, `${harness}-`));
const server = await startServer(0);
const baseUrl = `http://127.0.0.1:${server.port}`;
const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
const run = (command, args, options = {}) => {
	const result = spawnSync(command, args, { cwd: dir, encoding: "utf8", timeout: 90000, maxBuffer: 8 * 1024 * 1024, ...options });
	if (result.error) throw result.error;
	return result;
};
const captures = () => readdirSync(server.captureDir).filter((name) => name.startsWith("req-")).map((name) => JSON.parse(readFileSync(join(server.captureDir, name), "utf8")));
try {
	for (const [name, file, mode] of [
		["roundtext", "round-counter.mjs", ""],
		["roundtool", "round-counter.mjs", " --mode=tool"],
		["failtest", "failing.mjs", ""],
	]) {
		const command = `${quote(process.execPath)} ${quote(join(repoRoot, "scripts/mock-scripts", file))}${mode}`;
		const result = run(serverBin, ["add", command, "--name", name, "--server-url", baseUrl]);
		assert.equal(result.status, 0, result.stderr);
	}
	mkdirSync(join(dir, "project"));
	const context = { dir, baseUrl, run, captures };
	if (harness === "pi") await testPiHarness(context);
	else await testOpenCodeHarness(context);
	console.log(`PASS ${harness}: real CLI session round-trips; evidence directory ${dir}`);
} finally {
	await server.stop();
}
