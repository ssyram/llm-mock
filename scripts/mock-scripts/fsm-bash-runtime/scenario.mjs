export const scenarioCommands = Object.freeze({
  "rewrite-marker": [
    "printf '%s\\n' 'FSMBR_ORIGINAL_MARKER' > fsmbr-original-marker.txt",
  ],
  "command-fidelity": [
    String.raw`printf '%s\n' 'single quote: '\'' and spaces' "$(printf '%s' 'substitution-marker')"
printf '%s\n' 'pipeline marker' | cat > fidelity-marker.txt`,
  ],
  "write-probe": [
    "printf '%s\\n' 'FSMBR_WRITE_PROBE' > fsmbr-write-probe.txt",
  ],
  "two-call-refresh": [
    "printf '%s\\n' 'FSMBR_CALL_ONE' > fsmbr-call-one.txt",
    "printf '%s\\n' 'FSMBR_CALL_TWO' > fsmbr-call-two.txt",
  ],
  "python-indirect-write": ["python3 fixture.py"],
  "network-allowed": [
    "curl --silent --show-error --fail-with-body --dump-header - --max-time 25 --write-out '\\nFSMBR_HTTP_STATUS=%{http_code}\\n' https://example.com:443/",
  ],
  "network-denied": [
    "curl --silent --show-error --fail-with-body --dump-header - --max-time 25 --write-out '\\nFSMBR_HTTP_STATUS=%{http_code}\\n' https://example.org:443/",
  ],
  "non-bash": [],
  "fuzz": [],
});

function fuzzSteps(fixture) {
  const value = fixture.fuzzSteps;
  if (!Array.isArray(value) || value.length === 0
      || value.some((step) => typeof step !== "string" || step.length === 0)) {
    throw new Error("fuzz requires --arguments-json with a non-empty fuzzSteps array of non-empty strings");
  }
  return value;
}

function latestTurn(messages) {
  let lastUser = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") lastUser = index;
  }
  return messages.slice(lastUser + 1);
}

export function discoverBashToolName(messages) {
  const candidates = [];
  for (const message of messages) {
    if (message?.role !== "system" || !Array.isArray(message.toolsAdded)) continue;
    for (const tool of message.toolsAdded) {
      if (tool?.parameters?.properties?.command?.type === "string") candidates.push(tool.name);
    }
  }
  const names = [...new Set(candidates.filter((name) => typeof name === "string" && name.length > 0))];
  if (names.length !== 1) {
    throw new Error(`expected exactly one tool schema with string properties.command; found ${names.length}; pass --tool-name from the request`);
  }
  return names[0];
}

function resultFor(messages, callId) {
  return messages.find((message) => message?.role === "toolResult" && message.toolCallId === callId);
}

function priorCall(messages, callId) {
  return messages.some((message) => message?.role === "assistant"
    && Array.isArray(message.content)
    && message.content.some((block) => block?.type === "toolCall" && block.id === callId));
}

function assistantMessage(api, model, messages, content, stopReason) {
  return {
    api,
    provider: "fsm-bash-runtime",
    model,
    content,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: 0,
  };
}

function toolReply(api, model, messages, toolName, callId, args) {
  return assistantMessage(api, model, messages, [{
    type: "toolCall",
    id: callId,
    name: toolName,
    arguments: args,
  }], "toolUse");
}

function finished(api, model, messages, text) {
  return assistantMessage(api, model, messages, [{ type: "text", text }], "stop");
}

function callId(scenario, step) {
  return `fsmbr_${scenario}_${step}`;
}

export function respond({ scenario, messages, api, model, toolName, argumentsFixture = {} }) {
  const steps = scenario === "fuzz" ? fuzzSteps(argumentsFixture) : scenarioCommands[scenario];
  if (!steps) throw new Error(`unknown scenario: ${scenario}`);
  if (!Array.isArray(messages)) throw new Error("request.context.messages must be an array");
  if (typeof toolName !== "string" || toolName.length === 0) throw new Error("tool name is required");
  if (!argumentsFixture || typeof argumentsFixture !== "object" || Array.isArray(argumentsFixture)) {
    throw new Error("--arguments-json must be a JSON object");
  }

  const turn = latestTurn(messages);
  if (scenario === "non-bash") {
    if (Object.keys(argumentsFixture).length === 0) throw new Error("non-bash requires explicit --arguments-json");
    const id = callId(scenario, 1);
    if (!priorCall(turn, id)) return toolReply(api, model, messages, toolName, id, { ...argumentsFixture });
    const result = resultFor(turn, id);
    return finished(api, model, messages, result
      ? `Observed matching toolResult ${id} (isError=${result.isError}); no retry. Filesystem state is unverified.`
      : `Tool call ${id} has no matching toolResult; it was not repeated. Filesystem state is unverified.`);
  }

  const baseFixture = scenario === "fuzz" ? (({ fuzzSteps: _steps, ...rest }) => rest)(argumentsFixture) : argumentsFixture;
  const makeCall = (step) => toolReply(api, model, messages, toolName, callId(scenario, step), {
    ...baseFixture,
    command: steps[step - 1],
  });
  const firstId = callId(scenario, 1);
  if (!priorCall(turn, firstId)) return makeCall(1);
  const firstResult = resultFor(turn, firstId);
  if (!firstResult) return finished(api, model, messages,
    `Tool call ${firstId} has no matching toolResult; it was not repeated. Filesystem state is unverified.`);
  if (firstResult.isError) return finished(api, model, messages,
    `Observed matching toolResult ${firstId} (isError=true); no retry or next call. Filesystem state is unverified.`);
  if (steps.length === 1) return finished(api, model, messages,
    `Observed matching toolResult ${firstId} (isError=false); no retry. Filesystem state is unverified.`);

  const secondId = callId(scenario, 2);
  if (!priorCall(turn, secondId)) return makeCall(2);
  const secondResult = resultFor(turn, secondId);
  return finished(api, model, messages, secondResult
    ? `Observed matching toolResults ${firstId} and ${secondId} (second isError=${secondResult.isError}); no retry. Filesystem state is unverified.`
    : `Tool call ${secondId} has no matching toolResult; it was not repeated. Filesystem state is unverified.`);
}
