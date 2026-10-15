import { shortHash } from "./canonical-short-hash.mjs";

export function normalizeResponseId(id, source, model) {
	const clean = (part) => part.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64).replace(/_+$/, "");
	const providers = model.api === "azure-openai-responses" ? ["openai", "openai-codex", "opencode", "azure"] : ["openai", "openai-codex", "opencode"];
	if (!providers.includes(model.provider)
		|| !id.includes("|")) return clean(id);
	const [call, original] = id.split("|");
	let item = source.provider !== model.provider || source.api !== model.api ? `fc_${shortHash(original)}` : clean(original);
	if (!item.startsWith("fc_")) item = `fc_${item}`;
	return `${clean(call)}|${item.slice(0, 64)}`;
}

export function responseTextSignature(signature, fallback, hashLong = false) {
	let id = signature;
	let phase;
	try {
		const value = JSON.parse(signature);
		if (value?.v === 1 && typeof value.id === "string") {
			id = value.id;
			if (["commentary", "final_answer"].includes(value.phase)) phase = value.phase;
		}
	} catch {}
	if (!id) id = fallback;
	if (hashLong && id.length > 64) id = `msg_${shortHash(id)}`;
	return { v: 1, id, ...(phase ? { phase } : {}) };
}
