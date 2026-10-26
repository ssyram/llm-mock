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
  "tutorial": [],
});

const TUTORIAL_STEPS = Object.freeze([
  { tool: "fsm-enter", text: "【第 1 段】进入带沙盒护栏的 FSM（profile：工作区可写、protected/ 禁写、网络仅允许 example.com:443）。接下来每条消息推进一段，所有命令都经 srt 沙盒真实执行。" },
  { tool: "bash", command: "printf 'tutorial-ok\\n' > demo-allowed.txt", text: "【第 2 段】写工作区根下的 demo-allowed.txt —— 预期成功：它在 allowWrite（工作区）内。" },
  { tool: "bash", command: "printf 'should-not-land\\n' > protected/sample.txt", text: "【第 3 段】下面的命令预期无法执行，因为 denyWrite（protected/）优先于 allowWrite —— 应该看到 PermissionError，且文件内容不变。" },
  { tool: "bash", command: "cat > probe.py <<'PYEOF'\nfrom pathlib import Path\nprint('PY_STARTED', flush=True)\nPath('protected/sample.txt').write_bytes(b'changed by python\n')\nprint('PY_WRITE_SUCCEEDED', flush=True)\nPYEOF", text: "【第 4 段】在沙盒内现场写一个 python 脚本 probe.py（在工作区，允许）—— 下一场用它的间接写来测拦截。" },
  { tool: "bash", command: "python3 probe.py", text: "【第 5 段】运行 probe.py：脚本本身只是普通 python，但它试图改 protected/sample.txt —— 下面的命令预期无法执行，因为沙盒拦的是真实文件操作而不是命令文本；应看到 PermissionError 且 PY_WRITE_SUCCEEDED 不会出现。" },
  { tool: "bash", command: "curl --silent --show-error --fail-with-body --max-time 20 --write-out '\\nHTTP_STATUS=%{http_code}\\n' https://example.com:443/", text: "【第 6 段】访问 example.com:443 —— 预期成功：它在 allowedDomains 里（沙盒代理放行）。" },
  { tool: "bash", command: "curl --silent --show-error --max-time 20 https://example.org:443/", text: "【第 7 段】访问 example.org:443 —— 下面的命令预期无法执行，因为它不在 allowedDomains，沙盒代理会拦下。" },
  { tool: "bash", command: ": > profile.json", text: "【第 8 段】当场把沙盒配置 profile.json 清空（它就在工作区里、可写）—— 预期这个写本身成功。" },
  { tool: "bash", command: "printf 'after-broken\\n' > demo-after-broken.txt", text: "【第 9 段】profile 已经是空文件 —— 下面的命令预期无法执行：沙盒配置无法加载，门禁 fail-closed 拒绝执行，绝不会裸跑原命令（srt 报错退出）。" },
  { tool: "bash", restoreProfile: true, text: "【第 10 段】把完整 profile 写回去（launcher 生成的同一份内容）—— 预期成功。" },
  { tool: "bash", command: "printf 'restored\\n' > demo-restored.txt", text: "【第 11 段】再写一次文件 —— 预期成功：profile 恢复后护栏重新生效。" },
  { tool: "fsm-exit", text: "【第 12 段】教程结束，退出 FSM。对比看：demo-allowed.txt / demo-restored.txt 被写入，protected/sample.txt 始终原样，profile.json 又是完整配置。" },
]);

function fsmToolName(messages, needle) {
  const names = [];
  for (const message of messages) {
    if (message?.role !== "system" || !Array.isArray(message.toolsAdded)) continue;
    for (const tool of message.toolsAdded) {
      if (typeof tool?.name === "string" && tool.name.includes(needle)) names.push(tool.name);
    }
  }
  return [...new Set(names)][0];
}

function tutorialQuotedResult(messages, callId) {
  const result = resultFor(messages, callId);
  if (!result) return "（无结果记录）";
  const text = (Array.isArray(result.content) ? result.content : [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  const head = (text[0] ?? "").slice(0, 140);
  return `isError=${String(result.isError === true)} ${head}`;
}

function tutorialRespond({ messages, api, model, toolName, argumentsFixture = {} }) {
  if (typeof toolName !== "string" || toolName.length === 0) {
    throw new Error("tutorial requires the bash tool name (--tool-name or discovery)");
  }
  const issued = new Set();
  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block?.type === "toolCall" && typeof block.id === "string" && block.id.startsWith("fsmbr_tutorial_")) {
        issued.add(block.id);
      }
    }
  }
  const done = Math.max(0, ...[...issued].map((id) => Number(id.split("_").pop()) || 0));
  const previousId = `fsmbr_tutorial_${done}`;
  const next = TUTORIAL_STEPS[done];
  const carry = done > 0 && issued.has(previousId)
    ? `\n\n上一步结果：${tutorialQuotedResult(messages, previousId)}`
    : "";
  if (!next) {
    return finished(api, model, messages,
      "教程全部完成。每段命令都经过了 FSM 门禁 → srt 沙盒改写 → 真实执行。" + carry);
  }
  const id = `fsmbr_tutorial_${done + 1}`;
  let call;
  if (next.tool === "bash") {
    const command = next.restoreProfile
      ? `cat > profile.json <<'PJEOF'\n${argumentsFixture.profileJson}\nPJEOF`
      : next.command;
    call = { name: toolName, arguments: {
      timeout: argumentsFixture.timeout,
      description: argumentsFixture.description,
      command,
    } };
  } else {
    const fsmTool = fsmToolName(messages, next.tool === "fsm-enter" ? "enter_fsm" : "exit_fsm");
    if (!fsmTool) throw new Error(`tutorial step ${done + 1} needs an ${next.tool} MCP tool; none advertised`);
    call = { name: fsmTool, arguments: next.tool === "fsm-enter" ? { name: String(argumentsFixture.fsmName ?? "bash-runtime-tutorial") } : {} };
  }
  return assistantMessage(api, model, messages, [
    { type: "text", text: next.text + carry },
    { type: "toolCall", id, name: call.name, arguments: call.arguments },
  ], "toolUse");
}

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
  if (scenario === "tutorial") {
    return tutorialRespond({ scenario, messages, api, model, toolName, argumentsFixture });
  }
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
