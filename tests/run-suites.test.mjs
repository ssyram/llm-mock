import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function fixture(t, fail = false) {
	const dir = mkdtempSync(join(tmpdir(), "suite-environment-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	mkdirSync(join(dir, "tests"));
	mkdirSync(join(dir, "bin"));
	for (const name of ["run-suites.mjs", "pi-ai-reference.mjs", "test-artifacts.mjs", "test-requirements.mjs"]) {
		copyFileSync(new URL(name, import.meta.url), join(dir, "tests", name));
	}
	symlinkSync(process.execPath, join(dir, "bin/node"));
	writeFileSync(join(dir, "tests/environment.test.mjs"), `import test from "node:test"; test("independent Node test", () => { ${fail ? 'throw new Error("intentional failure")' : ""} });`);
	return { dir, run: () => spawnSync(process.execPath, [join(dir, "tests/run-suites.mjs")], {
		encoding: "utf8", env: { ...process.env, PATH: join(dir, "bin"), MOCK_TEST_ARTIFACTS: join(dir, "artifacts") }, timeout: 30000,
	}) };
}

test("missing optional tools skip only dependent groups; independent tests still run", (t) => {
	const { run } = fixture(t);
	const result = run();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /PASS node-tests-node/);
	for (const name of ["contract-types", "duality", "transport", "fuzz", "property", "pi-harness", "opencode-harness"]) assert.match(result.stdout, new RegExp(`WARNING: SKIP ${name}:.*NOT VERIFIED`));
	assert.match(result.stdout, /1 passed \/ 0 failed \/ 7 skipped/);
});

test("assertion failure is propagated even when all external suites are skipped", (t) => {
	const result = fixture(t, true).run();
	assert.equal(result.status, 1);
	assert.match(result.stderr, /FAIL node-tests-node/);
	assert.match(result.stdout, /0 passed \/ 1 failed \/ 7 skipped/);
});

test("installed but broken harness is failed, not skipped", (t) => {
	const { dir, run } = fixture(t);
	writeFileSync(join(dir, "bin/pi"), "#!/bin/sh\nexit 9\n", { mode: 0o755 });
	const result = run();
	assert.equal(result.status, 1);
	assert.match(result.stdout, /PASS node-tests-node/);
	assert.match(result.stderr, /FAIL environment: pi is installed but --version failed/);
	assert.doesNotMatch(result.stdout, /SKIP pi-harness/);
});

test("mismatched submodule fails while independent tests continue", (t) => {
	const { dir, run } = fixture(t);
	const src = join(dir, "vendor/pi-mono/packages/ai/src/api");
	mkdirSync(src, { recursive: true });
	writeFileSync(join(src, "pi-messages.ts"), "");
	writeFileSync(join(dir, "bin/git"), `#!/bin/sh
case "$1" in
ls-files) printf '160000 ${"a".repeat(40)} 0\\tvendor/pi-mono\\n' ;;
rev-parse) printf '${"b".repeat(40)}\\n' ;;
*) exit 1 ;;
esac
`, { mode: 0o755 });
	const result = run();
	assert.equal(result.status, 1);
	assert.match(result.stderr, /FAIL pi-ai-reference: pi-ai commit mismatch/);
	assert.match(result.stdout, /PASS node-tests-node/);
	assert.doesNotMatch(result.stdout, /SKIP duality/);
});
