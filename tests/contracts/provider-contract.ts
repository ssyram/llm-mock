import { evaluate } from "./behavior.ts";
import type { Behavior, Direction, Environment, Model, Options } from "./behavior.ts";
import { projectRequestOptions, optionFields } from "./request-options.ts";
import type { OptionDefinition } from "./request-options.ts";
import { projectReply } from "../reply-projection.mjs";
import { requiresGoogleToolId } from "../canonical-google-reply.mjs";
import { shortHash } from "../canonical-short-hash.mjs";

type RequestProjection = (input: unknown, model: Model, options?: Options) => unknown;
type ReplyFill = (output: unknown, model: Model, source: unknown) => void;
export abstract class ProviderContract {
	readonly api: string;
	private readonly requestProjection: RequestProjection;
	private readonly replyFill: ReplyFill;
	readonly optionDefinitions: OptionDefinition;
	constructor(api: string, request: RequestProjection, fill: ReplyFill, options: OptionDefinition) {
		this.api = api; this.requestProjection = request; this.replyFill = fill; this.optionDefinitions = options;
	}
	options(model: Model, options: Options = {}): Record<string, unknown> {
		return projectRequestOptions(this.optionDefinitions, model, options);
	}
	definition(direction: Direction, model: Model, options?: Options): Behavior {
		if (model.api !== this.api) throw new Error(`contract/model API mismatch: ${this.api}/${model.api}`);
		if (direction !== "request" && direction !== "reply") throw new Error(`unsupported canonical direction: ${direction}`);
		return { kind: "transform", transform: { tag: "program", name: `${this.api}:${direction}`, apply: (input) =>
			direction === "request" ? this.requestProjection(input, model, options) : projectReply(this.api, input, model, this.replyFill) } };
	}
	request(input: unknown, model: Model, options?: Options): unknown {
		return evaluate(this.definition("request", model, options), input);
	}
	reply(input: unknown, model: Model): unknown {
		return evaluate(this.definition("reply", model), input);
	}
	behavior(direction: Direction, field: string, input: unknown, env: Environment): Behavior {
		if (direction === "request" && optionFields.some((name) => name === field)) {
			const declaration = this.optionDefinitions[field as typeof optionFields[number]];
			return typeof declaration === "function" ? declaration({ model: env.model, options: { ...env.options, [field]: input } }) : declaration;
		}
		if (field === "timestamp") return direction === "reply" ? { kind: "inject", generator: "clock" }
			: this.api === "pi-messages" ? { kind: "preserve" } : { kind: "transform", transform: { tag: "constant", value: 0 } };
		if (direction === "reply" && ["model", "api", "provider"].includes(field)) return { kind: "inject", generator: "constant", value: env.model[field] };
		if (direction === "request" && field === "model") return this.api === "google-vertex"
			? { kind: "transform", transform: { tag: "model-leaf" } } : { kind: "preserve" };
		if (direction === "reply" && field === "toolCall.id") {
			if (["google-generative-ai", "google-vertex"].includes(this.api)) {
				return requiresGoogleToolId({ id: env.sourceModel ?? env.model.id }) && typeof input === "string" && input && !env.previousIds?.includes(input)
					? { kind: "preserve" } : { kind: "inject", generator: "tool-id", name: env.toolName };
			}
			if (this.api.endsWith("responses")) return { kind: "transform", transform: { tag: "program", name: "responses-call-and-item-id", apply: (value) => {
				if (typeof value !== "string") throw new TypeError("tool ID must be a string");
				return value.includes("|") ? value : `${value}|fc_${shortHash(value)}`;
			} } };
			return { kind: "preserve" };
		}
		if (direction === "reply" && field === "stopReason" && (this.api === "pi-messages" ? ["pending", "deferred"] : ["openai-completions", "openai-responses", "azure-openai-responses", "openai-codex-responses"].includes(this.api) ? ["pending", "aborted", "deferred"] : []).includes(String(input))) {
			return { kind: "reject", reason: `${this.api} encoder rejects ${input}` };
		}
		throw new Error(`no scalar behavior declared: ${this.api}/${direction}/${field}; use the complete Message projection`);
	}
}
