import { existsSync } from "node:fs";
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
  "enter-write": [],
  "enter-done-write": [],
  "enter-only": [],
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
  { tool: "fsm", discover: "enter_fsm", args: null, text: "【第 1 段】进入带沙盒护栏的 FSM（profile：工作区可写、protected/ 禁写、网络仅允许 example.com:443）。发任意一条消息自动连跑全部 15 段，所有命令都经 srt 沙盒真实执行。" },
  { tool: "bash", command: "printf 'tutorial-ok\\n' > demo-allowed.txt", text: "【第 2 段】写工作区根下的 demo-allowed.txt —— 预期成功：它在 allowWrite（工作区）内。" },
  { tool: "bash", command: "printf 'should-not-land\\n' > protected/sample.txt", text: "【第 3 段】下面的命令预期无法执行，因为 denyWrite（protected/）优先于 allowWrite —— 应该看到 PermissionError，且文件内容不变。" },
  { tool: "bash", command: "cat > probe.py <<'PYEOF'\nfrom pathlib import Path\nprint('PY_STARTED', flush=True)\nPath('protected/sample.txt').write_bytes(b'changed by python\\n')\nprint('PY_WRITE_SUCCEEDED', flush=True)\nPYEOF", text: "【第 4 段】在沙盒内现场写一个 python 脚本 probe.py（在工作区，允许）—— 下一场用它的间接写来测拦截。" },
  { tool: "bash", command: "python3 probe.py", text: "【第 5 段】运行 probe.py：脚本本身只是普通 python，但它试图改 protected/sample.txt —— 下面的命令预期无法执行，因为沙盒拦的是真实文件操作而不是命令文本；应看到 PermissionError 且 PY_WRITE_SUCCEEDED 不会出现。" },
  { tool: "bash", command: "curl --silent --show-error --fail-with-body --max-time 20 --write-out '\\nHTTP_STATUS=%{http_code}\\n' https://example.com:443/", text: "【第 6 段】访问 example.com:443 —— 预期成功：它在 allowedDomains 里（沙盒代理放行）。" },
  { tool: "bash", command: "curl --silent --show-error --max-time 20 https://example.org:443/", text: "【第 7 段】访问 example.org:443 —— 下面的命令预期无法执行，因为它不在 allowedDomains，沙盒代理会拦下。" },
  { tool: "bash", command: ": > profile.json", text: "【第 8 段】当场把沙盒配置 profile.json 清空（它就在工作区里、可写）—— 预期这个写本身成功。" },
  { tool: "bash", command: "printf 'after-broken\\n' > demo-after-broken.txt", text: "【第 9 段】profile 已经是空文件 —— 下面的命令预期无法执行：沙盒配置无法加载，门禁 fail-closed 拒绝执行，绝不会裸跑原命令（srt 报错退出）。" },
  { tool: "write", text: "【第 10 段】bash 被它自己弄坏的配置封死了（fail-closed 连修复命令也不放行，这是设计），所以恢复走宿主的 write 工具——不经 bash 沙盒。预期写回成功。" },
  { tool: "bash", command: "printf 'restored\\n' > demo-restored.txt", text: "【第 11 段】再写一次文件 —— 预期成功：profile 恢复后护栏重新生效。" },
  { tool: "fsm", discover: "submit_self_check", args: { target: "done", checks: [] }, text: "【第 12 段】按协议收尾：先提交自检（声明准备迁移到终态 done）。" },
  { tool: "fsm", discover: "try_transition", args: { target: "done", evidence: "bash runtime tutorial finished; effects on disk" }, text: "【第 13 段】迁移到终态 done —— 预期 accept。" },
  { tool: "fsm", discover: "submit_self_check", args: { target: "_fsm_exit", checks: [] }, text: "【第 14 段】退出前再交一次自检（目标 _fsm_exit）。" },
  { tool: "fsm", discover: "exit_fsm", args: {}, text: "【第 15 段】退出 FSM —— 预期 accept。之后这次 Stop 会被服务端直接放行：判到终态即允许，无需任何 LLM 分析。对比看：demo-allowed.txt / demo-restored.txt 被写入，protected/sample.txt 始终原样，profile.json 已恢复完整。" },
]);

function hostToolByExactName(messages, exact) {
  for (const message of messages) {
    if (message?.role !== "system" || !Array.isArray(message.toolsAdded)) continue;
    for (const tool of message.toolsAdded) {
      if (tool?.name === exact) return tool.name;
    }
  }
  return undefined;
}

function fsmToolName(messages, needle) {
  const names = [];
  for (const message of messages) {
    if (message?.role === "system" && Array.isArray(message.toolsAdded)) {
      for (const tool of message.toolsAdded) {
        if (typeof tool?.name === "string" && tool.name.includes(needle)) names.push(tool.name);
      }
    }
    // Deferred-tool hosts (Claude Code 2.x ToolSearch): the full schemas land
    // in a tool result's <functions> block, never in toolsAdded.
    if (message?.role === "toolResult" || message?.role === "user") {
      const text = JSON.stringify(message.content ?? "");
      const pattern = new RegExp(`mcp__[A-Za-z0-9_-]*${needle}[A-Za-z0-9_-]*`, "g");
      for (const match of text.matchAll(pattern)) names.push(match[0]);
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

function stepRespond({ scenario, steps, messages, api, model, toolName, argumentsFixture = {} }) {
  if (typeof toolName !== "string" || toolName.length === 0) {
    throw new Error(`scenario ${scenario} requires the bash tool name (--tool-name or discovery)`);
  }
  const issued = new Set();
  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block?.type === "toolCall" && typeof block.id === "string"
          && block.id.startsWith(`fsmbr_${scenario}_`)) {
        issued.add(block.id);
      }
    }
  }
  const done = Math.max(0, ...[...issued].map((id) => Number(id.split("_").pop()) || 0));
  const previousId = `fsmbr_${scenario}_${done}`;
  const next = steps[done];
  const carry = done > 0 && issued.has(previousId)
    ? `\n\n上一步结果：${tutorialQuotedResult(messages, previousId)}`
    : "";
  if (!next) {
    return finished(api, model, messages,
      `scenario ${scenario} 完成。` + carry);
  }
  // MCP servers connect asynchronously: on the very first turns the host may
  // not yet advertise the fsm tools. Issue a harmless `true` (id suffix 0,
  // does not advance the step counter) until the needed tool shows up.
  // A failed previous step ends the flow: admission refusal (fsm step, no
  // active FSM — running the probes ungoverned would be wrong) and the
  // hook-local runtime guard (bash step, hook error surfaces as an error
  // result) both terminate instead of retrying.
  if (done > 0) {
    const previous = steps[done - 1];
    const priorResult = resultFor(messages, previousId);
    const padded = resultFor(messages, `${previousId}w`);
    const outcome = priorResult ?? padded;
    if (outcome?.isError === true) {
      return finished(api, model, messages,
        `step ${done} (${previous?.tool}) was rejected: ${tutorialQuotedResult(messages, outcome.toolCallId)}`);
    }
  }
  // Optional gate: when the fixture sets bashGateFile, a bash step is only
  // issued once that file exists; until then harmless `true` calls keep the
  // conversation alive (id suffix "w" never advances the step counter —
  // Number("2w") || 0 === 0). Lets a runner flip host state mid-run at a
  // deterministic point (e.g. between enter and the probe).
  if (next.tool === "bash" && typeof argumentsFixture.bashGateFile === "string"
      && !existsSync(argumentsFixture.bashGateFile)) {
    return toolReply(api, model, messages, toolName, `fsmbr_${scenario}_${done + 1}w`,
      { command: "true" });
  }
  if (next.tool === "fsm" && !fsmToolName(messages, next.discover)) {
    const search = hostToolByExactName(messages, "ToolSearch");
    if (!search) {
      throw new Error(`scenario ${scenario}: ${next.discover} not advertised and no ToolSearch tool`);
    }
    return toolReply(api, model, messages, search, `fsmbr_${scenario}_0`,
      { query: "fsm", max_results: 50 });
  }
  const id = `fsmbr_${scenario}_${done + 1}`;
  let call;
  if (next.tool === "bash") {
    call = { name: toolName, arguments: {
      timeout: argumentsFixture.timeout,
      description: argumentsFixture.description,
      command: next.command,
    } };
  } else if (next.tool === "write") {
    const writeTool = hostToolByExactName(messages, "write");
    if (!writeTool) throw new Error("tutorial restore step needs the host write tool; none advertised");
    call = { name: writeTool, arguments: {
      filePath: `${argumentsFixture.workdir}/profile.json`,
      content: String(argumentsFixture.profileJson ?? "") + "\n",
    } };
  } else if (next.tool === "fsm") {
    const fsmTool = fsmToolName(messages, next.discover);
    if (!fsmTool) throw new Error(`tutorial step needs an ${next.discover} MCP tool; none advertised`);
    const args = next.discover === "enter_fsm"
      ? { name: String(argumentsFixture.fsmName ?? "bash-runtime-tutorial") }
      : next.args;
    call = { name: fsmTool, arguments: args };
  } else {
    throw new Error(`scenario ${scenario} step ${done + 1}: unknown tool kind ${next.tool}`);
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

const ENTER_WRITE_STEPS = [
  { tool: "fsm", discover: "enter_fsm", args: null, text: "Enter the sandbox-guarded FSM." },
  { tool: "bash", command: "printf '%s\n' 'FSMBR_WRITE_PROBE' > fsmbr-write-probe.txt",
    text: "Run the controlled write probe once." },
];

// enter → self_check → transition → two bash probes in the PROFILE-LESS
// terminal state. The host is expected to still wrap Bash there (CC cwd
// governance): `cd cd-subdir` must not leak into the `cat`, which reads
// cd-marker.txt from the workspace root (LEAKED would mean the cd stuck).
const ENTER_DONE_STEPS = [
  { tool: "fsm", discover: "enter_fsm", args: null, text: "Enter the sandbox-guarded FSM." },
  { tool: "fsm", discover: "submit_self_check", args: { target: "done", checks: [] },
    text: "Submit the self check for the terminal state." },
  { tool: "fsm", discover: "try_transition", args: { target: "done", evidence: "fixture" },
    text: "Transition into the terminal state." },
  { tool: "bash", command: "cd cd-subdir && pwd",
    text: "Change directory into cd-subdir (expected to stay inside a child shell)." },
  { tool: "bash", command: "cat fsmbr-cd-marker.txt",
    text: "Read the marker at the workspace root — proves the cd did not leak." },
];

const ENTER_ONLY_STEPS = [
  { tool: "fsm", discover: "enter_fsm", args: null, text: "Enter the sandbox-guarded FSM." },
];

export function respond({ scenario, messages, api, model, toolName, argumentsFixture = {} }) {
  if (scenario === "tutorial") {
    return stepRespond({ scenario, steps: TUTORIAL_STEPS, messages, api, model, toolName, argumentsFixture });
  }
  if (scenario === "enter-write") {
    return stepRespond({ scenario, steps: ENTER_WRITE_STEPS, messages, api, model, toolName, argumentsFixture });
  }
  if (scenario === "enter-done-write") {
    return stepRespond({ scenario, steps: ENTER_DONE_STEPS, messages, api, model, toolName, argumentsFixture });
  }
  if (scenario === "enter-only") {
    return stepRespond({ scenario, steps: ENTER_ONLY_STEPS, messages, api, model, toolName, argumentsFixture });
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
