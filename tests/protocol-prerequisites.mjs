import { spawnSync } from "node:child_process";
import * as zlib from "node:zlib";
let cached;
export function compressionState() {
	if (cached) return cached;
	const result = spawnSync("zstd", ["--version"], { encoding: "utf8", timeout: 15000 });
	if (result.error?.code === "ENOENT") return cached = { missing: "zstd executable is not installed" };
	if (result.error || result.status !== 0) return cached = { invalid: "zstd is installed but --version failed" };
	return cached = typeof zlib.zstdCompressSync === "function" && typeof zlib.zstdDecompressSync === "function" ? {} : { missing: "Node native zstd APIs are unavailable" };
}
export function protocolSelection(protocols, state = compressionState()) {
	const available = [], skipped = [];
	for (const protocol of protocols) {
		if (protocol.api !== "openai-codex-responses" || !state.missing && !state.invalid) { available.push(protocol); continue; }
		const reason = state.missing ?? state.invalid;
		skipped.push({ api: protocol.api, reason, ...(state.invalid ? { failed: true } : {}) });
		if (state.invalid) { console.error(`FAIL protocol ${protocol.api}/compressed-http: ${reason}`); process.exitCode = 1; }
		else console.log(`WARNING: SKIP protocol ${protocol.api}/compressed-http: ${reason}; NOT VERIFIED`);
	}
	return { available, skipped };
}
