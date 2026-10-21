import { readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";

export function testRequirements(path, seen = new Set()) {
	path = resolve(path);
	if (seen.has(path)) return new Set();
	seen.add(path);
	const requirements = new Set();
	if (basename(path) === "pi-ai-imports.mjs") {
		requirements.add("pi-ai");
		return requirements;
	}
	const source = readFileSync(path, "utf8");
	const declaration = /^export const TEST_DEPENDENCIES = (\[[^\n]*\]);$/m.exec(source);
	if (declaration) for (const dependency of JSON.parse(declaration[1])) {
		if (!["pi-ai", "zstd", "node-zstd"].includes(dependency)) throw new Error(`unsupported test dependency: ${dependency}`);
		requirements.add(dependency);
	}
	if (/^import\s*\{[^}]*\bzstd(?:Compress|Decompress)Sync\b[^}]*\}\s*from\s*["']node:zlib["']/m.test(source)) requirements.add("node-zstd");
	for (const [, specifier] of source.matchAll(/^(?:import\s+(?:[\w*{},\s]+?\s+from\s+)?|export\s+(?:\*|\{[\w,\s]+\})\s+from\s+)["'](\.[^"']+\.(?:mjs|ts))["']/gm)) {
		for (const requirement of testRequirements(resolve(dirname(path), specifier), seen)) requirements.add(requirement);
	}
	return requirements;
}
