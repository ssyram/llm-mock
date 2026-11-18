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

import "./cca-walk-checks.mjs";

test("adapter: envelope dereference returns the full object; sha256/bytes are verified", () => {
	const dir = makeFixtures(mkdtempSync(join(tmpdir(), "cca-ad-")), 5, 2);
	const envelope = JSON.parse(readFileSync(join(dir, "env-0.json"), "utf8"));
	const page = dereference(envelope, { cwd: dir });
	assert.equal(page.total, 5);
	assert.equal(page.page_start, 0);
	assert.deepEqual(page.members.map((row) => row.id), ["m01", "m02"]);
	assert.equal(page.next_after, "m02", "cursor contract: next_after is the last member id while more pages remain");
	const last = dereference(JSON.parse(readFileSync(join(dir, "env-2.json"), "utf8")), { cwd: dir });
	assert.equal(last.next_after, null);
	assert.equal(last.page_start + last.members.length, last.total, "final page consistency");
});

test("adapter: a full object without result_ref passes through (real-sample shape); candidates cover whole-text and last-line JSON", () => {
	const full = { total: 19, page_start: 0, page_size: 19, members: [{ id: "a" }], next_after: null };
	assert.deepEqual(dereference(full), full, "no result_ref.path ⇒ the object IS the full payload (CCA _dereference semantics)");
	assert.deepEqual(dereferenceToolText(JSON.stringify(full)), full);
	assert.deepEqual(dereferenceToolText(`cli noise\n${JSON.stringify(full)}`), full, "last-line JSON candidate");
	assert.deepEqual(parseCandidateJson(JSON.stringify(full)), full);
});

test("adapter: missing path, missing file, invalid JSON, and tampering are hard errors with reasons", () => {
	const dir = makeFixtures(mkdtempSync(join(tmpdir(), "cca-bad-")), 4, 2);
	const envelope = JSON.parse(readFileSync(join(dir, "env-0.json"), "utf8"));
	assert.throws(() => dereferenceToolText("not json at all"), /carries no JSON object/);
	assert.throws(() => dereferenceToolText(JSON.stringify({ result_ref: {} })), /path must be a non-empty string/);
	assert.throws(() => dereference({ ...envelope, result_ref: { ...envelope.result_ref, path: join(dir, "missing.json") } }, { cwd: dir }), /unreadable reference/);
	const tampered = join(dir, "page-0-tampered.json");
	writeFileSync(tampered, JSON.stringify({ ...JSON.parse(readFileSync(join(dir, "page-0.json"), "utf8")), members: [{ id: "pwned" }] }));
	assert.throws(() => dereference({ result_ref: { path: tampered, sha256: envelope.result_ref.sha256 } }, { cwd: dir }), /sha256 mismatch/, "valid JSON with wrong content must not pass");
	assert.throws(() => dereference({ result_ref: { path: tampered, bytes: 1 } }, { cwd: dir }), /bytes mismatch/);
	writeFileSync(tampered, "<<<not json>>>");
	assert.throws(() => dereference({ ...envelope, result_ref: { path: tampered } }, { cwd: dir }), /not valid JSON/);
});

test("adapter CLI: stdout carries the dereferenced object; failures exit 3 with stderr", () => {
	const dir = makeFixtures(mkdtempSync(join(tmpdir(), "cca-cli-")), 3, 3);
	const envelope = readFileSync(join(dir, "env-0.json"), "utf8");
	const ok = runProgram(programs("cca-result-ref.mjs"), [], envelope);
	assert.equal(ok.status, 0, ok.stderr);
	assert.equal(JSON.parse(ok.stdout).total, 3);
	const bad = runProgram(programs("cca-result-ref.mjs"), [], JSON.stringify({ result_ref: { path: join(dir, "nope.json") } }));
	assert.equal(bad.status, 3);
	assert.match(bad.stderr, /unreadable reference/);
	assert.equal(bad.stdout, "", "hard error never prints a dereferenced payload");
});

test("fixture-page: cursor contract — first page without cursor, later pages by last-member id, unknown cursor is a hard error", () => {
	const dir = makeFixtures(mkdtempSync(join(tmpdir(), "cca-page-")), 7, 3);
	const first = runProgram(programs("cca-fixture-page.mjs"), [dir]);
	assert.equal(first.status, 0, first.stderr);
	assert.equal(JSON.parse(first.stdout).result_ref.path, join(dir, "page-0.json"), "absolute fixture style");
	const second = runProgram(programs("cca-fixture-page.mjs"), [dir, "m03"]);
	assert.equal(JSON.parse(second.stdout).result_ref.path, join(dir, "page-1.json"));
	const unknown = runProgram(programs("cca-fixture-page.mjs"), [dir, "zzz"]);
	assert.equal(unknown.status, 4);
	assert.match(unknown.stderr, /unknown cursor/);
});

const judgeEnvelope = (text) => JSON.stringify({ message: { role: "toolResult", toolCallId: "t", content: [{ text }] }, context: { messages: [] }, location: { playbook: "t", step: 1, kind: "toolResult", heading: null, case: 1, anchor: null }, targets: [] });

test("judge: final page passes, mid page fails, dereference faults exit non-zero (never prints fail)", () => {
	const dir = makeFixtures(mkdtempSync(join(tmpdir(), "cca-judge-")), 5, 2);
	const finalEnvelope = readFileSync(join(dir, "env-2.json"), "utf8");
	const midEnvelope = readFileSync(join(dir, "env-0.json"), "utf8");
	assert.equal(runProgram(judges("cca-members-final.mjs"), [], judgeEnvelope(finalEnvelope)).stdout.trim(), "pass");
	assert.equal(runProgram(judges("cca-members-final.mjs"), [], judgeEnvelope(midEnvelope)).stdout.trim(), "fail", "next_after non-null ⇒ not the final page");
	const fault = runProgram(judges("cca-members-final.mjs"), [], judgeEnvelope(JSON.stringify({ result_ref: { path: join(dir, "gone.json") } })));
	assert.equal(fault.status, 3, "missing reference is a judge fault, not a no-match");
	assert.match(fault.stderr, /unreadable reference/);
	assert.equal(fault.stdout, "", "fault must not be reportable as fail (no fallthrough)");
	const fullObject = JSON.stringify({ total: 3, page_start: 0, page_size: 3, members: [{ id: "a" }, { id: "b" }, { id: "c" }], next_after: null });
	assert.equal(runProgram(judges("cca-members-final.mjs"), [], judgeEnvelope(fullObject)).stdout.trim(), "pass", "full-object sample (no envelope) is judged directly");
});
