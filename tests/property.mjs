import { resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { freePort, startServer, deepDiff, repoRoot, serverBin } from "./harness.mjs";
import { PROTOCOLS } from "./protocol-matrix.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { loadCorpora, corpusContexts, syntheticContexts, replyCases } from "./corpus.mjs";
import { additionalContexts, corpusReplies, additionalReplies } from "./extended-matrix-cases.mjs";
import { w06RequestCases, w06ReplyCases } from "./w06-matrix-cases.mjs";
import { w08RequestCases, w08ReplyCases } from "./w08-matrix-cases.mjs";
import { rng, genContext, genReplyCase } from "./fuzz-message-generator.mjs";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { captureRequest, captureReply } from "./property-transport.mjs";
import { decodedContext } from "./property-context.mjs";
import { savePropertyReport } from "./property-report.mjs";
import { requestDomain } from "./property-request-domain.mjs";
import { requestProjection } from "./property-request-projection.mjs";

const roots = PROTOCOLS.filter((p) => ["completions", "responses", "anthropic", "google"].includes(p.alias));
const wanted = process.argv.slice(2);
const protocols = wanted.length ? wanted.map((name) => {
	const root = roots.find((p) => [p.api, p.alias].includes(name));
	if (!root) throw new Error(`not a family root: ${name}`);
	return root;
}) : roots;
const inputHashes = () => Object.fromEntries(readdirSync(new URL("./", import.meta.url)).filter((name) => name.endsWith(".mjs")).map((name) =>
	[name, createHash("sha256").update(readFileSync(new URL(name, import.meta.url))).digest("hex")]));
const environmentHashes = () => {
	const baseline = JSON.parse(readFileSync(new URL("./property-baseline.json", import.meta.url)));
	const baselinePaths = Object.keys(baseline.files).map((path) => path.replace("<repo>", repoRoot).replace("<pi-mono>", resolve(repoRoot, "../pi-mono")));
	const paths = [...baselinePaths.filter((path) => path.startsWith(`${repoRoot}/src/`) || path.includes("/pi-mono/packages/ai/src/") || path.endsWith("/irreversibility-atlas.md") || path.includes("/mock-llm-server/api/")), serverBin];
	return Object.fromEntries(paths.map((path) => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
};
const state = { startedAt: new Date().toISOString(), inputHashes: inputHashes(), environmentHashes: environmentHashes(), status: "running", results: [], notes: [
	"本轮按 owner 裁决修复统一 Codex 编码出口、P1 合成期待及定义域；原24条反例保存在 property-p1-counterexamples.json。TS 权威源码只读，完整哈希校验见 f4-p1-readonly-hashes.json。",
	"工作区没有 .git（git status --short: exit 128）；未执行 git add/commit，但无法独立确认 index/no-staged-files。",
	"W-07 Bedrock/Mistral/Codex 专项不属本轮四根；冻结演进作为边界保留。输入域拒绝同样计入失败。",
	"首轮未加 Rust 无标签块→TS 判别标签桥，结果已保留 property-first-run-results.json；该轮无效，不混入最终通过率。桥仅添加 type，不改 payload 值/身份。",
	"P1 统一比较 Q_p(B(first)) 与 K_p(B(first))；rawIdempotent/rawDiffs 保留字面不动点反例。定义域拒绝仍为 finding，不计通过。P4 未改变。",
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
	let first;
	let failure;
	try { first = (await captureRequest(api, model, options, server, tc)).request; }
	catch (error) { failure = error; }
	const requireFirst = () => { if (failure) throw failure; };
	await check("P1", api, tc.name, undefined, async (row) => {
		row.phase = "first-decode";
		if (domain) {
			row.domain = domain;
			row.phase = "domain-finding";
			row.observedRejection = failure ? String(failure.message) : undefined;
			row.domainMatched = Boolean(failure && failure.message.includes("ByteString"));
			throw new Error(row.domainMatched ? `expected-rejection/domain finding: ${domain.reason}` : "request-domain prediction did not match observed rejection");
		}
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
			row.expected = target.canonical(decodedContext(first), targetModel, targetOptions);
			row.phase = "target-decode";
			row.actual = (await captureRequest(target.api, targetModel, targetOptions, server, decodedContext(first))).request;
			row.phase = "target-second-decode";
			row.repeated = (await captureRequest(target.api, targetModel, targetOptions, server, decodedContext(row.actual))).request;
			row.diffs = [...diff(row.actual, row.expected, target.api).map((d) => `projection: ${d}`), ...diff(row.repeated, row.actual, target.api).map((d) => `stability: ${d}`)];
		});
	}
}

async function replyProperty(api, model, options, tc) {
	await check("P2", api, tc.name, undefined, async (row) => {
		row.phase = "reply-oracle";
		row.parserExpected = canonicalReply(api, tc.message, model);
		row.phase = "first-encode-parse";
		const started = Date.now();
		const first = await captureReply(api, model, options, server, tc.message);
		row.parsed = first.parsed;
		row.expected = first.frames;
		const parserDiffs = compareReply(first.parsed, row.parserExpected, deepDiff, started, Date.now());
		row.phase = "second-encode";
		row.actual = (await captureReply(api, model, options, server, first.parsed)).frames;
		row.diffs = [...parserDiffs.map((d) => `parser: ${d}`), ...diff(row.actual, row.expected, api).map((d) => `frames: ${d}`)];
	});
}

savePropertyReport(state);
try {
	const corpora = loadCorpora();
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
		console.log(`${api}: ${state.results.filter((r) => r.api === api && r.ok).length}/${state.results.filter((r) => r.api === api).length} passed`);
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
console.log(`${state.results.length - failures} pass / ${failures} findings; ${state.status}`);
if (failures) process.exitCode = 1;
