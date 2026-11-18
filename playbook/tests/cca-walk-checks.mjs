// CCA result_ref 领域 kit 单测：解引用适配器（封套/完整对象两形态、sha256/
// bytes 防篡改、缺引用/坏 JSON/坏文件硬错误、CLI 退出码）、合成取页器
//（cursor 契约）、终页 judger（pass/fail 判定 + 解引用故障非零退出不
// fallthrough）、分页遍历 segment（跨进程重建、真实 bash 执行取页与写清单
// 文件、游标=末成员 id、篡改 fixture 硬停）。fixture 全部公开合成生成，
// 不含真实 CCA 私有路径。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parsePlaybook } from "../parse-markdown.mjs";
import { runPlaybook } from "../playbook-runtime.mjs";
import { dereference, dereferenceToolText, parseCandidateJson } from "../examples/programs/cca-result-ref.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(moduleDir, "..", "examples");
const programs = (name) => join(examplesDir, "programs", name);
const judges = (name) => join(examplesDir, "judges", name);
const runProgram = (file, args, input, options = {}) => spawnSync(process.execPath, [file, ...args], { input, encoding: "utf8", ...options });

const makeFixtures = (dir, total, size) => {
	const out = runProgram(programs("cca-make-fixtures.mjs"), [dir, String(total), String(size)]);
	assert.equal(out.status, 0, out.stderr);
	return dir;
};

const SYS = { role: "system", content: "sysprompt", toolsAdded: [{ name: "bash", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } }] };
const asstMsg = (content, stopReason = "stop") => ({ role: "assistant", content, stopReason });
const run = (steps, messages, options = {}) => runPlaybook(steps, { api: "openai-completions", model: "mock-m", request: { context: { messages } } }, options);

test("playbook integration: judge fault stops with playbook_judge_error instead of falling through to otherwise", () => {
	const md = [
		"```user",
		"any: true",
		"```",
		"",
		"```call bash",
		"command: node fixture-page.mjs",
		"```",
		"",
		"```toolResult",
		`- judge: node ${JSON.stringify(judges("cca-members-final.mjs"))}`,
		"- otherwise: true",
		"```",
		"",
		"```say",
		"otherwise 兜底。",
		"```",
		"",
		"```end",
		"```",
	].join("\n");
	const steps = parsePlaybook(md);
	const broken = run(steps, [SYS, { role: "user", content: "go" }, asstMsg([{ type: "toolCall", id: "mdp_0", name: "bash", arguments: { command: "node fixture-page.mjs" } }], "toolUse"), { role: "toolResult", toolCallId: "mdp_0", toolName: "bash", content: [{ text: JSON.stringify({ result_ref: { path: "/nonexistent/page.json" } }) }], isError: false }]);
	assert.equal(broken.error.code, "playbook_judge_error");
	assert.match(broken.error.message, /unreadable reference/);
	assert.equal(broken.reply, undefined, "fault must not reach the otherwise case");
	const dir = makeFixtures(mkdtempSync(join(tmpdir(), "cca-pb-")), 4, 4);
	const finalEnvelope = readFileSync(join(dir, "env-0.json"), "utf8");
	const matched = run(steps, [SYS, { role: "user", content: "go" }, asstMsg([{ type: "toolCall", id: "mdp_0", name: "bash", arguments: { command: "node fixture-page.mjs" } }], "toolUse"), { role: "toolResult", toolCallId: "mdp_0", toolName: "bash", content: [{ text: finalEnvelope }], isError: false }]);
	assert.equal(matched.reply.content[0].text, "otherwise 兜底。", "single complete page: judge passes ⇒ no pass target ⇒ continue after the block");
});

const walkPlaybookMd = (fixtureDir) => [
	"```user",
	"any: true",
	"```",
	"",
	"```segment",
	`command: node ${JSON.stringify(programs("cca-scc-walk-segment.mjs"))} --fixture-dir ${JSON.stringify(fixtureDir)}`,
	"cases:",
	"  - exact: 遍历完成",
	"    pass:",
	"      to: 完成",
	"  - otherwise: true",
	"```",
	"",
	"```say",
	"遍历异常。",
	"```",
	"",
	"```end",
	"```",
	"",
	'<a id="完成"></a>',
	"",
	"```say",
	"游程完成：外层收尾。",
	"```",
	"",
	"```end",
	"```",
	"",
].join("\n");

test("walk segment: cross-process walk over 3 pages with REAL bash page fetches, cursor=last member id, real summary file", () => {
	const fixtureDir = makeFixtures(mkdtempSync(join(tmpdir(), "cca-walk-")), 5, 2);
	const project = mkdtempSync(join(tmpdir(), "cca-walk-project-"));
	const playbookPath = join(fixtureDir, "walk.md");
	writeFileSync(playbookPath, walkPlaybookMd(fixtureDir));
	const invoke = (messages) => {
		const stdin = JSON.stringify({ api: "openai-completions", model: "mock-m", request: { context: { messages } } });
		const out = spawnSync(process.execPath, [join(moduleDir, "..", "mock.mjs"), "--playbook", playbookPath], { input: stdin, encoding: "utf8" });
		assert.equal(out.status, 0, out.stderr);
		return JSON.parse(out.stdout);
	};
	const transcript = [SYS, { role: "user", content: "开始" }];
	const cursors = [];
	let reply;
	for (let round = 0; round < 8; round++) {
		reply = invoke(transcript);
		assert.equal(reply.error, undefined, JSON.stringify(reply));
		if (reply.stopReason === "stop") break;
		const call = reply.content.find((block) => block.type === "toolCall");
		const cursor = call.arguments.command.match(/"m\d+"$/)?.[0]?.slice(1, -1);
		if (cursor) cursors.push(cursor);
		const exec = spawnSync("bash", ["-c", call.arguments.command], { cwd: project, encoding: "utf8" });
		assert.equal(exec.status, 0, `real page fetch failed: ${exec.stderr}`);
		transcript.push(asstMsg(reply.content, "toolUse"), { role: "toolResult", toolCallId: call.id, toolName: "bash", content: [{ text: exec.stdout }], isError: false });
	}
	assert.equal(reply.content[0].text, "游程完成：外层收尾。", "the internal return value routed the outer cases to the anchor");
	assert.deepEqual(cursors, ["m02", "m04"], "pages 2 and 3 were fetched with the PREVIOUS page's last member id (not first/last page shortcuts)");
	assert.equal(readFileSync(join(project, "cca-walk-members.txt"), "utf8"), "m01\nm02\nm03\nm04\nm05\n", "real side effect file written by the summary toolCall");
});

test("walk segment: tampering a page file (valid JSON, wrong sha256) hard-stops the whole walk", () => {
	const fixtureDir = makeFixtures(mkdtempSync(join(tmpdir(), "cca-tamper-")), 4, 2);
	const page1 = JSON.parse(readFileSync(join(fixtureDir, "page-1.json"), "utf8"));
	writeFileSync(join(fixtureDir, "page-1.json"), JSON.stringify({ ...page1, members: [{ id: "pwned", file: "x", line: 1, reason: "tampered but valid JSON" }] }));
	const steps = parsePlaybook(walkPlaybookMd(fixtureDir));
	const project = mkdtempSync(join(tmpdir(), "cca-tamper-project-"));
	const transcript = [SYS, { role: "user", content: "go" }];
	for (let round = 0; round < 5; round++) {
		const reply = run(steps, transcript, { judgeCwd: examplesDir });
		if (reply.error) {
			assert.equal(reply.error.code, "playbook_program_error");
			assert.match(reply.error.message, /Error: result_ref/, "tamper rejected by the envelope integrity check (bytes/sha256)");
			assert.ok(!existsSync(join(project, "cca-walk-members.txt")), "tampered walk must not reach the summary write");
			return;
		}
		const call = reply.reply.content.find((block) => block.type === "toolCall");
		const exec = spawnSync("bash", ["-c", call.arguments.command], { cwd: project, encoding: "utf8" });
		transcript.push(asstMsg(reply.reply.content, "toolUse"), { role: "toolResult", toolCallId: call.id, toolName: "bash", content: [{ text: exec.stdout }], isError: false });
	}
	assert.fail("tampered fixture must hard-stop the walk");
});

test("committed example and fixtures are consistent: manifest walk passes the adapter and the playbook parses", () => {
	const steps = parsePlaybook(readFileSync(join(examplesDir, "cca-scc-walk.md"), "utf8"));
	assert.equal(steps.filter((s) => s.kind === "segment").length, 1);
	const fixtureDir = join(examplesDir, "cca");
	const manifest = JSON.parse(readFileSync(join(fixtureDir, "manifest.json"), "utf8"));
	const seen = [];
	let total = null;
	for (const entry of manifest.pages) {
		const page = dereference(JSON.parse(readFileSync(join(fixtureDir, entry.envelope), "utf8")), { cwd: fixtureDir });
		assert.equal(page.page_start, seen.length, "committed pages chain by position");
		assert.equal(page.page_size, page.members.length);
		const cursorOk = page.next_after === null ? page.page_start + page.members.length === page.total : page.next_after === page.members.at(-1).id;
		assert.equal(cursorOk, true, "cursor contract on committed fixtures");
		total ??= page.total;
		assert.equal(page.total, total);
		seen.push(...page.members.map((row) => row.id));
	}
	assert.equal(new Set(seen).size, seen.length, "no duplicate members across committed pages");
	assert.equal(total, seen.length, "final page completes the member list");
});
