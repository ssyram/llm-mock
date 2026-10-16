import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

for (const [name, fake, expected, message] of [
	["missing Node skips optional suites without claiming verification", null, 0, /SKIP.*Node is not installed.*NOT VERIFIED/],
	["old Node skips optional suites with actionable warning", "printf 'v22.19.0\\n'", 0, /SKIP.*requires Node >=23.*NOT VERIFIED/s],
	["failed Node probe is a failure, not a skip", "exit 9", 101, /node --version failed/],
	["test subprocess failure reaches Cargo unchanged", 'if [ "$1" = "--version" ]; then printf "v24.0.0\\n"; else exit 7; fi', 7, null],
]) {
	test(name, (t) => {
		const runner = process.env.MOCK_OPTIONAL_RUNNER;
		if (!runner) return t.skip("requires cargo test --test optional_suites to supply the Rust entry point");
		const dir = mkdtempSync(join(tmpdir(), "optional-launch-"));
		t.after(() => rmSync(dir, { recursive: true, force: true }));
		if (fake) writeFileSync(join(dir, "node"), `#!/bin/sh\n${fake}\n`, { mode: 0o755 });
		const result = spawnSync(runner, [], { encoding: "utf8", env: { ...process.env, PATH: dir } });
		assert.equal(result.status, expected, result.stderr);
		if (message) assert.match(result.stdout + result.stderr, message);
	});
}

for (const [name, fake, expected, message] of [
	["missing Python skips only the Python group", null, 0, /WARNING: SKIP Python routing tests: python3 is not installed.*NOT VERIFIED/],
	["installed but broken Python fails its group", "exit 9", 1, /python3 is installed but --version failed/],
]) {
	test(name, (t) => {
		const runner = process.env.MOCK_OPTIONAL_RUNNER;
		if (!runner) return t.skip("requires the Cargo optional test entry point");
		const dir = mkdtempSync(join(tmpdir(), "python-launch-"));
		t.after(() => rmSync(dir, { recursive: true, force: true }));
		if (fake) writeFileSync(join(dir, "python3"), `#!/bin/sh\n${fake}\n`, { mode: 0o755 });
		const result = spawnSync(runner, ["python"], { encoding: "utf8", env: { ...process.env, PATH: dir } });
		assert.equal(result.status, expected, result.stderr);
		assert.match(result.stdout + result.stderr, message);
		assert.doesNotMatch(result.stdout, /RUN node|SKIP Node/);
	});
}
