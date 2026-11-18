// next-language 块词法：Markdown 正文 → 有序原始块。只认三种管理单元的组成
// 块（say/call/expect/toolResult/user/segment/aggregation）与数据行为 match；
// $label 首行被取走为块属性。旧输入别名 internal/import/aggregator 在此一次
// 归一；goto/end/response 围栏/独立 label 块/锚点/match-system 等直接拒绝，
// 不保留任何执行分支。
import { parseCaseList, parseCases } from "../parse-cases.mjs";
import { parseMapping, parseYamlValue, PlaybookError } from "../parse-yaml.mjs";

// translation→atomic 的唯一浅写法：case 列表首项恰为 `- translate: <command>`
//（输出单 JSON 值），其余项是同一套原子 cases；translate 与 judge/judger 不同：
// translate 返回待匹配数据，judge 返回 pass|fail。
function shallowCases(value, kind, where) {
	if (Array.isArray(value) && value.length && typeof value[0] === "object" && value[0] !== null &&
		Object.keys(value[0]).length === 1 && typeof value[0].translate === "string" && value[0].translate.trim()) {
		if (value.length < 2) throw new PlaybookError(`${kind} ${where}: translate 之后需要至少一个原子 case`, 0, where);
		return { translate: value[0].translate.trim(), cases: parseCaseList(value.slice(1), kind, where) };
	}
	return { translate: null, cases: Array.isArray(value) ? parseCaseList(value, kind, where) : null };
}

function casesOf(body, kind, where) {
	const value = parseYamlValue(body, `${kind} ${where}`);
	if (!Array.isArray(value)) {
		if (kind === "user") return { translate: null, cases: parseCases(body, kind, where) };
		return { translate: null, cases: parseCaseList(value, kind, where) };
	}
	return shallowCases(value, kind, where);
}

const FENCE = /^(?:```|~~~)([^\n]*)$/;
const SAY = new Set(["say", "assistant"]);
const LABEL_LINE = /^\$label:\s*([A-Za-z0-9_-]+)\s*$/;
const PROGRAM_KEYS = ["command", "with", "save", "cases", "volatile", "path"];

function bodyOf(text, where) {
	const lines = text.split("\n");
	const first = lines[0]?.trim() ?? "";
	const label = LABEL_LINE.exec(first);
	const body = label ? lines.slice(1).join("\n") : text;
	return { label: label ? label[1] : null, body };
}

function mappingBody(body, where) {
	const { mapping } = parseMapping(body, where);
	return mapping;
}

function programBlock(name, text, index) {
	const where = `${name} block #${index}`;
	const { label, body } = bodyOf(text, where);
	const mapping = mappingBody(body, where);
	for (const key of Object.keys(mapping)) {
		if (!PROGRAM_KEYS.includes(key)) {
			throw new PlaybookError(`${where}: segment 只允许 ${PROGRAM_KEYS.join("/")}，出现 ${key}`, 0, where);
		}
	}
	const hasCommand = mapping.command !== undefined;
	const hasPath = mapping.path !== undefined;
	if (hasCommand === hasPath) {
		throw new PlaybookError(`${where}: segment 需要 command（命令调用）或 path（文件调用）二者之一`, 0, where);
	}
	if (hasPath) {
		if (typeof mapping.path !== "string" || !mapping.path.trim()) throw new PlaybookError(`${where}: path 必须是非空字符串`, 0, where);
		if (["save", "cases", "volatile"].some((key) => mapping[key] !== undefined)) {
			throw new PlaybookError(`${where}: 文件调用形式只允许 path/with`, 0, where);
		}
		return { kind: "segment", label, form: "file", path: mapping.path.trim(), with: mapping.with ?? {}, line: index };
	}
	if (typeof mapping.command !== "string" || !mapping.command.trim()) {
		throw new PlaybookError(`${where}: command 必须是非空字符串`, 0, where);
	}
	return segmentCommand(label, mapping, where, index);
}

function segmentCommand(label, mapping, where, index) {
	if (mapping.with !== undefined && (typeof mapping.with !== "object" || mapping.with === null || Array.isArray(mapping.with))) {
		throw new PlaybookError(`${where}: with 必须是 mapping`, 0, where);
	}
	if (mapping.save !== undefined) {
		if (typeof mapping.save !== "object" || mapping.save === null || Array.isArray(mapping.save)) {
			throw new PlaybookError(`${where}: save 必须是 mapping{局部vars名: values字段名}`, 0, where);
		}
		for (const [v, field] of Object.entries(mapping.save)) {
			if (typeof field !== "string") throw new PlaybookError(`${where}: save.${v} 必须是 values 字段名`, 0, where);
		}
	}
	const parsed = mapping.cases === undefined ? { translate: null, cases: null } : shallowCases(mapping.cases, "segment", `block #${index}`);
	return { kind: "segment", label, form: "command", command: mapping.command.trim(), with: mapping.with ?? {}, save: mapping.save ?? {}, cases: parsed.cases, translate: parsed.translate, volatile: mapping.volatile === true, line: index };
}

export function parseBlocks(body) {
	const blocks = [];
	const lines = body.split(/\r?\n/);
	let i = 0;
	let index = 0;
	while (i < lines.length) {
		const line = lines[i];
		const fence = FENCE.exec(line.trim());
		if (!fence) {
			if (/^<a id=/.test(line.trim())) throw new PlaybookError(`HTML 锚点不再是作者语法（用块内首行 $label: name）`, 0, "parse-blocks");
			i += 1;
			continue;
		}
		const info = fence[1].trim();
		const head = info.split(/\s+/);
		const name = head[0];
		const arg = head.slice(1).join(" ");
		let close = -1;
		for (let j = i + 1; j < lines.length; j += 1) {
			if (/^(?:```|~~~)\s*$/.test(lines[j])) { close = j; break; }
		}
		if (close === -1) throw new PlaybookError(`unclosed fence \`\`\`${info} (opened at line ${i + 1})`, 0, "parse-blocks");
		const text = lines.slice(i + 1, close).join("\n");
		blocks.push(makeBlock(name, arg, text, i + 1, index));
		index += 1;
		i = close + 1;
	}
	return blocks;
}

function rejectOld(name, index, hint) {
	throw new PlaybookError(`unknown fence \`\`\`${name}（${hint}）(block #${index})`, 0, "parse-blocks");
}

function makeBlock(name, arg, text, line, index) {
	const where = `\`\`\`${name} block #${index} (line ${line})`;
	if (SAY.has(name)) {
		const { label, body } = bodyOf(text, where);
		return { kind: "say", label, text: body, line, index };
	}
	if (name === "user") {
		const { label, body } = bodyOf(text, where);
		if (body.trim() === "") return { kind: "user", label, cases: [], translate: null, line, index };
		const parsed = casesOf(body, "user", `block #${index}`);
		return { kind: "user", label, cases: parsed.cases, translate: parsed.translate, line, index };
	}
	if (name === "call") {
		const { label, body } = bodyOf(text, where);
		if (!arg) {
			const mapping = mappingBody(text, where);
			if (typeof mapping.tool !== "string" || !mapping.tool.trim()) throw new PlaybookError(`${where}: call 需要工具名（\`\`\`call bash 或 tool: bash）`, 0, where);
			if (mapping.args !== undefined && (typeof mapping.args !== "object" || mapping.args === null || Array.isArray(mapping.args))) {
				throw new PlaybookError(`${where}: args 必须是 mapping`, 0, where);
			}
			const unknown = Object.keys(mapping).filter((key) => key !== "tool" && key !== "args");
			if (unknown.length) throw new PlaybookError(`${where}: call 长形式只允许 tool/args，出现 ${unknown.join(", ")}`, 0, where);
			return { kind: "call", label, tool: mapping.tool.trim(), args: mapping.args ?? {}, line, index };
		}
		return { kind: "call", label, tool: arg, args: mappingBody(body, where), line, index };
	}
	if (name === "expect") {
		const mapping = mappingBody(text, where);
		for (const key of Object.keys(mapping)) {
			if (!["exit_code", "contains"].includes(key)) throw new PlaybookError(`${where}: expect 只允许 exit_code/contains`, 0, where);
		}
		if (mapping.exit_code !== undefined && !Number.isInteger(mapping.exit_code)) {
			throw new PlaybookError(`${where}: exit_code 必须是非负整数`, 0, where);
		}
		return { kind: "expect", exitCode: mapping.exit_code, contains: mapping.contains, line, index };
	}
	if (name === "toolResult") {
		const parsed = casesOf(text, "toolResult", `block #${index}`);
		return { kind: "toolResult", cases: parsed.cases, translate: parsed.translate, line, index };
	}
	if (name === "aggregation" || name === "aggregator") return { ...aggregationBlock(text, index), line, index };
	if (name === "segment" || name === "internal" || name === "import") return { ...programBlock("segment", text, index), line, index };
	if (name === "match") return { ...matchBlock(text, index), line, index };
	if (name === "label") rejectOld(name, index, "独立 label 块已删除：label 写入管理单元块内首行 $label: name");
	if (name === "goto") rejectOld(name, index, "goto 已删除：跳转用 case 的 pass: {to: label}");
	if (name === "end") rejectOld(name, index, "end 已删除：文件 EOF 即函数返回");
	if (name === "response" || name === "/response") rejectOld(name, index, "response 围栏已删除：RV 由 say/相邻 call 自然分组");
	if (name === "reply") rejectOld(name, index, "reply 已并入 say");
	if (name === "matchSystem" || name === "matchCompaction") rejectOld(name, index, "独立 match-* 节点已删除：用 match + data: system|compaction");
	throw new PlaybookError(`unknown fence \`\`\`${name}（管理单元只有 say/call/user/segment 与数据行为 match）`, 0, "parse-blocks");
}

function aggregationBlock(text, index) {
	const where = `aggregation block #${index}`;
	const mapping = mappingBody(text, where);
	for (const key of Object.keys(mapping)) {
		if (!PROGRAM_KEYS.includes(key) || key === "path") {
			throw new PlaybookError(`${where}: aggregation 只允许 command/with/save/cases/volatile，出现 ${key}`, 0, where);
		}
	}
	const command = segmentCommand(null, mapping, where, index);
	const parsed = mapping.cases === undefined ? { translate: null, cases: null } : shallowCases(mapping.cases, "aggregation", `block #${index}`);
	return { kind: "aggregation", command: command.command, with: command.with, save: command.save, cases: parsed.cases, translate: parsed.translate, volatile: command.volatile, line: index };
}

function matchBlock(text, index) {
	const where = `match block #${index}`;
	const mapping = mappingBody(text, where);
	const unknown = Object.keys(mapping).filter((key) => key !== "data" && key !== "cases");
	if (unknown.length) throw new PlaybookError(`${where}: match 只允许 data/cases，出现 ${unknown.join(", ")}`, 0, where);
	if (!["system", "compaction"].includes(mapping.data)) {
		throw new PlaybookError(`${where}: data 必须是 system 或 compaction（通用 match 的内置数据源）`, 0, where);
	}
	if (mapping.cases === undefined) throw new PlaybookError(`${where}: match 需要 cases`, 0, where);
	const parsed = shallowCases(mapping.cases, "match", `block #${index}`);
	return { kind: "match", data: mapping.data, cases: parsed.cases, translate: parsed.translate, line: index };
}

export { parseYamlValue };
