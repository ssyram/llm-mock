import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const marker = "node_modules/.mock-reference-installation.json";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const roots = ["node_modules", "packages/ai/node_modules", "packages/telemetry/node_modules", "packages/telemetry/dist"];
export function installationTree(root) {
	const files = {};
	const walk = (path) => {
		const name = relative(root, path).split(sep).join("/");
		if (name === marker) return;
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) {
			const target = readlinkSync(path), destination = resolve(dirname(path), target);
			if (!destination.startsWith(`${resolve(root)}${sep}`)) throw new Error(`reference dependency symlink escapes pinned checkout: ${name}`);
			files[name] = digest(`link\0${target}`);
		} else if (stat.isDirectory()) for (const entry of readdirSync(path).sort()) walk(resolve(path, entry));
		else if (stat.isFile()) files[name] = digest(readFileSync(path));
	};
	for (const name of roots) if (existsSync(resolve(root, name))) walk(resolve(root, name));
	const entries = Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
	return { files, fingerprint: digest(JSON.stringify(entries)) };
}
export function writeInstallation(root, source) {
	if (!existsSync(resolve(root, "node_modules")) || !existsSync(resolve(root, "packages/telemetry/dist/index.js"))) throw new Error("install and build reference before recording preparation");
	const snapshot = { format: 1, commit: source.commit, version: source.version, lock: digest(readFileSync(resolve(root, "package-lock.json"))), node: process.version, ...installationTree(root) };
	writeFileSync(resolve(root, marker), JSON.stringify(snapshot));
	return snapshot.fingerprint;
}
export function verifyInstallation(root, source) {
	if (!existsSync(resolve(root, marker))) return { missing: "reference install/build attestation is not prepared; run sh tests/setup.sh" };
	const snapshot = JSON.parse(readFileSync(resolve(root, marker), "utf8"));
	if (snapshot.format !== 1 || snapshot.commit !== source.commit || snapshot.version !== source.version || snapshot.lock !== digest(readFileSync(resolve(root, "package-lock.json")))) throw new Error("pi-ai prepared installation does not match pinned source/lockfile; run sh tests/setup.sh");
	const actual = installationTree(root);
	if (actual.fingerprint !== snapshot.fingerprint) {
		const changed = [...new Set([...Object.keys(snapshot.files), ...Object.keys(actual.files)])].find((name) => snapshot.files[name] !== actual.files[name]);
		throw new Error(`pi-ai prepared dependency/build tree changed: ${changed}; run sh tests/setup.sh`);
	}
	return { installation: actual.fingerprint };
}
