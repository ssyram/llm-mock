// transcript 视图：统一 JSON 的 messages 之上的单元模型与结构位置。单元起点
// = user/assistant 消息（toolResult/system 不开新单元）；pointer 一律是
// message 结构下标数字（其前的消息视为已读），返回推进必须落在整单元边界。
// pointer 是阅读进度不是访问权限：完整历史在 transcript 文件中可见。
import { systemTextOf, compactionSubjectOf } from "./mount-reply.mjs";

export const isUnitStart = (messages, i) =>
	i === 0 || i === messages.length || messages[i]?.role === "user" || messages[i]?.role === "assistant";

export function validPointer(messages, pointer) {
	if (!Number.isInteger(pointer)) return "pointer 必须是结构位置（非负整数 message 下标）";
	if (pointer < 0 || pointer > messages.length) return `pointer ${pointer} 超出 transcript 范围 [0, ${messages.length}]`;
	if (!isUnitStart(messages, pointer)) return `pointer ${pointer} 不在整单元边界（必须是 user/assistant 消息起点或 EOF）`;
	return null;
}

export const entryPointer = {
	segmentFirst: (messages) => messages.length,
	segmentResume: (emitIndex) => emitIndex,
	aggregation: (emitIndex) => emitIndex + 1,
};

export function matchDataSubject(messages, input, dataKind) {
	if (dataKind === "system") return systemTextOf(input, messages);
	return compactionSubjectOf(input, messages);
}
