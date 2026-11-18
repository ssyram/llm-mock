import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const save = (dir, name, data) => writeFileSync(join(dir, name), data);

export function testCcaWalkPi({ fresh, invoke, captures, evidence }) {
	// 场景 E：CCA result_ref 分页游程 —— 每一页都是 segment 发出的真实 bash
	// 工具调用（合成取页器返回 result_ref 封套），segment 解引用完整对象、
	// 校验分页契约，用真实 next_after 游标走完全部页，最后写成员清单文件。
	{
		const { project, sessions } = fresh("cca-walk");
		const turn = invoke("mdpccawalk", project, sessions, "请开始 SCC 成员遍历");
		save(evidence, "cca-walk-turn.stdout", turn.stdout);
		save(evidence, "cca-walk-turn.stderr", turn.stderr);
		assert.equal(turn.status, 0, `cca walk failed: ${turn.stdout}\n${turn.stderr}`);
		assert.ok(turn.stdout.includes("SCC 成员遍历完成：全部页面用真实游标走完，清单已写入 cca-walk-members.txt。"), `walk final say missing: ${turn.stdout}`);
		assert.equal(readFileSync(join(project, "cca-walk-members.txt"), "utf8"), "m01\nm02\nm03\nm04\nm05\nm06\nm07\n", "real side effect: the summary toolCall wrote the walked member list");
		const walkCaptures = captures().filter((c) => c.keyId === "mdpccawalk");
		assert.ok(walkCaptures.length >= 5, `expected >=5 model requests (3 pages + summary + final), got ${walkCaptures.length}`);
		const walkCommands = walkCaptures.flatMap((c) => c.request.context.messages).filter((m) => m.role === "assistant").flatMap((m) => m.content.filter((b) => b.type === "toolCall" && String(b.id ?? "").startsWith("seg_"))).map((b) => b.arguments.command);
		const pageCommands = [...new Set(walkCommands.filter((command) => command.includes("cca-fixture-page.mjs")))];
		assert.equal(pageCommands.length, 3, "three DISTINCT pages fetched via real bash tool calls (transcripts replay earlier rounds)");
		assert.match(pageCommands[1], /"m03"$/, "page 2 cursor is page 1's last member id");
		assert.match(pageCommands[2], /"m06"$/, "page 3 cursor is page 2's last member id");
		const envelopes = walkCaptures.flatMap((c) => c.request.context.messages).filter((m) => m.role === "toolResult" && String(m.toolCallId ?? "").startsWith("seg_")).map((m) => (m.content ?? []).map((b) => b?.text ?? "").join(""));
		assert.ok(envelopes.slice(0, 3).every((text) => text.includes("result_ref")), "the tool results that came back were result_ref envelopes (dereferenced by the segment, not by the host)");
		save(evidence, "captures-mdpccawalk.json", JSON.stringify(walkCaptures, null, 2));
	}

}
