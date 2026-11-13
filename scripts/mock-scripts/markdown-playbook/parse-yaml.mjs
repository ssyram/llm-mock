// Markdown playbook 的 YAML 入口：直接使用成熟解析器 yaml@2.9.1
// （模块局部依赖，package.json 精确锁定；安装方法见 README「依赖」一节），
// 完整支持块标量（command: | / >）、嵌套 mapping/list、引号与转义。
// 本层只做两件事：把解析错误包装成带上下文的 PlaybookError，以及保证
// 块体是（可能为空的）mapping。重复键由 yaml 解析器按 DUPLICATE_KEY 拒绝。
import YAML from "yaml";

export class PlaybookError extends Error {
	constructor(message, line, context) {
		super(`${context ?? "playbook"}:${line}: ${message}`);
		this.name = "PlaybookError";
	}
}

export function parseYamlValue(source, context) {
	try {
		return YAML.parse(source);
	} catch (error) {
		const at = Array.isArray(error.linePos) ? ` at line ${error.linePos[0].line}, column ${error.linePos[0].col}` : "";
		throw new PlaybookError(`invalid YAML${at}: ${firstLine(error.message)}`, 0, context);
	}
}

export function parseMapping(source, context) {
	const value = parseYamlValue(source, context);
	if (value === undefined || value === null) return { mapping: {}, sawAny: false };
	if (typeof value !== "object" || Array.isArray(value)) {
		throw new PlaybookError("block body must be a YAML mapping (`key: value` lines), not a scalar or list", 0, context);
	}
	return { mapping: value, sawAny: Object.keys(value).length > 0 };
}

function firstLine(text) {
	return String(text).split("\n")[0];
}

export function snippet(text, cap = 120) {
	const flat = String(text).replace(/\s+/g, " ");
	return flat.length > cap ? `${flat.slice(0, cap)}…` : flat;
}
