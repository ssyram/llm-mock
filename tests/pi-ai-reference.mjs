import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const referenceRoot = resolve(repoRoot, "vendor/pi-mono");
export const piAiSrc = resolve(referenceRoot, "packages/ai/src");

export function referenceState() {
	if (!existsSync(resolve(piAiSrc, "api/pi-messages.ts"))) {
		return { missing: "pi-ai submodule is not initialized; run git submodule update --init --recursive" };
	}
	const git = (args, cwd = repoRoot) => spawnSync("git", args, { cwd, encoding: "utf8" });
	const pin = git(["ls-files", "--stage", "--", "vendor/pi-mono"]);
	if (pin.error?.code === "ENOENT") return { missing: "Git is required to verify the pi-ai reference pin" };
	if (pin.error || pin.status !== 0) throw new Error("cannot read the pi-ai gitlink");
	const expected = /^160000 ([a-f0-9]{40}) 0\t/m.exec(pin.stdout)?.[1];
	if (!expected) throw new Error("vendor/pi-mono has no pinned gitlink");
	const head = git(["rev-parse", "HEAD"], referenceRoot);
	if (head.status !== 0 || head.stdout.trim() !== expected) throw new Error(`pi-ai commit mismatch: expected ${expected}, got ${head.stdout.trim()}`);
	const dirty = git(["diff", "--quiet", "HEAD", "--", "packages/ai", "packages/telemetry", "package.json", "package-lock.json"], referenceRoot);
	if (dirty.status !== 0) throw new Error("pi-ai reference has modified tracked source or dependency metadata");
	const pkg = JSON.parse(readFileSync(resolve(referenceRoot, "packages/ai/package.json"), "utf8"));
	const require = createRequire(resolve(referenceRoot, "packages/ai/package.json"));
	const missing = Object.keys(pkg.dependencies).filter((name) =>
		!require.resolve.paths(name).some((path) => existsSync(resolve(path, name, "package.json"))));
	if (!existsSync(resolve(referenceRoot, "packages/telemetry/dist/index.js"))) missing.push("pi-telemetry build");
	if (missing.length) return { missing: `pi-ai dependencies are not prepared (${missing.join(", ")}); run sh tests/setup.sh` };
	return { commit: expected, version: pkg.version };
}
