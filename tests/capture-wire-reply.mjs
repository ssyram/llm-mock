import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { writeFileSync } from "node:fs";
import { STREAMERS } from "./matrix-lib.mjs";
import { piAi } from "./pi-ai-imports.mjs";

export async function captureWireReply(api, source, model, options, server, mutate = (wire) => wire, control) {
	writeFileSync(server.replyPath, JSON.stringify(source));
	const records = [];
	let acknowledgeClose, closeTimer;
	const responseClosed = new Promise((resolve) => { acknowledgeClose = resolve; });
	const proxy = createServer((incoming, outgoing) => {
		outgoing.once("close", () => acknowledgeClose({ unfinished: !outgoing.writableEnded }));
		const upstream = request(new URL(incoming.url, `http://127.0.0.1:${server.port}`), {
			method: incoming.method, headers: { ...incoming.headers, host: `127.0.0.1:${server.port}` },
		}, (response) => {
			const chunks = [];
			response.on("data", (chunk) => chunks.push(chunk));
			response.on("end", () => {
				const wire = { status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) };
				records.push(wire);
				const delivered = mutate(wire);
				const headers = { ...delivered.headers };
				delete headers["transfer-encoding"];
				headers["content-length"] = String(delivered.body.length);
				outgoing.writeHead(delivered.status, headers);
				if (control?.prefixLength) outgoing.write(delivered.body.subarray(0, control.prefixLength(delivered.body)));
				else outgoing.end(delivered.body);
			});
		});
		upstream.on("error", (error) => outgoing.destroy(error));
		incoming.pipe(upstream);
	});
	await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
	const proxyModel = { ...model, baseUrl: model.baseUrl.replace(`http://127.0.0.1:${server.port}`, `http://127.0.0.1:${proxy.address().port}`) };
	const started = Date.now();
	try {
		const stream = STREAMERS[api](proxyModel, piAi.normalizeContext({ messages: [{ role: "user", content: "go", timestamp: 1 }] }),
			{ ...options, signal: options.signal ?? AbortSignal.timeout(10000) });
		if (control?.onEvent) for await (const event of stream) control.onEvent(event);
		const parsed = await stream.result();
		const connection = control?.prefixLength ? await Promise.race([responseClosed, new Promise((_, reject) => {
			closeTimer = setTimeout(() => reject(new Error("client did not close incomplete response after cancellation")), 5000);
		})]) : undefined;
		assert.equal(records.length, 1, `${api}: exactly one HTTP response`);
		assert.equal(records[0].status, 200, records[0].body.toString());
		return { wire: records[0], parsed, model: proxyModel, window: [started, Date.now()], connection };
	} finally {
		clearTimeout(closeTimer);
		proxy.closeAllConnections();
		await new Promise((resolve) => proxy.close(resolve));
	}
}
