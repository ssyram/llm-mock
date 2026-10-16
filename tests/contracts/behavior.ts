export type Model = { api: string; id: string; provider: string; name?: string; reasoning?: boolean; maxTokens?: number; compat?: Record<string, unknown>; [key: string]: unknown };
export type Options = { maxTokens?: number; temperature?: number; sessionId?: string; cacheRetention?: string; toolChoice?: unknown; reasoning?: unknown; thinkingEnabled?: boolean; [key: string]: unknown };
export type Transform =
	| { tag: "constant"; value: unknown }
	| { tag: "truthy" }
	| { tag: "minimum-truthy"; minimum: number }
	| { tag: "nullish-default"; value: unknown }
	| { tag: "codepoint-prefix"; length: number }
	| { tag: "unicode-scalars" }
	| { tag: "model-leaf" }
	| { tag: "lookup"; values: Readonly<Record<string, unknown>> }
	| { tag: "program"; name: string; apply: (value: unknown) => unknown };
export type Behavior =
	| { kind: "preserve" }
	| { kind: "drop"; reason: string }
	| { kind: "transform"; transform: Transform }
	| { kind: "inject"; generator: "clock" | "tool-id"; name?: string }
	| { kind: "inject"; generator: "constant"; value: unknown }
	| { kind: "reject"; reason: string };
export const preserve: Behavior = { kind: "preserve" };
export const drop = (reason: string): Behavior => ({ kind: "drop", reason });
export const transform = (operation: Transform): Behavior => ({ kind: "transform", transform: operation });
export type Direction = "request" | "reply";
export type Environment = { model: Model; options?: Options; sourceModel?: string; toolName?: string; previousIds?: readonly string[] };

export function evaluate(behavior: Behavior, value: unknown): unknown {
	if (behavior.kind === "preserve") return structuredClone(value);
	if (behavior.kind === "drop") return undefined;
	if (behavior.kind === "reject") throw new Error(behavior.reason);
	if (behavior.kind === "inject") {
		if (behavior.generator === "constant") return structuredClone(behavior.value);
		throw new Error(`runtime injection ${behavior.generator} requires observation, not a fabricated expected value`);
	}
	const operation = behavior.transform;
	switch (operation.tag) {
		case "constant": return structuredClone(operation.value);
		case "truthy": return value ? value : undefined;
		case "minimum-truthy": return value ? Math.max(operation.minimum, Number(value)) : undefined;
		case "nullish-default": return value ?? operation.value;
		case "lookup": return typeof value === "string" ? operation.values[value] : undefined;
		case "program": return operation.apply(value);
		case "codepoint-prefix":
		case "model-leaf":
		case "unicode-scalars": {
			if (typeof value !== "string") throw new TypeError(`${operation.tag} requires a string`);
			if (operation.tag === "codepoint-prefix") return [...value].slice(0, operation.length).join("");
			if (operation.tag === "model-leaf") return value.split("/").at(-1)!.split(":")[0];
			return value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
		}
		default: {
			const exhaustive: never = operation;
			void exhaustive;
			throw new Error("unsupported transform tag");
		}
	}
}
