// user/toolResult/aggregator/segment 块的 case 列表解析与校验。YAML list 每项
// 恰好一个 matcher 键（exact/contains/any/judge/judger/otherwise）+ 可选
// pass: {to: 锚点ID}；otherwise 必须是最后一项且至多一次。judger 是 judge
// 的别名（同一行为，命名与外接程序角色对齐）。user 块保留旧的单 mapping
// 便捷写法（exact/contains/any 三选一，不允许 pass）以兼容既有示例。
import { parseYamlValue, PlaybookError } from "./parse-yaml.mjs";

const MATCHERS = ["exact", "contains", "any", "judge", "judger", "otherwise"];
const COMMAND_MATCHERS = ["judge", "judger"];

export function parseCases(source, kind, where) {
	const context = `${kind} ${where}`;
	const value = parseYamlValue(source, context);
	if (value === null || value === undefined) throw new PlaybookError(`${kind} block must not be empty`, 0, context);
	if (!Array.isArray(value)) {
		if (kind === "toolResult") throw new PlaybookError("toolResult block must be a YAML case list (one `- matcher: value` item per case); plain assertions belong in expect", 0, context);
		if (kind !== "user") throw new PlaybookError(`${kind} cases must be a YAML case list (one \`- matcher: value\` item per case)`, 0, context);
		if (typeof value !== "object") throw new PlaybookError("user block must be a mapping (exact/contains/any) or a case list", 0, context);
		return [shorthandCase(value, context)];
	}
	return parseCaseList(value, kind, where);
}

// aggregator/segment 的 cases 键已在块级解析为 YAML 值，直接按列表校验。
export function parseCaseList(value, kind, where) {
	const context = `${kind} ${where}`;
	if (!Array.isArray(value)) throw new PlaybookError(`${kind} cases must be a YAML case list (one \`- matcher: value\` item per case), got ${JSON.stringify(value)}`, 0, context);
	if (value.length === 0) throw new PlaybookError(`${kind} case list must have at least one case`, 0, context);
	const cases = value.map((item, i) => caseItem(item, i + 1, context));
	const otherwiseCount = cases.filter((c) => c.matcher === "otherwise").length;
	if (otherwiseCount > 1) throw new PlaybookError("otherwise may appear at most once per case list", 0, context);
	if (otherwiseCount === 1 && cases[cases.length - 1].matcher !== "otherwise") throw new PlaybookError("otherwise must be the last case in the list", 0, context);
	return cases;
}

function shorthandCase(mapping, context) {
	const unknown = Object.keys(mapping).filter((key) => !["exact", "contains", "any"].includes(key));
	if (unknown.length > 0) throw new PlaybookError(`unknown user key(s) ${unknown.join(", ")}; the mapping shorthand supports exact/contains/any only (case lists add judge/judger/otherwise/pass)`, 0, context);
	const keys = Object.keys(mapping).filter((key) => ["exact", "contains", "any"].includes(key));
	if (keys.length !== 1) throw new PlaybookError(`user block must have exactly one of exact/contains/any, got ${keys.length}`, 0, context);
	return caseItem({ [keys[0]]: mapping[keys[0]] }, 1, context);
}

function caseItem(item, ordinal, context) {
	const at = `case ${ordinal}`;
	if (typeof item !== "object" || item === null || Array.isArray(item)) {
		throw new PlaybookError(`${at} must be a YAML mapping with exactly one matcher key (${MATCHERS.join("/")})`, 0, context);
	}
	const matchers = Object.keys(item).filter((key) => MATCHERS.includes(key));
	const unknown = Object.keys(item).filter((key) => !MATCHERS.includes(key) && key !== "pass");
	if (unknown.length > 0) throw new PlaybookError(`${at} has unknown key(s) ${unknown.join(", ")}; allowed: one matcher of ${MATCHERS.join("/")} plus optional pass`, 0, context);
	if (matchers.length !== 1) throw new PlaybookError(`${at} must have exactly one matcher key (${MATCHERS.join("/")}), got ${matchers.length}`, 0, context);
	const matcher = matchers[0];
	const value = item[matcher];
	if (matcher === "any" || matcher === "otherwise") {
		if (value !== true) throw new PlaybookError(`${at} ${matcher} must be true, got ${JSON.stringify(value)}`, 0, context);
	} else if (typeof value !== "string" || (COMMAND_MATCHERS.includes(matcher) && value.trim() === "")) {
		throw new PlaybookError(`${at} ${matcher} must be ${COMMAND_MATCHERS.includes(matcher) ? "a non-empty command string" : "a string"}, got ${JSON.stringify(value)}`, 0, context);
	}
	return { matcher, value, ...(item.pass === undefined ? {} : { pass: passTarget(item.pass, at, context) }) };
}

function passTarget(pass, at, context) {
	if (typeof pass !== "object" || pass === null || Array.isArray(pass)) throw new PlaybookError(`${at} pass must be a mapping {to: <anchor id>}`, 0, context);
	const unknown = Object.keys(pass).filter((key) => key !== "to");
	if (unknown.length > 0 || typeof pass.to !== "string") throw new PlaybookError(`${at} pass must be exactly {to: <anchor id>}`, 0, context);
	return { to: pass.to };
}
