export function providerRequestMutations(input) {
  return [
    { field: "assistantText", input: mutateMessage(input, "assistant", changeAssistantText) },
    { field: "toolArguments", input: mutateMessage(input, "assistant", changeToolArguments) },
    { field: "toolCallId", input: mutateMessage(input, "assistant", changeToolId) },
    { field: "toolResult", input: mutateLastMessage(input, "toolResult", changeToolResult) }
  ];
}

function mutateMessage(input, role, change) {
  const copy = structuredClone(input);
  const message = copy.request.context.messages.find((item) => item.role === role && change(item, true));
  if (!message) throw new Error(`provider request has no mutable ${role} message`);
  change(message, false);
  return copy;
}

function mutateLastMessage(input, role, change) {
  const copy = structuredClone(input);
  const message = copy.request.context.messages.findLast((item) => item.role === role && change(item, true));
  if (!message) throw new Error(`provider request has no mutable ${role} message`);
  change(message, false);
  return copy;
}

function changeAssistantText(message, probe) {
  const block = (message.content ?? []).find((item) => typeof item?.text === "string");
  if (!block) return false;
  if (!probe) block.text = `${block.text}!changed`;
  return true;
}

function changeToolArguments(message, probe) {
  const block = (message.content ?? []).find((item) => item?.type === "toolCall");
  if (!block) return false;
  if (!probe) block.arguments = { ...block.arguments, command: "printf changed" };
  return true;
}

function changeToolId(message, probe) {
  const block = (message.content ?? []).find((item) => item?.type === "toolCall");
  if (!block) return false;
  if (!probe) block.id = `${block.id}-changed`;
  return true;
}

function changeToolResult(message, probe) {
  const block = (message.content ?? []).find((item) => typeof item?.text === "string");
  if (!block) return false;
  if (!probe) block.text = "changed-result-without-marker";
  return true;
}
