import { expandContext, expandReply } from "./fuzz-expanded-shapes.mjs";

// --- seeded PRNG (mulberry32) ---
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const rng = (seed) => {
	const next = mulberry32(seed);
	return {
		next,
		int: (n) => Math.floor(next() * n),
		chance: (p) => next() < p,
		pick: (arr) => arr[Math.floor(next() * arr.length)],
	};
};

const WORDS = ["alpha", "beta", "gamma", "delta", "echo", "x", "y2", "ok", "no", "hi"];
function rndText(r, maxLen = 24) {
	if (r.chance(0.15)) return r.pick(["", " ", "\n", "  \t "]); // exercise trim filters
	const n = 1 + r.int(maxLen);
	let s = "";
	for (let i = 0; i < n; i++) {
		const w = WORDS[r.int(WORDS.length)];
		s += r.chance(0.2) ? " " : w[r.int(w.length)];
	}
	return s;
}

const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
const zeroUsage = () => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { ...zeroCost },
});

// Thinking signatures per API for the same-model harness identity. Shapes the
// replay contract defines: completions field names / reasoning_details arrays,
// responses reasoning-item JSON (anything else throws in pi-ai's encode),
// anthropic/google opaque strings — invalid base64 for google probes the
// verbatim signature passthrough.
function thinkingSignature(r, api) {
	if (["openai-responses", "azure-openai-responses", "openai-codex-responses"].includes(api)) {
		return JSON.stringify({
			type: "reasoning",
			id: `rs_${r.int(1000)}`,
			summary: [{ type: "summary_text", text: rndText(r, 10) }],
		});
	}
	if (["google-generative-ai", "google-vertex"].includes(api)) {
		if (r.chance(0.2)) return r.pick(["sig_x", "reasoning_content", "not json"]);
		return r.pick(["QUJDRA==", "AAAA", "YWJjZGVmZ2hpag=="]);
	}
	if (["anthropic-messages", "bedrock-converse-stream", "pi-messages", "mistral-conversations"].includes(api)) return r.chance(0.2) ? r.pick(["sig_x", "reasoning_content", "A"]) : "c2lnbmF0dXJl";
	// openai-completions: field-name signature or a reasoning_details array JSON
	return r.pick([
		"reasoning",
		"reasoning_content",
		"reasoning_text",
		"reasoning",
		JSON.stringify([{ type: "reasoning.summary", text: rndText(r, 8) }]),
		JSON.stringify([
			{ type: "reasoning.encrypted", data: "RW5jcnlwdGVk" },
			{ type: "reasoning.text", text: rndText(r, 8) },
		]),
		"sig_x",
		"not json",
	]);
}

const CROSS_IDENTITIES = [
	{ api: "openai-completions", provider: "provider-a", model: "claude-sonnet-5" },
	{ api: "openai-completions", provider: "provider-b", model: "glm-5.3-flash" },
	{ api: "anthropic-messages", provider: "anthropic", model: "claude-3-7-sonnet" },
	{ api: "google-generative-ai", provider: "google", model: "gemini-2.5-pro" },
];

// --- request-direction context generator ---
function genContext(r, ident, seed) {
	const messages = [];
	let callCounter = 0;
	if (r.chance(0.7)) {
		const sys = { role: "system", content: rndText(r, 20), timestamp: 1 };
		if (r.chance(0.3)) {
			sys.toolsAdded = [
				{
					name: "echo",
					description: "Echo the given text.",
					parameters: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
				},
			];
		}
		messages.push(sys);
	}
	const bodyCount = 1 + r.int(5);
	for (let i = 0; i < bodyCount; i++) {
		if (i === 0 || r.chance(0.45)) {
			// user: plain string or text blocks (first body message is always a user
			// so the replayable transcript is never empty — pi-ai short-circuits
			// user-less contexts locally without issuing a request)
			if (i === 0 || r.chance(0.5)) {
				messages.push({ role: "user", content: rndText(r, 20), timestamp: i + 2 });
			} else {
				const blocks = [];
				const n = r.int(3);
				for (let b = 0; b < n; b++) blocks.push({ type: "text", text: rndText(r, 12) });
				messages.push({ role: "user", content: blocks, timestamp: i + 2 });
			}
			continue;
		}
		// assistant (same-model half the time, cross-model otherwise)
		const sameModel = r.chance(0.5);
		const identUsed = sameModel ? { ...ident, model: ident.id } : r.pick(CROSS_IDENTITIES.filter((x) => x.api !== ident.api || x.provider !== ident.provider || x.model !== ident.id));
		const blockCount = r.int(4);
		const content = [];
		const calls = [];
		for (let b = 0; b < blockCount; b++) {
			const kind = r.pick(["text", "text", "thinking", "toolCall"]);
			if (kind === "text") content.push({ type: "text", text: rndText(r, 16) });
			else if (kind === "thinking") {
				const blk = { type: "thinking", thinking: rndText(r, 16) };
				if (r.chance(0.75)) blk.thinkingSignature = thinkingSignature(r, identUsed.api);
				content.push(blk);
			} else {
				callCounter++;
				const id = `call_${callCounter}${r.chance(0.1) ? " x" : ""}${r.chance(0.1) ? "|fc_h" + r.int(100) : ""}`;
				const name = `tool${callCounter}`;
				calls.push({ id, name });
				content.push({ type: "toolCall", id, name, arguments: { a: callCounter } });
			}
		}
		messages.push({
			role: "assistant",
			content,
			api: identUsed.api,
			provider: identUsed.provider,
			model: identUsed.model,
			usage: zeroUsage(),
			stopReason: calls.length > 0 ? "toolUse" : r.pick(["stop", "stop", "stop", "error"]),
			timestamp: i + 2,
		});
		// constraint: every toolCall is followed by its paired toolResult
		for (const c of calls) {
			const blocks = [];
			const n = r.int(2);
			for (let b = 0; b < n; b++) blocks.push({ type: "text", text: rndText(r, 12) });
			messages.push({
				role: "toolResult",
				toolCallId: c.id,
				toolName: c.name,
				content: blocks,
				isError: r.chance(0.25),
				timestamp: i + 3,
			});
		}
	}
	return expandContext({ name: `fuzz-s${seed}`, messages }, ident, seed);
}

// --- reply-direction AssistantMessage generator (same-model, Rust serde shape) ---
function genReplyCase(r, ident, seed) {
	const blocks = [];
	const blockCount = r.int(4);
	let hasCall = false;
	for (let b = 0; b < blockCount; b++) {
		const kind = r.pick(["text", "text", "thinking", "toolCall"]);
		if (kind === "text") blocks.push({ type: "text", text: rndText(r, 16) });
		else if (kind === "thinking") {
			const blk = { type: "thinking", thinking: rndText(r, 16) };
			if (r.chance(0.8)) blk.thinkingSignature = thinkingSignature(r, ident.api);
			blocks.push(blk);
		} else {
			hasCall = true;
			blocks.push({ type: "toolCall", id: `call_r${seed}_${b}`, name: `rtool${b}`, arguments: { v: b } });
		}
	}
	const stopReason = hasCall && r.chance(0.8) ? "toolUse" : r.pick(["stop", "stop", "stop", "length", "error"]);
	const usage = {
		input: r.int(50),
		output: r.int(50),
		cacheRead: 0,
		cacheWrite: 0,
		...(r.chance(0.4) ? { reasoning: r.int(30) } : {}),
		totalTokens: 100,
		cost: { ...zeroCost },
	};
	const msg = {
		content: blocks,
		api: ident.api,
		provider: ident.provider,
		model: ident.id,
		usage,
		stopReason,
		timestamp: 0,
	};
	if (stopReason === "error") msg.errorMessage = "Provider exploded";
	if (r.chance(0.3)) msg.responseId = `resp-${seed}`;
	return expandReply({ name: `fuzz-reply-s${seed}`, message: msg }, seed);
}


export { rng, rndText, genContext, genReplyCase };
