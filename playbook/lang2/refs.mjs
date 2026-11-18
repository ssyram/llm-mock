// next-language {{}} 引用：只存取、无算术。整值引用保留结构化类型；混合文本仅
// 字符串替换；名字缺失运行期硬错。静态形态检查拒绝任何表达式。
import { PlaybookError } from "../parse-yaml.mjs";

export const REF_PATTERN = /\{\{\s*(params|vars)\.([A-Za-z0-9_]+)\s*\}\}/g;
const WHOLE_REF = /^\{\{\s*(params|vars)\.([A-Za-z0-9_]+)\s*\}\}$/;

export function refParts(text) {
	const found = [];
	for (const match of String(text).matchAll(REF_PATTERN)) found.push({ scope: match[1], name: match[2], raw: match[0] });
	return found;
}

function frameValue(frame, scope, name, context) {
	const table = scope === "params" ? frame.params : frame.vars;
	if (!Object.prototype.hasOwnProperty.call(table, name)) {
		throw new PlaybookError(`引用缺失: {{ ${scope}.${name} }} 不在当前帧（${context}）`, 0, context);
	}
	return table[name];
}

export function resolveRefs(value, frame, context = "block") {
	if (typeof value === "string") {
		const whole = WHOLE_REF.exec(value);
		if (whole) return frameValue(frame, whole[1], whole[2], context);
		if (!value.includes("{{")) return value;
		return value.replace(REF_PATTERN, (raw, scope, name) => String(frameValue(frame, scope, name, context)));
	}
	if (Array.isArray(value)) return value.map((item) => resolveRefs(item, frame, context));
	if (value !== null && typeof value === "object") {
		const out = {};
		for (const [key, item] of Object.entries(value)) out[key] = resolveRefs(item, frame, context);
		return out;
	}
	return value;
}

// 静态形态检查：字符串里出现的每个 {{...}} 必须恰为合法单名引用；含运算/
// 管道/函数调用即编译拒。名字是否存在属运行期帧判定（playbook_ref_error），
// 编译期不查（import with 值在调用者帧求值，本文件静态不可知）。
export function walkRefForm(value, unit, context) {
	if (typeof value === "string") {
		let rest = value;
		const parts = refParts(value);
		for (const part of parts) rest = rest.replace(part.raw, "");
		if (rest.includes("{{") || rest.includes("}}")) {
			throw new PlaybookError(`引用形态非法（只允许 {{ params.x }}/{{ vars.x }}，无算术/表达式）: ${value}（${context}）`, 0, context);
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) walkRefForm(item, unit, context);
		return;
	}
	if (value !== null && typeof value === "object") {
		for (const item of Object.values(value)) walkRefForm(item, unit, context);
	}
}

// safeRefs：resolveRefs 的错误包装（playbook_ref_error 硬停对象），供 advance 与
// 外接步骤共用。
export function safeRefs(value, frame, context) {
	try {
		return { value: resolveRefs(value, frame, context) };
	} catch (error) {
		return { error: { status: 422, code: "playbook_ref_error", message: `${context}: ${error.message}` } };
	}
}
