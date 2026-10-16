import { readdirSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import * as zlib from "node:zlib";
import { artifactPath } from "./test-artifacts.mjs";
import { referenceState, repoRoot } from "./pi-ai-reference.mjs";
import { testRequirements } from "./test-requirements.mjs";

let failures = 0;
let passed = 0;
let skipped = 0;
const probe = (command) => {
	const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 15000 });
	if (result.error?.code === "ENOENT") return { missing: `${command} executable is not installed` };
	if (result.error || result.status !== 0) {
		failures++;
		const invalid = `${command} is installed but --version failed`;
		console.error(`FAIL environment: ${invalid}`);
		return { invalid };
	}
	return {};
};
const skip = (name, reason) => {
	skipped++;
	console.log(`WARNING: SKIP ${name}: ${reason}; NOT VERIFIED`);
};
const run = (name, args, timeout = 30 * 60 * 1000) => {
	const log = artifactPath(`${name}.log`);
	const fd = openSync(log, "w");
	console.log(`RUN ${name}: ${process.execPath} ${args.join(" ")} (log: ${log})`);
	let result;
	const env = { ...process.env };
	delete env.NODE_TEST_CONTEXT;
	try { result = spawnSync(process.execPath, args, { cwd: repoRoot, env, stdio: ["ignore", fd, fd], timeout }); }
	finally { closeSync(fd); }
	if (result.error || result.status !== 0) {
		failures++;
		console.error(`FAIL ${name}: ${result.error?.message ?? `exit=${result.status}, signal=${result.signal}`}; see ${log}`);
		return false;
	}
	passed++;
	console.log(`PASS ${name}`);
	return true;
};
const ready = (name, state) => {
	if (state.missing) { skip(name, state.missing); return false; }
	if (state.invalid) { console.error(`BLOCKED ${name}: ${state.invalid} (already failed)`); return false; }
	return true;
};
let reference;
try {
	reference = referenceState();
	if (!reference.missing) {
		console.log(`pi-ai ${reference.version} @ ${reference.commit}`);
		if (!run("pi-ai-import", ["--input-type=module", "-e", "await import('./tests/pi-ai-imports.mjs')"])) reference.invalid = "pi-ai import failed";
	}
} catch (error) {
	failures++;
	reference = { invalid: error.message };
	console.error(`FAIL pi-ai-reference: ${error.message}`);
}
const zstd = probe("zstd");
if (!zstd.invalid && (typeof zlib.zstdCompressSync !== "function" || typeof zlib.zstdDecompressSync !== "function")) zstd.missing = "requires Node native zstd APIs (use Node 24 LTS)";
const tests = readdirSync(resolve(repoRoot, "tests")).filter((name) => name.endsWith(".test.mjs")).sort();
const groups = new Map();
for (const name of tests) {
	const requirements = testRequirements(resolve(repoRoot, "tests", name));
	const key = [...requirements].sort().join(",") || "node";
	if (!groups.has(key)) groups.set(key, []);
	groups.get(key).push(`tests/${name}`);
}
for (const [key, files] of groups) {
	const name = `node-tests-${key.replaceAll(",", "-")}`;
	if (key.includes("pi-ai") && !ready(name, reference)) continue;
	if (key.includes("zstd") && !ready(name, zstd)) continue;
	run(name, ["--test", "--test-concurrency=1", ...files]);
}
for (const [name, script, compressed] of [
	["duality", "duality.mjs", true],
	["transport", "transport-matrix.mjs", false],
	["fuzz", "fuzz.mjs", true],
	["property", "property.mjs", false],
]) {
	if (!ready(name, reference)) continue;
	if (compressed && !ready(name, zstd)) continue;
	run(name, [`tests/${script}`]);
}
for (const harness of ["pi", "opencode"]) {
	if (ready(`${harness}-harness`, probe(harness))) run(`${harness}-harness`, ["tests/harness-e2e.mjs", harness], 5 * 60 * 1000);
}
console.log(`Optional suites: ${passed} passed / ${failures} failed / ${skipped} skipped. Skipped suites are NOT proof of protocol or harness correctness.`);
process.exitCode = failures ? 1 : 0;
