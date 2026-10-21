import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRequirements } from "./test-requirements.mjs";

const fixture = (t, files) => {
	const dir = mkdtempSync(join(tmpdir(), "test-requirements-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source);
	return dir;
};
test("declared requirements and TS dependency edges are discovered without executing modules", (t) => {
	const dir = fixture(t, { "a.mjs": 'import "./b.ts";', "b.ts": 'export const TEST_DEPENDENCIES = ["zstd"];' });
	assert.deepEqual([...testRequirements(join(dir, "a.mjs"))], ["zstd"]);
	writeFileSync(join(dir, "b.ts"), 'export const TEST_DEPENDENCIES = ["unknown"];');
	assert.throws(() => testRequirements(join(dir, "a.mjs")), /unsupported test dependency/);
});

test("Node-only tests have no pi-ai requirement", (t) => {
	const dir = fixture(t, { "a.mjs": 'import { value } from "./b.mjs";', "b.mjs": "export const value = 1;" });
	assert.deepEqual([...testRequirements(join(dir, "a.mjs"))], []);
});
test("transitive imports and reexports detect pi-ai without importing it", (t) => {
	const dir = fixture(t, { "a.mjs": 'export { value } from "./b.mjs";', "b.mjs": 'import "./pi-ai-imports.mjs";', "pi-ai-imports.mjs": 'throw new Error("must not execute");' });
	assert.deepEqual([...testRequirements(join(dir, "a.mjs"))], ["pi-ai"]);
});
test("cyclic dependencies terminate and preserve compression requirements", (t) => {
	const dir = fixture(t, { "a.mjs": 'import "./b.mjs";', "b.mjs": 'import "./a.mjs";\nimport { zstdCompressSync } from "node:zlib";' });
	assert.deepEqual([...testRequirements(join(dir, "a.mjs"))], ["node-zstd"]);
});
