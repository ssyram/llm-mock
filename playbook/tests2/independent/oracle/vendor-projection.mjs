const textOf = (content) => typeof content === "string"
  ? content
  : (content ?? []).filter((block) => typeof block?.text === "string").map((block) => block.text).join("\n");

export const allowedPiVendorLosses = Object.freeze([
  "request.timestamp",
  "response.timestamp",
  "usage and cost accounting",
  "toolResult.toolName",
  "toolResult.isError for transports that do not carry it"
]);

export function projectPiMessage(message) {
  const content = Array.isArray(message.content) ? message.content : [];
  if (message.role === "system") {
    return {
      role: "system",
      text: textOf(message.content),
      ...(message.toolsAdded === undefined ? {} : { toolsAdded: structuredClone(message.toolsAdded) })
    };
  }
  if (message.role === "user") {
    const otherContent = content.filter((block) => typeof block?.text !== "string");
    return { role: "user", text: textOf(message.content), ...(otherContent.length ? { otherContent: structuredClone(otherContent) } : {}) };
  }
  if (message.role === "assistant") {
    const otherContent = content.filter((block) => typeof block?.text !== "string" && block?.type !== "toolCall");
    return {
      role: "assistant",
      say: content.filter((block) => typeof block?.text === "string").map((block) => block.text).join("\n"),
      calls: content.filter((block) => block?.type === "toolCall").map((block) => ({
        id: block.id,
        name: block.name,
        arguments: block.arguments
      })),
      ...(otherContent.length ? { otherContent: structuredClone(otherContent) } : {})
    };
  }
  if (message.role === "toolResult") {
    const otherContent = content.filter((block) => typeof block?.text !== "string");
    return {
      role: "toolResult",
      toolCallId: message.toolCallId,
      text: textOf(message.content),
      ...(message.toolName === undefined ? {} : { toolName: message.toolName }),
      ...(message.isError === undefined ? {} : { isError: message.isError }),
      ...(otherContent.length ? { otherContent: structuredClone(otherContent) } : {})
    };
  }
  throw new Error(`unsupported Pi message role ${JSON.stringify(message.role)}`);
}

export function projectPiHistory(messages) {
  return messages.map(projectPiMessage);
}
