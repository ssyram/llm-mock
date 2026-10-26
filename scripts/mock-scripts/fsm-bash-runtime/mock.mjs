#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { discoverBashToolName, respond, scenarioCommands } from "./scenario.mjs";

const usage = "Usage: node mock.mjs --scenario <id> [--tool-name <observed-name>] [--arguments-json <object-json>]";

function parseOptions(argv) {
  const options = {};
  const supported = new Set(["--scenario", "--tool-name", "--arguments-json"]);
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inlineValue] = argv[index].split(/=(.*)/s, 2);
    if (!supported.has(key)) throw new Error(`unknown option: ${key}`);
    const value = inlineValue ?? argv[++index];
    if (typeof value !== "string" || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    options[key] = value;
  }
  if (!options["--scenario"] || !scenarioCommands[options["--scenario"]]) {
    throw new Error(`scenario must be one of: ${Object.keys(scenarioCommands).join(", ")}`);
  }
  return options;
}

function parseArguments(raw) {
  if (raw === undefined) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("--arguments-json must be a JSON object");
  }
  return value;
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const input = JSON.parse(readFileSync(0, "utf8"));
  const messages = input.request?.context?.messages;
  if (!Array.isArray(messages)) throw new Error("stdin request.context.messages must be an array");
  const scenario = options["--scenario"];
  const toolName = options["--tool-name"]
    ?? (scenario === "non-bash" ? undefined : discoverBashToolName(messages));
  if (scenario === "non-bash" && !toolName) throw new Error("non-bash requires explicit --tool-name");
  const reply = respond({
    scenario,
    messages,
    api: input.api,
    model: input.model,
    toolName,
    argumentsFixture: parseArguments(options["--arguments-json"]),
  });
  process.stdout.write(`${JSON.stringify(reply)}\n`);
}

try {
  if (process.argv.includes("--help")) process.stdout.write(`${usage}\n`);
  else main();
} catch (error) {
  process.stderr.write(`${error.message}\n${usage}\n`);
  process.exitCode = 1;
}
