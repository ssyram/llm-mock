// Frozen specs: remove unpaired UTF-16 surrogates, preserve valid pairs.
export function sanitize(text) {
	return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (part) => part.length === 2 ? part : "");
}
