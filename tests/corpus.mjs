// Corpus loading + context case builders (real corpus prefixes + synthetic shapes).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = fileURLToPath(new URL(".", import.meta.url));

// All five captured sessions. sample: thinking+toolCall round; claude: plain
// toolCall round (provider provider-a); glm5: error assistant, empty content;
// claude2: thinking+text answer; glm52: plain text answer.
const SESSIONS = [
	{ dir: ".tmp-corpus-capture-sample", name: "kahuwo" },
	{ dir: ".tmp-corpus-sample-claude", name: "claude" },
	{ dir: ".tmp-corpus-sample-glm5", name: "glm5" },
	{ dir: ".tmp-corpus-sample-claude2", name: "claude2" },
	{ dir: ".tmp-corpus-sample-glm52", name: "glm52" },
	// Batch 4 sessions (docs/design/mock-llm-server/corpus-batch4.md): 13 real
	// one-shot sessions across provider-a/{claude-sonnet-5,deepseek-v4-pro,glm-5.2,
	// kimi-k3} and provider-b/glm-5.3→glm-5.3-flash, all captured via
	// extensions/llm-corpus-capture.ts. Coverage: long thinking, single-turn
	// parallel toolCalls, isError toolResults, mixed zh/en, code generation.
	{ dir: ".tmp-corpus-b4-provider-a-claude-sonnet-5-1", name: "b4-claude-reason" },
	{ dir: ".tmp-corpus-b4-provider-a-claude-sonnet-5-2", name: "b4-claude-multitool" },
	{ dir: ".tmp-corpus-b4-provider-a-claude-sonnet-5-3", name: "b4-claude-toolerr" },
	{ dir: ".tmp-corpus-b4-provider-a-deepseek-v4-pro-4", name: "b4-deepseek-mixed" },
	{ dir: ".tmp-corpus-b4-provider-a-deepseek-v4-pro-5", name: "b4-deepseek-codegen" },
	{ dir: ".tmp-corpus-b4-provider-a-deepseek-v4-pro-13", name: "b4-deepseek-longreason" },
	{ dir: ".tmp-corpus-b4-provider-a-glm-5.2-6", name: "b4-glm52-codegen-mixed" },
	{ dir: ".tmp-corpus-b4-provider-a-glm-5.2-7", name: "b4-glm52-multitool" },
	{ dir: ".tmp-corpus-b4-provider-a-glm-5.2-12", name: "b4-glm52-toolerr-zh" },
	{ dir: ".tmp-corpus-b4-provider-a-kimi-k3-8", name: "b4-kimi-reason" },
	{ dir: ".tmp-corpus-b4-provider-a-kimi-k3-9", name: "b4-kimi-toolerr" },
	{ dir: ".tmp-corpus-b4-provider-b-glm-5.3-10", name: "b4-glm53-multitool" },
	{ dir: ".tmp-corpus-b4-provider-b-glm-5.3-11", name: "b4-glm53-mixed" },
];

export function loadCorpora(root = join(testsDir, "..")) {
	let skipped = 0;
	const corpora = SESSIONS.flatMap(({ dir, name }) => {
		const corpusDir = join(root, dir, "real-session/.pi/mock-corpus");
		if (!existsSync(corpusDir)) {
			skipped++;
			console.log(`SKIP corpus/${name}: private capture not distributed`);
			return [];
		}
		const jsonl = readdirSync(corpusDir).filter((f) => f.endsWith(".jsonl"));
		if (jsonl.length !== 1) throw new Error(`expected 1 corpus jsonl in ${corpusDir}, got ${jsonl.length}`);
		const lines = readFileSync(join(corpusDir, jsonl[0]), "utf8").split("\n").filter((l) => l.trim());
		return [{ name, messages: lines.map((l) => JSON.parse(l).message) }];
	});
	console.log(`Corpus sessions: ${corpora.length} loaded / ${skipped} skipped`);
	return corpora;
}

// Clone helper so case builders can mutate freely.
const c = (x) => structuredClone(x);

export function corpusContexts(corpora) {
	const byName = Object.fromEntries(corpora.map((c) => [c.name, c.messages]));
	const cases = [];
	if (byName.kahuwo) {
		const [sys, user, assistantTool, toolResult, assistantFinal] = byName.kahuwo;
		cases.push(
			{ name: "corpus-sys-user", messages: [c(sys), c(user)] },
			{
				name: "corpus-orphan-toolcall",
				messages: [c(sys), c(user), c(assistantTool)],
			},
			{
				name: "corpus-full-convo",
				messages: [c(sys), c(user), c(assistantTool), c(toolResult), c(assistantFinal)],
			},
		);
	}
	// claude (provider-a/claude-sonnet-5): same shape as kahuwo, different provider/model
	// → exercises the cross-model rewrite with a second origin identity.
	if (byName.claude) cases.push({ name: "corpus-claude-full", messages: c(byName.claude) });
	// claude2: sys+user+assistant(thinking, text) — real thinking-prefix session
	// (thinking "\n" + signature "reasoning_content", cross-model everywhere).
	if (byName.claude2) cases.push({ name: "corpus-thinking", messages: c(byName.claude2) });
	// glm5: sys+user+assistant(error, empty content) — error assistant dropped on replay.
	if (byName.glm5) cases.push({ name: "corpus-plain-multi-glm5", messages: c(byName.glm5) });
	// glm52: sys+user+assistant(text) — plain multi-turn prefix.
	if (byName.glm52) cases.push({ name: "corpus-plain-multi-glm52", messages: c(byName.glm52) });
	// Batch 4 real sessions (full transcripts; see corpus-batch4.md). Names map
	// 1:1 to SESSIONS entries; every case is a new shape addition, existing
	// cases above are untouched.
	for (const [name, caseName] of [
		["b4-claude-reason", "corpus-b4-claude-thinking"],
		["b4-claude-multitool", "corpus-b4-claude-parallel-toolcall"],
		["b4-claude-toolerr", "corpus-b4-claude-tool-error"],
		["b4-deepseek-mixed", "corpus-b4-mixed-zh-en"],
		["b4-deepseek-codegen", "corpus-b4-codegen"],
		["b4-deepseek-longreason", "corpus-b4-long-thinking"],
		["b4-glm52-codegen-mixed", "corpus-b4-glm52-codegen-mixed"],
		["b4-glm52-multitool", "corpus-b4-glm52-parallel-toolcall"],
		["b4-glm52-toolerr-zh", "corpus-b4-glm52-tool-error-zh"],
		["b4-kimi-reason", "corpus-b4-kimi-reason"],
		["b4-kimi-toolerr", "corpus-b4-kimi-thinking-tool-error"],
		["b4-glm53-multitool", "corpus-b4-glm53-parallel-toolcall"],
		["b4-glm53-mixed", "corpus-b4-glm53-mixed"],
	]) {
		if (byName[name]) cases.push({ name: caseName, messages: c(byName[name]) });
	}
	return cases;
}

export { syntheticContexts } from "./corpus-synthetic.mjs";
export { replyCases } from "./corpus-replies.mjs";
