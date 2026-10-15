import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { ores, codex, mistral, piAi } from "./pi-ai-imports.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { startServer, freePort } from "./harness.mjs";
import { w06RequestCases } from "./w06-matrix-cases.mjs";

const adapters = [
	["openai-responses", ores, "x-client-request-id"],
	["openai-codex-responses", codex, "session-id"],
	["mistral-conversations", mistral, "x-affinity"],
];
const user = (content) => ({ role: "user", content, timestamp: 1 });

for (const [api, adapter, sessionHeader] of adapters) {
	test(`${api}: original Unicode session fails before fetch; Unicode body reaches HTTP`, async (t) => {
		const requests = [];
		const listener = createServer(async (request, response) => {
			const chunks = [];
			for await (const chunk of request) chunks.push(chunk);
			const bytes = Buffer.concat(chunks);
			const body = request.headers["content-encoding"] === "zstd" ? zstdDecompressSync(bytes) : bytes;
			requests.push({ headers: request.headers, body: JSON.parse(body.toString("utf8")) });
			response.writeHead(400, { "content-type": "application/json" });
			response.end(JSON.stringify({ error: { message: "final-four-wire-probe-arrived" } }));
		});
		await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
		try {
			const model = makeModel(api, listener.address().port);
			const original = w06RequestCases(model).find((c) => c.name === "w06-unicode-session");
			let fetchCalls = 0;
			const countedFetch = (...args) => { fetchCalls++; return globalThis.fetch(...args); };
			const options = { ...streamOptions(api), fetch: countedFetch, signal: AbortSignal.timeout(5000) };
			const rejected = await adapter.stream(model, piAi.normalizeContext({ messages: original.messages }),
				{ ...options, ...original.options }).result();
			assert.match(rejected.errorMessage, /Cannot convert argument to a ByteString/);
			assert.match(rejected.errorMessage, /55357.*greater than 255/);
			assert.equal(fetchCalls, 0);
			assert.equal(requests.length, 0);
			t.diagnostic(JSON.stringify({ api, case: original.name, fetchCalls, httpRequests: requests.length,
				error: rejected.errorMessage, disposition: "pi-ai-external-boundary" }));

			const control = await adapter.stream(model, piAi.normalizeContext({ messages: [user("body 😀 中文")] }),
				{ ...options, sessionId: "s".repeat(70) }).result();
			assert.match(control.errorMessage, /final-four-wire-probe-arrived/);
			assert.equal(fetchCalls, 1);
			assert.equal(requests.length, 1);
			assert.match(JSON.stringify(requests[0].body), /body 😀 中文/);
			assert.equal(requests[0].headers[sessionHeader], "s".repeat(api === "openai-codex-responses" ? 64 : 70));
			t.diagnostic(JSON.stringify({ api, control: "ASCII session + Unicode JSON body", fetchCalls,
				httpRequests: requests.length, sessionLength: requests[0].headers[sessionHeader].length,
				contentEncoding: requests[0].headers["content-encoding"] ?? "identity" }));
		} finally {
			listener.closeAllConnections();
			await new Promise((resolve) => listener.close(resolve));
		}
	});
}

test("Codex original surrogate instructions reach HTTP as escaped JSON", async (t) => {
	const model = makeModel("openai-codex-responses", 1);
	const original = w06RequestCases(model).find((c) => c.name === "w06-surrogate-order");
	let fetchCalls = 0;
	let sent;
	const fetch = async (_url, init) => {
		fetchCalls++;
		const compressed = init.headers.get("content-encoding") === "zstd";
		const json = compressed ? zstdDecompressSync(init.body).toString("utf8") : init.body;
		sent = { json, contentEncoding: compressed ? "zstd" : "identity" };
		return new Response(JSON.stringify({ error: { message: "final-four-payload-observed" } }),
			{ status: 400, headers: { "content-type": "application/json" } });
	};
	const result = await codex.stream(model, piAi.normalizeContext({ messages: original.messages }),
		{ ...streamOptions(model.api), fetch, signal: AbortSignal.timeout(5000) }).result();
	assert.match(result.errorMessage, /final-four-payload-observed/);
	assert.equal(fetchCalls, 1);
	assert.equal(JSON.parse(sent.json).instructions, "s\ud800x");
	assert.ok(sent.json.includes('"instructions":"s\\ud800x"'));
	t.diagnostic(JSON.stringify({ case: original.name, fetchCalls, contentEncoding: sent.contentEncoding,
		instructions: JSON.parse(sent.json).instructions }));
});

test("Codex scalar domain: identity and zstd reject lone surrogates, preserve valid text", async (t) => {
	const server = await startServer(await freePort());
	try {
		for (const encoding of ["identity", "zstd"]) {
			for (const instructions of ["s\ud800x", "s\udc00x", "s�x", "s😀x", "s\\ud800x"]) {
				const before = readdirSync(server.captureDir).filter((name) => name.startsWith("req-")).length;
				const json = JSON.stringify({ model: "mock-gpt", instructions, input: [], stream: true })
					.replace("😀", "\\ud83d\\ude00");
				const response = await fetch(new URL("/codex/responses", server.mistralBaseUrl), {
					method: "POST", headers: { "content-type": "application/json", "content-encoding": encoding,
						authorization: `Bearer ${streamOptions("openai-codex-responses").apiKey}` },
					body: encoding === "zstd" ? zstdCompressSync(Buffer.from(json)) : json,
					signal: AbortSignal.timeout(5000),
				});
				const rejected = instructions === "s\ud800x" || instructions === "s\udc00x";
				assert.equal(response.status, rejected ? 400 : 200);
				let errorMessage;
				if (rejected) {
					const error = await response.json();
					errorMessage = error.error.message;
					assert.equal(error.error.type, "invalid_request_error");
					assert.match(errorMessage, /invalid JSON body:.*(surrogate|hex escape)/);
				} else {
					await response.text();
					const files = readdirSync(server.captureDir).filter((name) => name.startsWith("req-")).sort();
					const record = JSON.parse(readFileSync(`${server.captureDir}/${files.at(-1)}`, "utf8"));
					assert.equal(record.request.context.messages[0].content, instructions);
				}
				const after = readdirSync(server.captureDir).filter((name) => name.startsWith("req-")).length;
				assert.equal(after - before, rejected ? 0 : 1);
				t.diagnostic(JSON.stringify({ encoding, instructions, status: response.status,
					capturesAdded: after - before, errorMessage, escapedPair: json.includes("\\ud83d\\ude00") }));
			}
		}
	} finally {
		await server.stop();
	}
});
