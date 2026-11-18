// aggregator 与 segment 块体解析：两者共用同一底层形态 —— YAML mapping
// {command: <非空命令字符串>, cases: <case 列表>}。command 由播放器（本
// mock 脚本进程）以 shell 执行（见 program-exec.mjs），产生一个结果字符串，
// 再交给同一套 case 匹配（parse-cases.mjs）。键精确锁定：缺一不可、未知
// 键拒绝，命令为空串拒绝。
import { parseCaseList } from "./parse-cases.mjs";
import { parseMapping, PlaybookError } from "./parse-yaml.mjs";

export function parseProgramBlock(source, kind, where) {
	const context = `${kind} ${where}`;
	const { mapping, sawAny } = parseMapping(source, context);
	if (!sawAny) throw new PlaybookError(`${kind} block requires command: <command> and cases: [ … ]`, 0, context);
	const unknown = Object.keys(mapping).filter((key) => !["command", "cases"].includes(key));
	if (unknown.length > 0) throw new PlaybookError(`${kind} block has unknown key(s) ${unknown.join(", ")}; allowed: command, cases`, 0, context);
	if (typeof mapping.command !== "string" || mapping.command.trim() === "") {
		throw new PlaybookError(`${kind} command must be a non-empty command string, got ${JSON.stringify(mapping.command)}`, 0, context);
	}
	if (!Array.isArray(mapping.cases)) {
		throw new PlaybookError(`${kind} cases must be a YAML case list (one \`- matcher: value\` item per case), got ${JSON.stringify(mapping.cases)}`, 0, context);
	}
	return { command: mapping.command, cases: parseCaseList(mapping.cases, kind, where) };
}
