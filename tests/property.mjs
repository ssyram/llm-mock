import { resolve } from "node:path";
import { referenceRoot } from "./pi-ai-reference.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { freePort, startServer, deepDiff, repoRoot, serverBin } from "./harness.mjs";
import { PROTOCOLS } from "./protocol-matrix.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { loadAllCorpora, corpusContexts, syntheticContexts, replyCases } from "./corpus.mjs";
import { additionalContexts, corpusReplies, additionalReplies } from "./extended-matrix-cases.mjs";
import { w06RequestCases, w06ReplyCases } from "./w06-matrix-cases.mjs";
import { w08RequestCases, w08ReplyCases } from "./w08-matrix-cases.mjs";
import { rng, genContext, genReplyCase } from "./fuzz-message-generator.mjs";
import { captureRequest, captureReply } from "./property-transport.mjs";
import { decodedContext } from "./property-context.mjs";
import { savePropertyReport, propertySummary } from "./property-report.mjs";
import { requestDomain } from "./property-request-domain.mjs";
import { requestProjection } from "./property-request-projection.mjs";
import { replyComposition, crossProjection } from "./property-composition.mjs";
import { headerRejection } from "./request-header-rejection.mjs";
import { emptyGoogleRejection } from "./request-body-rejection.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { piAi } from "./pi-ai-imports.mjs";

const roots = PROTOCOLS.filter((p) => ["completions", "responses", "anthropic", "google"].includes(p.alias));
const wanted = process.argv.slice(2);
const protocols = wanted.length ? wanted.map((name) => {
	const root = roots.find((p) => [p.api, p.alias].includes(name));
	if (!root) throw new Error(`not a family root: ${name}`);
	return root;
}) : roots;
const inputHashes = () => Object.fromEntries(readdirSync(new URL("./", import.meta.url), { recursive: true, withFileTypes: true })
	.filter((entry) => entry.isFile() && /\.(mjs|ts)$/.test(entry.name) && !entry.parentPath.includes("/node_modules/"))
	.map((entry) => resolve(entry.parentPath, entry.name)).sort().map((path) =>
		[path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
const environmentHashes = () => {
	const sourceFiles = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile()).map((entry) => resolve(entry.parentPath, entry.name)).sort();
	const docs = resolve(repoRoot, "docs/design/mock-llm-server");
	const paths = [...sourceFiles(resolve(repoRoot, "src")), ...sourceFiles(resolve(referenceRoot, "packages/ai/src")),
		...sourceFiles(resolve(docs, "api")), resolve(docs, "irreversibility-atlas.md"), resolve(docs, "property-tests.md"), serverBin];
	return Object.fromEntries(paths.map((path) => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
};
const state = { startedAt: new Date().toISOString(), inputHashes: inputHashes(), environmentHashes: environmentHashes(), status: "running", results: [], notes: [
	"官方 submodule 只读；逐次 canonical 合成定义见 docs/design/mock-llm-server/property-tests.md。",
	"原始帧和非稳定投影差异完整保留；预期拒绝与前提不成立单列，不计matched。",
] };
let server;
const watchdog = setTimeout(() => {
	state.status = "hard-timeout";
	savePropertyReport(state);
	server?.child.kill("SIGTERM");
	process.exit(124);
}, 28 * 60 * 1000);
const record = (property, api, name, details) => {
	state.results.push({ property, api, name, ...details });
	savePropertyReport(state);
};
const diff = (actual, expected, api) => deepDiff(actual, expected, [], "$", [], api);
async function check(property, api, name, target, run) {
	const row = { ...(target ? { target } : {}), phase: "setup" };
	try {
		await run(row);
		row.phase = "compare";
		row.ok = row.diffs.length === 0;
	} catch (error) {
		row.ok = false;
		row.diffs = [String(error?.message ?? error)];
	}
	record(property, api, name, row);
}

async function requestProperties(protocol, model, options, tc, port) {
	const { api, canonical } = protocol;
	const domain = requestDomain(api, model, options);
	if (domain) {
		const rejection = await headerRejection(server, STREAMERS[api], model, piAi.normalizeContext(tc), options, domain);
		record("P1", api, tc.name, { ...rejection, phase: "request-boundary" });
		for (const [property, target] of [["P3", undefined], ...roots.filter((p) => p.api !== api).map((p) => ["P4", p.api])]) {
			record(property, api, tc.name, { target, outcome: "not-applicable", ok: true, diffs: [], reason: "source has no decoded value after asserted rejection" });
		}
		return;
	}
	let first;
	let failure;
	try { first = (await captureRequest(api, model, options, server, tc)).request; }
	catch (error) { failure = error; }
	const requireFirst = () => { if (failure) throw failure; };
	await check("P1", api, tc.name, undefined, async (row) => {
		row.phase = "first-decode";
		requireFirst();
		row.phase = "second-decode";
		const actual = (await captureRequest(api, model, options, server, decodedContext(first))).request;
		Object.assign(row, requestProjection(first, actual, canonical, model, options));
	});
	await check("P3", api, tc.name, undefined, async (row) => {
		row.phase = "first-decode";
		requireFirst();
		row.phase = "oracle-composition";
		row.firstExpected = canonical(tc, model, options);
		row.firstActual = first;
		row.expected = canonical(decodedContext(row.firstExpected), model, options);
		row.actual = canonical(decodedContext(first), model, options);
		row.diffs = [...diff(first, row.firstExpected, api).map((d) => `first: ${d}`), ...diff(row.actual, row.expected, api).map((d) => `closure: ${d}`)];
	});
	for (const target of roots.filter((p) => p.api !== api)) {
		await check("P4", api, tc.name, target.api, async (row) => {
			row.phase = "source-decode";
			requireFirst();
			const targetModel = { ...makeModel(target.api, port), ...(tc.modelOverrides?.input ? { input: tc.modelOverrides.input } : {}) };
			const targetOptions = { ...streamOptions(target.api), ...tc.options };
			row.phase = "target-oracle";
			const context = decodedContext(first);
			row.expected = target.canonical(context, targetModel, targetOptions);
			const targetDomain = requestDomain(target.api, targetModel, targetOptions);
			if (targetDomain) {
				Object.assign(row, await headerRejection(server, STREAMERS[target.api], targetModel, piAi.normalizeContext(context), targetOptions, targetDomain));
				return;
			}
			if (target.api === "google-generative-ai" && row.expected.context.messages.every((m) => m.role === "system")) {
				Object.assign(row, await emptyGoogleRejection(server, STREAMERS[target.api], targetModel, piAi.normalizeContext(context), targetOptions));
				return;
			}
			row.phase = "target-decode";
			const actual = (await captureRequest(target.api, targetModel, targetOptions, server, context)).request;
			row.phase = "target-second-decode";
			const repeated = (await captureRequest(target.api, targetModel, targetOptions, server, decodedContext(actual))).request;
			Object.assign(row, crossProjection(first, actual, repeated, target.canonical, targetModel, targetOptions));
		});
	}
}

async function replyProperty(api, model, options, tc) {
	await check("P2", api, tc.name, undefined, async (row) => {
		row.phase = "reply-oracle";
		const started = Date.now();
		const first = await captureReply(api, model, options, server, tc.message);
		const middle = Date.now();
		row.phase = "second-encode";
		const second = await captureReply(api, model, options, server, first.parsed);
		Object.assign(row, replyComposition(api, tc.message, first, second, model, [[started, middle], [middle, Date.now()]]));
	});
}

savePropertyReport(state);
try {
	const corpora = loadAllCorpora();
	const port = await freePort();
	server = await startServer(port);
	for (const protocol of protocols) {
		const { api } = protocol;
		const model = makeModel(api, port);
		const ident = { api, provider: model.provider, id: model.id };
		const seeds = Array.from({ length: 12 }, (_, index) => index + 1);
		const contexts = [...corpusContexts(corpora), ...syntheticContexts(model), ...additionalContexts(model), ...w06RequestCases(model), ...w08RequestCases(model),
			...seeds.map((seed) => genContext(rng(seed * 1000003 + roots.indexOf(protocol)), ident, seed))];
		for (const tc of contexts) {
			await requestProperties(protocol, { ...model, ...tc.modelOverrides }, { ...streamOptions(api), ...tc.options }, tc, port);
		}
		const replies = replyCases(ident);
		for (const tc of [...corpusReplies(corpora), ...replies, ...additionalReplies(model, replies[0].message), ...w06ReplyCases(model, replies[0].message), ...w08ReplyCases(model, replies[0].message),
			...seeds.map((seed) => genReplyCase(rng(seed * 1000003 + roots.indexOf(protocol)), ident, seed))]) {
			await replyProperty(api, model, streamOptions(api), tc);
		}
		console.log(JSON.stringify({ api, ...propertySummary(state.results.filter((r) => r.api === api)) }));
	}
	state.status = "completed";
} catch (error) {
	state.status = "environment-blocked";
	state.notes.push(`环境异常：${String(error?.stack ?? error)}`);
	process.exitCode = 2;
} finally {
	await server?.stop();
	clearTimeout(watchdog);
	state.changedInputs = Object.entries(inputHashes()).filter(([name, hash]) => state.inputHashes[name] !== hash).map(([name]) => name);
	state.changedEnvironment = Object.entries(environmentHashes()).filter(([name, hash]) => state.environmentHashes[name] !== hash).map(([name]) => name);
	if (state.changedEnvironment.length) state.notes.push(`执行期间源码/二进制变化：${state.changedEnvironment.join(", ")}；结果仅按开始快照归属。`);
	if (state.changedInputs.length) state.notes.push(`执行期间测试输入文件变化：${state.changedInputs.join(", ")}；需按记录哈希复审。`);
	savePropertyReport(state);
}
const failures = state.results.filter((r) => !r.ok).length;
console.log(`${state.summary.matched} matched / ${state.summary.expectedRejections} expected rejections / ${state.summary.notApplicable} not applicable / ${failures} failures; ${state.status}`);
if (failures || state.status !== "completed" || state.changedInputs.length || state.changedEnvironment.length) process.exitCode ||= 1;
