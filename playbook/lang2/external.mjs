// next-language 外接程序执行器（segment 命令形式 / aggregation 共用）。stdin
// 小 envelope {transcript, pointer, with}；stdout 单 JSON，键白名单
// result/values/pointer/assistant。角色差异在入口 pointer 与 assistant 权限，
// 不引入第二套输出 schema。坏输出一律 playbook_program_error 硬停。
import { runExternalProgram } from "../program-exec.mjs";
import { validPointer } from "./transcript-view.mjs";

const programError = (message) => ({ error: { status: 422, code: "playbook_program_error", message } });

export function buildEnvelope({ transcript, pointer, with: withValues }) {
	const envelope = { transcript, pointer };
	if (withValues && Object.keys(withValues).length) envelope.with = withValues;
	return envelope;
}

export function parseProgramOutput(stdout, role, messages, where) {
	let value;
	try {
		value = JSON.parse(stdout);
	} catch (error) {
		return programError(`program stdout 必须是单 JSON 对象: ${error}（${where}）`);
	}
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return programError(`program stdout 必须是 JSON 对象（${where}）`);
	}
	const keys = Object.keys(value);
	const allowed = ["result", "values", "pointer", "assistant"];
	for (const key of keys) {
		if (!allowed.includes(key)) return programError(`program stdout 出现协议外键 ${key}（${where}；协议无栈/PC 通道）`);
	}
	if (keys.includes("result") && keys.includes("assistant")) {
		return programError(`result 与 assistant 互斥（${where}）`);
	}
	if (keys.includes("assistant")) {
		const assistant = value.assistant;
		if (assistant === null || typeof assistant !== "object" || !Array.isArray(assistant.content) || assistant.content.length === 0) {
			return programError(`${role} assistant.content 必须是非空块数组（${where}）`);
		}
		const seen = new Set();
		for (const block of assistant.content) {
			if (block?.type === "text" && typeof block.text === "string") continue;
			if (block?.type !== "toolCall") return programError(`segment assistant 块必须是 {type:"text"}|{type:"toolCall"}（${where}）`);
			if (typeof block.id !== "string" || !block.id) return programError(`segment toolCall id 非空（${where}）`);
			if (block.id.startsWith("p2_")) return programError(`segment toolCall id 不得用保留前缀 p2_（${where}）`);
			if (seen.has(block.id)) return programError(`segment toolCall id 消息内唯一：${block.id}（${where}）`);
			seen.add(block.id);
		}
	}
	if (keys.includes("result") && typeof value.result === "undefined") {
		return programError(`result 已给出但值不能是 undefined（${where}）`);
	}
	if (keys.includes("values") && (typeof value.values !== "object" || value.values === null || Array.isArray(value.values))) {
		return programError(`values 必须是 mapping（${where}）`);
	}
	if (keys.includes("pointer")) {
		if (value.pointer === null || value.pointer === undefined) {
			return programError(`pointer 必须显式给出结构位置数字；省略键=保持原位，显式 null 不是结构位置（${where}）`);
		}
		const bad = validPointer(messages, value.pointer);
		if (bad) return programError(`${bad}（${where}）`);
	}
	return { output: value };
}

export function runExternal(block, { role, transcript, pointer, with: withValues }, { messages, cwd, timeoutMs }) {
	const where = `${role} @${block.openIndex}`;
	const envelope = buildEnvelope({ transcript, pointer, with: withValues });
	const outcome = runExternalProgram(block.command, envelope, { cwd, timeoutMs });
	if (outcome.error) return outcome;
	return parseProgramOutput(outcome.stdout, role, messages, where);
}

export function applySave(frame, save, output, where) {
	if (!output.values) return null;
	for (const [localName, fieldName] of Object.entries(save)) {
		if (!Object.prototype.hasOwnProperty.call(output.values, fieldName)) {
			return programError(`save 声明的 values 字段 ${fieldName} 缺失（${where}）`);
		}
		frame.vars[localName] = output.values[fieldName];
	}
	return null;
}
