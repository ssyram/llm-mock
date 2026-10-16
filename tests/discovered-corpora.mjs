import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function loadDiscoveredCorpora() {
	const directory = new URL("./fixtures/corpus-discovery/", import.meta.url);
	const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));
	return manifest.cases.map((entry) => {
		const raw = readFileSync(new URL(entry.file, directory), "utf8");
		if (createHash("sha256").update(raw).digest("hex") !== entry.sha256) throw new Error(`corpus integrity mismatch: ${entry.name}`);
		const messages = raw.trimEnd().split("\n").map((line) => JSON.parse(line).message);
		if (messages.length !== entry.rows) throw new Error(`corpus row mismatch: ${entry.name}`);
		return { name: `discovery-${entry.name}`, messages, provenance: { ...entry.source, classification: manifest.classification, fragment: true } };
	});
}
