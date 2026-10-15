// OCC §4 C7: Q selects one complete valid array, unlike R's per-item filtering.
export function requestReasoningDetails(blocks, calls = []) {
	for (const block of blocks) {
		let value;
		try { value = JSON.parse(block.thinkingSignature); } catch { continue; }
		if (Array.isArray(value) && value.length && value.every(validDetail)) return value;
	}
	const legacy = [];
	for (const call of calls) {
		let value;
		try { value = JSON.parse(call.thoughtSignature); } catch { continue; }
		if (value?.type === "reasoning.encrypted" && typeof value.id === "string" && value.id
			&& typeof value.data === "string" && value.data) legacy.push(value);
	}
	return legacy.length ? legacy : undefined;
}

function validDetail(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	if (!(value.id == null || typeof value.id === "string")) return false;
	if (!(value.format === undefined || typeof value.format === "string")) return false;
	if (!(value.index === undefined || typeof value.index === "number")) return false;
	if (value.type === "reasoning.summary") return typeof value.summary === "string";
	if (value.type === "reasoning.encrypted") return typeof value.data === "string";
	return value.type === "reasoning.text" && typeof value.text === "string"
		&& (value.signature == null || typeof value.signature === "string");
}
