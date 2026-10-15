// Locked openai-completions.ts:123-152,261-273,331-338,669-680.
export function streamedReasoningDetails(signature) {
	let parsed;
	try { parsed = JSON.parse(signature); } catch { return []; }
	if (!Array.isArray(parsed) || !parsed.every((d) => ["reasoning.summary", "reasoning.encrypted", "reasoning.text"].includes(d?.type))) return [];
	return parsed.filter(isReasoningDetail);
}

function isReasoningDetail(d) {
	if (!d || typeof d !== "object" || Array.isArray(d)) return false;
	if (!(d.id === undefined || d.id === null || typeof d.id === "string")) return false;
	if (!(d.format === undefined || typeof d.format === "string")) return false;
	if (!(d.index === undefined || typeof d.index === "number")) return false;
	if (d.type === "reasoning.summary") return typeof d.summary === "string";
	if (d.type === "reasoning.encrypted") return typeof d.data === "string";
	return d.type === "reasoning.text" && typeof d.text === "string"
		&& (d.signature === undefined || d.signature === null || typeof d.signature === "string");
}

export function appendReasoningDetail(details, detail) {
	const last = details.at(-1);
	if ((detail.type === "reasoning.text" || detail.type === "reasoning.summary") && last?.type === detail.type) {
		const field = detail.type === "reasoning.text" ? "text" : "summary";
		last[field] += detail[field];
		if (field === "text") last.signature ||= detail.signature;
		last.id ??= detail.id;
		last.format ||= detail.format;
		last.index ??= detail.index;
	} else details.push(structuredClone(detail));
}
