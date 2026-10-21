import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyInstallation, writeInstallation } from "./reference-installation.mjs";

const source = { commit: "a".repeat(40), version: "1.2.0" };
function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "reference-install-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const path of ["node_modules/sdk", "node_modules/transitive", "packages/telemetry/dist"]) mkdirSync(join(root, path), { recursive: true });
	writeFileSync(join(root, "package-lock.json"), JSON.stringify({ packages: { "node_modules/sdk": { version: "1" } } }));
	for (const path of ["sdk", "transitive"]) {
		writeFileSync(join(root, `node_modules/${path}/package.json`), JSON.stringify({ name: path, version: "1" }));
		writeFileSync(join(root, `node_modules/${path}/index.js`), "export const original = true;");
	}
	writeFileSync(join(root, "packages/telemetry/dist/index.js"), "export {};");
	return root;
}
test("installation must be prepared explicitly and matches the exact source/lock snapshot", (t) => {
	const root = fixture(t);
	assert.match(verifyInstallation(root, source).missing, /not prepared/);
	const installation = writeInstallation(root, source);
	assert.deepEqual(verifyInstallation(root, source), { installation });
	assert.throws(() => verifyInstallation(root, { ...source, commit: "b".repeat(40) }), /does not match/);
	writeFileSync(join(root, "package-lock.json"), "{}");
	assert.throws(() => verifyInstallation(root, source), /does not match/);
});
test("package versions, same-version runtime code, transitive code and built output drift all fail", (t) => {
	for (const path of ["node_modules/sdk/package.json", "node_modules/sdk/index.js", "node_modules/transitive/index.js", "packages/telemetry/dist/index.js"]) {
		const root = fixture(t); writeInstallation(root, source);
		const file = join(root, path), original = readFileSync(file);
		writeFileSync(file, path.endsWith("package.json") ? '{"name":"sdk","version":"wrong"}' : "changed runtime code");
		assert.throws(() => verifyInstallation(root, source), /tree changed/);
		writeFileSync(file, original); assert.ok(verifyInstallation(root, source).installation);
		rmSync(file); assert.throws(() => verifyInstallation(root, source), /tree changed/);
	}
});
