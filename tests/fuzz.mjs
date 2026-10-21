import { appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { rng, rndText, genContext, genReplyCase } from "./fuzz-message-generator.mjs";
import { startServer, freePort } from "./harness.mjs";
import { makeModel } from "./models-shared.mjs";
import { PROTOCOLS } from "./protocol-matrix.mjs";
import { requestDirection, replyDirection } from "./matrix-lib.mjs";
import { classify, evidencePath, saveReport } from "./fuzz-expand-report.mjs";

import { protocolSelection } from "./protocol-prerequisites.mjs";
const APIS = PROTOCOLS.map(({ api }) => api);
export { rng, rndText, genContext, genReplyCase, APIS };

async function main() {
	const seedCount = Number(process.argv[2] ?? 800);
	if (!Number.isSafeInteger(seedCount) || seedCount < 1) throw new Error("seedCount must be a positive safe integer");
	const selection = protocolSelection(PROTOCOLS);
	const state = { protocols: selection.available.map(({ api }) => api), skippedProtocols: selection.skipped, seedCount, startedAt: new Date().toISOString(), status: "running", rows: [], crashFindings: [], notes: [] };
	const deadline = Date.now() + 24 * 60 * 1000;
	writeFileSync(evidencePath, "");
	saveReport(state);
	let server;
	let port;
	async function restart() {
		if (server && server.child.exitCode === null) await server.stop();
		port = await freePort();
		server = await startServer(port);
	}
	try {
		await restart();
		for (const [protocolIndex, protocol] of PROTOCOLS.entries()) {
			if (!selection.available.includes(protocol)) continue;
			const { api, canonical } = protocol;
			for (let seed = 1; seed <= seedCount; seed++) {
				if (Date.now() >= deadline) throw new Error("24-minute runner deadline reached; partial evidence preserved");
				const random = rng(seed * 1000003 + protocolIndex);
				const vision = Math.floor((seed - 1) / 8) % 2 === 0;
				const model = { ...makeModel(api, port), input: vision ? ["text", "image"] : ["text"],
					...(api === "mistral-conversations" ? { baseUrl: server.mistralBaseUrl } : {}) };
				const ident = { api, provider: model.provider, id: model.id };
				const request = genContext(random, ident, seed);
				const reply = genReplyCase(random, ident, seed);
				for (const [dir, source] of [["req", request], ["reply", reply]]) {
					const results = [];
					if (dir === "req") await requestDirection(api, model, server, [request], canonical, results);
					else await replyDirection(api, model, server, results, [reply]);
					const row = results[0];
					const captureFiles = readdirSync(server.captureDir).filter((file) => file.startsWith("req-"));
					const captures = row.ok ? undefined : captureFiles.map((file) => {
						const record = JSON.parse(readFileSync(`${server.captureDir}/${file}`, "utf8"));
						return { api: record.api, request: record.request };
					});
					row.phase ??= row.actual !== null ? "compare" : captureFiles.length ? "oracle" : "capture";
					const category = classify({ ...row, captureCount: captureFiles.length });
					const meta = { line: state.rows.length + 1, seed, shape: source.shape, vision, category, captureCount: captureFiles.length };
					appendFileSync(evidencePath, gzipSync(JSON.stringify({ ...row, ...meta, source, ...(captures ? { captures } : {}) }) + "\n"));
					state.rows.push({ api, dir, name: row.name, ...meta, phase: row.phase, diffs: row.diffs });
					if (server.child.exitCode !== null || server.child.signalCode !== null) {
						state.crashFindings.push(`${api}/${dir}/seed-${seed}: exit=${server.child.exitCode} signal=${server.child.signalCode}`);
						saveReport(state);
						await restart();
					}
				}
				if (seed % 25 === 0 || seed === seedCount) {
					const counts = saveReport(state);
					console.log(JSON.stringify({ api, seed, total: state.rows.length, ...counts }));
				}
			}
		}
		state.status = "completed";
	} catch (error) {
		state.status = "incomplete";
		state.notes.push(String(error.stack ?? error));
		process.exitCode = 2;
	} finally {
		const counts = saveReport(state);
		console.log(JSON.stringify({ status: state.status, total: state.rows.length, counts, crashes: state.crashFindings }));
		if (counts.finding || counts["external-boundary"] || state.crashFindings.length) process.exitCode ||= 1;
		if (server && server.child.exitCode === null && server.child.signalCode === null) await server.stop();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
