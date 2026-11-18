// next-language front matter：从 Markdown 文本分离 YAML front matter 并解析
// params/vars（字面量标量；params 只读、vars 可由 save 写回）。
import { parseYamlValue, PlaybookError } from "../parse-yaml.mjs";

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFront(text) {
	const match = FRONT.exec(text);
	if (!match) return { front: null, body: text };
	return { front: match[1], body: text.slice(match[0].length) };
}

function scalarTable(container, name) {
	if (container === undefined) return {};
	if (container === null || typeof container !== "object" || Array.isArray(container)) {
		throw new PlaybookError(`front matter ${name} 必须是 mapping`);
	}
	for (const [key, value] of Object.entries(container)) {
		if (value === null || typeof value === "object") {
			throw new PlaybookError(`front matter ${name}.${key}: 值必须是标量（得到 ${JSON.stringify(value)}）`);
		}
	}
	return container;
}

export function parseFront(text) {
	const { front, body } = splitFront(text);
	if (front === null) return { params: {}, vars: {}, body };
	let value;
	try {
		value = parseYamlValue(front, "front matter");
	} catch (error) {
		throw new PlaybookError(`front matter: ${error.message}`);
	}
	if (value === undefined || value === null) return { params: {}, vars: {}, body };
	if (typeof value !== "object" || Array.isArray(value)) {
		throw new PlaybookError("front matter 必须是 mapping（params:/vars:）");
	}
	const unknown = Object.keys(value).filter((k) => k !== "params" && k !== "vars");
	if (unknown.length) throw new PlaybookError(`front matter 只允许 params/vars，出现: ${unknown.join(", ")}`);
	const params = scalarTable(value.params, "params");
	const vars = scalarTable(value.vars, "vars");
	const overlap = Object.keys(params).filter((k) => k in vars);
	if (overlap.length) throw new PlaybookError(`front matter: params 与 vars 不得同名: ${overlap.join(", ")}`);
	return { params, vars, body };
}
