import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
const reply = process.argv[2] === "error" ? { error: { status: 429, code: "planned", message: "simulated retry later" } }
	: { api: input.api, provider: "fixture", model: input.model, content: [{ type: "text", text: "MUST_NOT_HIDE_EXIT_FAILURE" }],
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 };
process.stdout.write(JSON.stringify(reply));
process.exitCode = Number(process.argv[3]);
