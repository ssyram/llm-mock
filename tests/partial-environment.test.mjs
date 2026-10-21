import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
export const TEST_DEPENDENCIES = ["pi-ai"];

test("only missing zstd preserves other-protocol matrices, fuzz, fields, tools, cancellation, WS and ADC", { timeout: 300000 }, (t) => {
	const dir = mkdtempSync(join(tmpdir(), "partial-environment-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const bin = join(dir, "bin"); mkdirSync(bin);
	for (const name of ["git", "sh", "cat"]) {
		const path = spawnSync("which", [name], { encoding: "utf8" }).stdout.trim();
		assert.ok(path, name); symlinkSync(path, join(bin, name));
	}
	symlinkSync(process.execPath, join(bin, "node"));
	const artifacts = join(dir, "artifacts");
	const run = (args) => {
		const env = { ...process.env, PATH: bin, MOCK_TEST_ARTIFACTS: artifacts };
		delete env.NODE_TEST_CONTEXT;
		const result = spawnSync(process.execPath, args, { cwd: resolve("."), env, encoding: "utf8", timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
		assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
		return result;
	};
	assert.equal(spawnSync("zstd", ["--version"], { env: { ...process.env, PATH: bin } }).error?.code, "ENOENT");
	const matrix = run(["tests/duality.mjs", "openai-completions", "pi-messages", "openai-codex-responses"]);
	assert.match(matrix.stdout, /WARNING: SKIP protocol openai-codex-responses/);
	const ledger = JSON.parse(readFileSync(join(artifacts, "matrix-ten-results.json")));
	assert.deepEqual([...new Set(ledger.results.map(({ api }) => api))].sort(), ["openai-completions", "pi-messages"]);
	assert.equal(ledger.skippedProtocols.length, 1);
	run(["tests/fuzz.mjs", "1"]);
	const fuzz = JSON.parse(readFileSync(join(artifacts, "fuzz-expand-summary.json")));
	assert.equal(fuzz.status, "completed"); assert.equal(fuzz.protocols.length, 9); assert.equal(fuzz.rows.length, 18); assert.equal(fuzz.counts.finding, 0);
	run(["--test", "--test-concurrency=1", "tests/contract-field-probes.test.mjs", "tests/tool-traces.test.mjs", "tests/stream-transport-cancel.test.mjs", "tests/transport-unblock.test.mjs", "tests/script-envelope.test.mjs", "tests/missing-zstd.test.mjs", "tests/final-four.test.mjs"]);
	for (const [name, count] of [["tool-traces", 385], ["provider-transitions", 72], ["stream-transport-cancel", 9]]) {
		const report = JSON.parse(readFileSync(join(artifacts, `${name}.json`)));
		assert.equal(report.cases.length, count, name); assert.equal(report.skippedProtocols.length, 1, name);
	}
});
