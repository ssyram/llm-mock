#!/usr/bin/env node
// CCA SCC 终页 judger（judge 契约：stdin=框架 envelope，stdout 恰好 pass/fail，
// exit 0）。被判断的消息文本若是 result_ref 封套（或最后一行 JSON），先用
// cca-result-ref 适配器解引用完整对象再判断：members 非空且 next_after 为
// null，且 page_start+members.length===total（真正的末页）。不带 result_ref
// 的完整对象同样可判（现网样本形态）。解引用失败（缺 path/坏文件/坏 JSON/
// sha256 或 bytes 不符）与形状破坏是【硬错误】：非零退出，由框架转
// playbook_judge_error 立即停止，绝不输出 fail（不 no-match）、不降级摘要。
import { dereferenceToolText } from "../programs/cca-result-ref.mjs";

const die = (message) => {
	process.stderr.write(`cca-members-final: ${message}\n`);
	process.exit(3);
};
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
	let message;
	try {
		message = JSON.parse(input).message;
	} catch (error) {
		die(`cannot parse judge envelope: ${error.message}`);
	}
	const text = typeof message?.content === "string" ? message.content : (message?.content ?? []).map((block) => block?.text ?? "").join("\n");
	let page;
	try {
		page = dereferenceToolText(text, { cwd: process.cwd() });
	} catch (error) {
		die(error.message);
	}
	if (!Array.isArray(page?.members)) die(`dereferenced object has no members array: ${JSON.stringify(String(text).slice(0, 120))}`);
	for (const field of ["total", "page_start"]) {
		if (!Number.isInteger(page[field])) die(`dereferenced object field ${field} is not an integer`);
	}
	if (page.members.length === 0 || page.members.some((row) => typeof row?.id !== "string" || row.id === "")) die("members rows must be non-empty with string ids");
	const final = page.next_after === null && page.page_start + page.members.length === page.total;
	process.stdout.write(page.next_after === null && final ? "pass" : "fail");
});
