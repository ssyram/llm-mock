import { STREAMERS } from "./matrix-lib.mjs";
import { piAi } from "./pi-ai-imports.mjs";
import { streamChunks } from "./stream-partitions.mjs";

export async function replaySse(api, model, options, wire, cuts, abortAfter) {
	const original = globalThis.fetch;
	const abort = new AbortController();
	let calls = 0;
	globalThis.fetch = async () => {
		calls++;
		const headers = new Headers();
		for (const [name, value] of Object.entries(wire.headers)) if (typeof value === "string") headers.set(name, value);
		return new Response(streamChunks(wire.body, cuts, abortAfter === undefined ? {} : { abortAfter, abort }), { status: wire.status, headers });
	};
	const started = Date.now();
	try {
		const parsed = await STREAMERS[api](model, piAi.normalizeContext({ messages: [{ role: "user", content: "go", timestamp: 1 }] }),
			{ ...options, signal: abort.signal }).result();
		if (calls !== 1) throw new Error(`${api}: replay made ${calls} fetch calls instead of one`);
		return { parsed, window: [started, Date.now()], aborted: abort.signal.aborted };
	} finally { globalThis.fetch = original; }
}
