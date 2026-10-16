// Usage: node tests/duality.mjs [protocol aliases or full API names ...]
import { writeFileSync } from "node:fs";
import { artifactPath } from "./test-artifacts.mjs";
import { matrixSummaryText } from "./matrix-summary.mjs";
import { startServer, freePort } from "./harness.mjs";
import { loadAllCorpora, corpusContexts, syntheticContexts, replyCases } from "./corpus.mjs";
import { additionalContexts, corpusReplies, additionalReplies } from "./extended-matrix-cases.mjs";
import { makeModel } from "./models-shared.mjs";
import { PROTOCOLS } from "./protocol-matrix.mjs";
import { requestDirection, replyDirection } from "./matrix-lib.mjs";
import { w06RequestCases, w06ReplyCases } from "./w06-matrix-cases.mjs";
import { w08RequestCases, w08ReplyCases } from "./w08-matrix-cases.mjs";

const wanted = process.argv.slice(2);
const protocols = wanted.length ? wanted.map((name) => {
	const protocol = PROTOCOLS.find((p) => p.alias === name || p.api === name);
	if (!protocol) throw new Error(`unknown protocol: ${name}`);
	return protocol;
}) : PROTOCOLS;
const corpora = loadAllCorpora();
const results = [];
const startedAt = new Date().toISOString();
const resultPath = artifactPath("matrix-ten-results.json");
const save = () => writeFileSync(resultPath, JSON.stringify({ startedAt, updatedAt: new Date().toISOString(), results }, null, 2));
const port = await freePort();
const server = await startServer(port);
try {
	for (const { api, canonical } of protocols) {
		const model = makeModel(api, port);
		const cases = [...corpusContexts(corpora), ...syntheticContexts(model), ...additionalContexts(model), ...w06RequestCases(model), ...w08RequestCases(model)];
		await requestDirection(api, model, server, cases, canonical, results);
		save();
		const replies = replyCases({ api, provider: model.provider, id: model.id });
		await replyDirection(api, model, server, results, [...replies, ...corpusReplies(corpora), ...additionalReplies(model, replies[0].message), ...w06ReplyCases(model, replies[0].message), ...w08ReplyCases(model, replies[0].message)]);
		save();
		const protocolResults = results.filter((r) => r.api === api);
		console.log(`${api}: ${matrixSummaryText(protocolResults)}`);
	}
} finally {
	await server.stop();
	save();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n=== matrix: ${matrixSummaryText(results)} ===`);
for (const r of results) {
	console.log(`${!r.ok ? "FAIL" : r.outcome === "expected-rejection" ? "EXPECTED-REJECTION" : "PASS"} ${r.api}/${r.dir}/${r.name}`);
	if (!r.ok) for (const d of r.diffs.slice(0, 8)) console.log(`    ${d}`);
}
console.log(`Full evidence: ${resultPath}`);
if (failed.length) process.exitCode = 1;
