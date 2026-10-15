import { canonicalOcc } from "./canonical-occ.mjs";
import { canonicalOres } from "./canonical-ores.mjs";
import { canonicalAm } from "./canonical-am.mjs";
import { canonicalGai } from "./canonical-gai.mjs";
import { canonicalAzure, canonicalCodex, canonicalVertex } from "./canonical-family-variants.mjs";
import { canonicalBedrock } from "./canonical-bedrock.mjs";
import { canonicalMistral } from "./canonical-mistral.mjs";
import { canonicalPiMessages } from "./canonical-pi-messages.mjs";

export const PROTOCOLS = [
	{ alias: "completions", api: "openai-completions", canonical: canonicalOcc },
	{ alias: "responses", api: "openai-responses", canonical: canonicalOres },
	{ alias: "azure", api: "azure-openai-responses", canonical: canonicalAzure },
	{ alias: "codex", api: "openai-codex-responses", canonical: canonicalCodex },
	{ alias: "anthropic", api: "anthropic-messages", canonical: canonicalAm },
	{ alias: "google", api: "google-generative-ai", canonical: canonicalGai },
	{ alias: "vertex", api: "google-vertex", canonical: canonicalVertex },
	{ alias: "bedrock", api: "bedrock-converse-stream", canonical: canonicalBedrock },
	{ alias: "mistral", api: "mistral-conversations", canonical: canonicalMistral },
	{ alias: "pi-messages", api: "pi-messages", canonical: canonicalPiMessages },
];
