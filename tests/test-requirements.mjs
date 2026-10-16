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
	if (/^import\s*\{[^}]*\bzstd(?:Compress|Decompress)Sync\b[^}]*\}\s*from\s*["']node:zlib["']/m.test(source)) requirements.add("zstd");
	for (const [, specifier] of source.matchAll(/^(?:import\s+(?:[\w*{},\s]+?\s+from\s+)?|export\s+(?:\*|\{[\w,\s]+\})\s+from\s+)["'](\.[^"']+\.mjs)["']/gm)) {
		for (const requirement of testRequirements(resolve(dirname(path), specifier), seen)) requirements.add(requirement);
	}
	return requirements;
}
