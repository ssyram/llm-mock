// Frozen §4 strict schema domain, without importing the implementation under test.
const UNSUPPORTED = new Set(["$ref", "$defs", "definitions", "allOf", "oneOf", "patternProperties", "dependentSchemas", "dependencies", "unevaluatedProperties", "propertyNames", "contains", "prefixItems", "not", "if", "then", "else"]);

export function resolveJsonSchemaStrictSampling(tool, supported) {
	const config = tool.constrainedSampling;
	if (config?.type !== "json_schema") return undefined;
	if (!supported) {
		if (config.strict === "require") throw new Error("strict JSON schema required but unsupported");
		return undefined;
	}
	try { strictSchema(tool.parameters); return true; }
	catch (error) { if (config.strict === "require") throw error; return undefined; }
}

export function getJsonSchemaToolParameters(tool, strict) {
	return strict ? strictSchema(tool.parameters) : structuredClone(tool.parameters);
}

export function strictSchema(schema) {
	if (schema?.type !== "object") throw new Error("strict schema root must be object");
	return convert(schema);
}

function convert(schema) {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("schema must be object");
	for (const key of Object.keys(schema)) if (UNSUPPORTED.has(key)) throw new Error(`unsupported schema key ${key}`);
	const out = structuredClone(schema);
	if ("properties" in schema && schema.type !== "object") throw new Error("properties require object type");
	if ("anyOf" in schema) {
		if (!Array.isArray(schema.anyOf) || !schema.anyOf.length || schema.anyOf.some((part) => ["object", "array"].includes(part?.type))) throw new Error("unsupported anyOf");
		out.anyOf = schema.anyOf.map(convert);
	}
	if ("items" in schema) {
		if (Array.isArray(schema.items)) throw new Error("tuple items unsupported");
		out.items = convert(schema.items);
	}
	if (schema.type === "object") {
		const properties = schema.properties ?? {};
		if (typeof properties !== "object" || properties === null || Array.isArray(properties)) throw new Error("invalid properties");
		const required = schema.required ?? [];
		if (!Array.isArray(required) || required.some((name) => typeof name !== "string" || !(name in properties))) throw new Error("invalid required");
		if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) throw new Error("invalid additionalProperties");
		out.properties = {};
		for (const [name, property] of Object.entries(properties)) {
			const next = convert(property);
			const nullable = property.type === "null" || (Array.isArray(property.type) && property.type.includes("null")) || property.anyOf?.some((part) => part.type === "null");
			out.properties[name] = required.includes(name) || nullable ? next : { anyOf: [next, { type: "null" }] };
		}
		out.required = Object.keys(properties);
		out.additionalProperties = false;
	}
	return out;
}
