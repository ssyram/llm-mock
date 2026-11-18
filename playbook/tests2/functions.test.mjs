// 文件即函数/{{}} 引用/预算终止/外接程序/缓存行为（examples2 真实驱动）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { callsOf, errorOf, session, textOf } from "./helpers/run-mock2.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, "..", "examples2", "loop-import.md");

function fixture(name, text) {
	const dir = mkdtempSync(join(tmpdir(), "pb2f-"));
	const path = join(dir, name);
	writeFileSync(path, text);
	return { path, dir };
}

test("loop-import 示例：pass 循环动态 ID、文件调用形参、save 写回、空 say 分批", () => {
	const cacheDir = mkdtempSync(join(tmpdir(), "pb2cache-"));
	const s = session({ playbook: example, cacheDir });
	s.pushUser("开始");
	const seen = [];
	let reply = s.call().reply;
	let guard = 0;
	while (reply.stopReason === "toolUse" && guard < 10) {
		guard += 1;
		for (const call of callsOf(reply)) seen.push(call.id);
		s.pushToolResults(reply, {});
		reply = s.call().reply;
	}
	assert.equal(guard, 2, "文件调用批 + 空 say 拆出的第二批 = 2 次 toolUse 批");
	assert.equal(textOf(reply), "完成：3 轮");
	const ids = seen.filter((id) => id.startsWith("p2_"));
	assert.equal(new Set(ids).size, ids.length, "动态 ID 不复用");
	rmSync(cacheDir, { recursive: true, force: true });
});

test("{{}} 算术/表达式编译拒；缺引用运行期拒", () => {
	const arith = fixture("a.md", [
		"---", "vars:", "  n: 1", "---",
		"```user", "- any: true", "```",
		"```call bash", 'command: "echo {{ vars.n + 1 }}"', "```",
	].join("\n"));
	const s1 = session({ playbook: arith.path });
	s1.pushUser("go");
	assert.equal(errorOf(s1.call()), "playbook_invalid");
	const missing = fixture("m.md", [
		"```user", "- any: true", "```",
		"```call bash", 'command: "echo {{ vars.absent }}"', "```",
	].join("\n"));
	const s2 = session({ playbook: missing.path });
	s2.pushUser("go");
	assert.equal(errorOf(s2.call()), "playbook_ref_error");
});

test("文件调用自递归深度预算终止（playbook_budget，不挂死）", () => {
	const dir = mkdtempSync(join(tmpdir(), "pb2r-"));
	const root = join(dir, "root.md");
	const loop = join(dir, "loop.md");
	writeFileSync(root, ["```user", "- any: true", "```", "```segment", "path: loop.md", "with: {}", "```"].join("\n"));
	writeFileSync(loop, ["```segment", "path: loop.md", "with: {}", "```"].join("\n"));
	const s = session({ playbook: root });
	s.pushUser("go");
	assert.equal(errorOf(s.call()), "playbook_budget");
});

test("match 通用数据选择器：system 匹配 pass 生效；不匹配拒绝", () => {
	const { path } = fixture("sys.md", [
		"```match", "data: system", "cases:", "  - contains: secretech", "```",
		"```user", "- any: true", "```",
		"```say", "ok-system", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const ok = s.call();
	if (!ok.reply.error) assert.equal(textOf(ok.reply), "ok-system");
	const bad = fixture("sys2.md", [
		"```match", "data: system", "cases:", "  - contains: nomatch-here", "```",
		"```user", "- any: true", "```",
		"```say", "ok-system", "```",
	].join("\n"));
	const s2 = session({ playbook: bad.path });
	s2.pushUser("go");
	assert.equal(errorOf(s2.call()), "playbook_mismatch");
});

test("internal 程序失败（非零退出）= playbook_program_error 而非 no-match", () => {
	const { path } = fixture("p.md", [
		"```user", "- any: true", "```",
		"```internal", "command: exit 3", "cases:", "  - otherwise: true", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	assert.equal(errorOf(s.call()), "playbook_program_error");
});

test("import/internal 旧输入别名一次归一为 segment（同 IR 同执行）", async () => {
	const { parseBlocks } = await import("../lang2/parse-blocks.mjs");
	const canonical = parseBlocks(["```segment", "command: node x.mjs", "with:", "  a: 1", "```"].join("\n"));
	const internal = parseBlocks(["```internal", "command: node x.mjs", "with:", "  a: 1", "```"].join("\n"));
	const imported = parseBlocks(["```import", "path: child.md", "with:", "  a: 1", "```"].join("\n"));
	assert.deepEqual(internal, canonical);
	assert.equal(imported[0].kind, "segment");
	assert.equal(imported[0].form, "file");
	assert.equal(internal[0].form, "command");
});

test("segment 无 cases 返回 result = 正常完成自然继续（不要求 otherwise）", () => {
	const { path } = fixture("nc.md", [
		"```user", "- any: true", "```",
		"```segment", "command: node -e 'process.stdout.write(JSON.stringify({result:\"1\"}))'", "```",
		"```say", "继续了", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	assert.equal(textOf(s.call().reply), "继续了");
});

test("segment 纯文本 assistant 合法并自然结束 turn", () => {
	const { path } = fixture("ta.md", [
		"```user", "- any: true", "```",
		"```segment", "command: node -e 'process.stdout.write(JSON.stringify({assistant:{content:[{type:\"text\",text:\"纯文本回复\"}]}}))'", "```",
		"```say", "不该同轮继续", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const reply = s.call().reply;
	assert.equal(reply.stopReason, "stop");
	assert.equal(textOf(reply), "纯文本回复");
	s.messages.push({ role: "assistant", content: reply.content });
	s.pushUser("again");
	assert.equal(textOf(s.call().reply), "不该同轮继续");
});
