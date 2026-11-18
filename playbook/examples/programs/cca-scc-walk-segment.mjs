#!/usr/bin/env node
// CCA SCC 成员分页遍历 segment（外接处理者，非 Markdown）：每次模型请求被
// 调用时读 transcript 前缀，从自己已发出的 seg_* toolResult 确定性重建游程
// ——每一页都通过【真实 bash 工具调用】向合成取页器取 result_ref 封套，本
// 程序用 cca-result-ref 适配器解引用完整对象并逐页校验分页契约：
//   page_start 连续、page_size===members.length、total 恒定、成员不重复、
//   next_after===末成员 id（还有更多页时）、末页 next_after===null 且
//   page_start+members.length===total。
// 任何解引用失败/契约违反 ⇒ 非零退出（播放器转 playbook_program_error 硬停，
// 绝不 no-match 或摘要降级）。全页走完后发最后一次真实工具调用把成员清单写
// 进 cca-walk-members.txt（真实文件副作用），再返回内部值 {"result":"遍历完成"}。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dereferenceToolText } from "./cca-result-ref.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const flagAt = process.argv.indexOf("--fixture-dir");
const fixtureDir = flagAt === -1 ? resolve(here, "..", "cca") : resolve(process.argv[flagAt + 1]);
const fixturePageScript = join(here, "cca-fixture-page.mjs");

const die = (message) => {
	process.stderr.write(`cca-scc-walk-segment: ${message}\n`);
	process.exit(5);
};

const toolCallsOf = (message) => (message.content ?? []).filter((block) => block?.type === "toolCall" && String(block.id ?? "").startsWith("seg_"));
const textOf = (message) => (message.content ?? []).map((block) => block?.text ?? "").join("\n");

function replayWalk(messages) {
	const state = { total: null, pages: [], ids: [], summaryWritten: false, complete: false };
	const results = messages.filter((m) => m.role === "toolResult" && String(m.toolCallId ?? "").startsWith("seg_"));
	for (const result of results) {
		if (!state.complete) {
			const page = dereferenceToolText(textOf(result), { cwd: fixtureDir });
			validatePage(page, state);
			state.pages.push(page);
			state.ids.push(...page.members.map((row) => row.id));
			if (page.next_after === null) state.complete = true;
			continue;
		}
		if (state.summaryWritten) die(`unexpected extra segment tool result ${JSON.stringify(result.toolCallId)} after the walk finished`);
		// Pi 的 bash 工具对空输出回传占位符 "(no output)"（与 exit_code 适配器同一
		// 观测边界）；两种形态都表示 summary 写入无输出。
		if (textOf(result).trim() !== "" && textOf(result).trim() !== "(no output)") die(`summary write must produce no output, got ${JSON.stringify(textOf(result).slice(0, 120))}`);
		state.summaryWritten = true;
	}
	return state;
}

function validatePage(page, state) {
	if (typeof page !== "object" || page === null) die("page is not an object");
	const expectedStart = state.pages.reduce((acc, p) => acc + p.members.length, 0);
	if (!Number.isInteger(page.total) || page.total < 1) die(`page total must be a positive integer, got ${JSON.stringify(page.total)}`);
	if (state.total !== null && page.total !== state.total) die(`total changed across pages: first ${state.total}, now ${page.total}`);
	if (!Number.isInteger(page.page_start) || page.page_start !== expectedStart) die(`page_start ${JSON.stringify(page.page_start)} breaks the walk (expected ${expectedStart})`);
	if (!Array.isArray(page.members) || page.members.length === 0) die("page members must be a non-empty array");
	if (!Array.isArray(page.members.map((row) => row?.id)) || page.members.some((row) => typeof row?.id !== "string" || row.id === "")) die("every member row must carry a non-empty string id");
	if (page.page_size !== page.members.length) die(`page_size ${JSON.stringify(page.page_size)} !== members.length ${page.members.length}`);
	for (const row of page.members) {
		if (state.ids.includes(row.id)) die(`duplicate member id ${JSON.stringify(row.id)} across pages`);
	}
	const lastId = page.members[page.members.length - 1].id;
	if (page.next_after !== null && page.next_after !== lastId) die(`next_after ${JSON.stringify(page.next_after)} is not the last member id ${JSON.stringify(lastId)}`);
	if (page.next_after === null && expectedStart + page.members.length !== page.total) die(`final page ends at ${expectedStart + page.members.length} but total is ${page.total}`);
	state.total = page.total;
}

const quote = (value) => JSON.stringify(value);
const fetchPageMessage = (state) => {
	const ordinal = state.pages.length + 1;
	const cursor = state.pages.length === 0 ? [] : [state.pages[state.pages.length - 1].next_after];
	const command = [`node ${quote(fixturePageScript)} ${quote(fixtureDir)}`, ...cursor.map(quote)].join(" ");
	return { assistant: { stopReason: "toolUse", content: [
		{ type: "text", text: `取第 ${ordinal} 页（cursor=${cursor[0] ?? "首页"}）。` },
		{ type: "toolCall", id: `seg_page_${ordinal}`, name: "bash", arguments: { command } },
	] } };
};

const summaryMessage = (state) => ({ assistant: { stopReason: "toolUse", content: [
	{ type: "text", text: `全部 ${state.pages.length} 页走完，写入成员清单（共 ${state.ids.length} 人）。` },
	{ type: "toolCall", id: "seg_summary", name: "bash", arguments: { command: `printf '%s\\n' ${state.ids.join(" ")} > cca-walk-members.txt` } },
] } });

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
	const messages = (JSON.parse(input).context ?? {}).messages ?? [];
	const state = replayWalk(messages);
	if (!state.complete) process.stdout.write(JSON.stringify(fetchPageMessage(state)));
	else if (!state.summaryWritten) process.stdout.write(JSON.stringify(summaryMessage(state)));
	else process.stdout.write(JSON.stringify({ result: "遍历完成" }));
});
