const names = { pi: 'bash', oc: 'bash', cc: 'Bash' };
const description = 'Run local showcase shell command';

export function bindShell(input, host) {
  const native = names[host];
  if (!native) throw new Error(`unsupported host ${host}`);
  const request = structuredClone(input);
  const context = request?.request?.context;
  if (!context || !Array.isArray(context.messages)) throw new Error('request context messages are required');
  const tools = [...(context.tools ?? []), ...context.messages.flatMap(message => message.toolsAdded ?? [])];
  const candidates = tools.filter(tool => tool.name === native);
  if (candidates.length !== 1) throw new Error(`expected one model-visible ${native} tool, got ${candidates.length}`);
  const schema = candidates[0].parameters;
  if (schema?.type !== 'object' || schema.properties?.command?.type !== 'string') throw new Error(`${native} lacks a string command parameter`);
  const required = schema.required ?? [];
  const extras = required.filter(key => key !== 'command' && key !== 'description');
  if (extras.length || (required.includes('description') && schema.properties?.description?.type !== 'string')) {
    throw new Error(`${native} has unsupported required parameters: ${extras.join(', ')}`);
  }
  const addDescription = required.includes('description');
  for (const message of context.messages) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) if (block.type === 'toolCall') {
        if (block.name !== native) throw new Error(`history used unexpected tool ${block.name}`);
        block.name = 'bash';
        if (addDescription) {
          if (block.arguments?.description !== description) throw new Error('history changed required injected description');
          delete block.arguments.description;
        }
      }
    }
    if (message.role === 'toolResult' && message.toolName) {
      if (message.toolName !== native) throw new Error(`result used unexpected tool ${message.toolName}`);
      message.toolName = 'bash';
    }
  }
  return { request, native, addDescription, schema };
}

export function bindReply(reply, binding) {
  if (reply.error) return reply;
  const result = structuredClone(reply);
  for (const block of result.content ?? []) if (block.type === 'toolCall') {
    if (block.name !== 'bash') throw new Error(`playbook requested unsupported canonical tool ${block.name}`);
    if (typeof block.arguments?.command !== 'string') throw new Error('canonical command must be a string');
    for (const key of Object.keys(block.arguments)) {
      if (key !== 'command') throw new Error(`unsupported canonical shell argument ${key}`);
    }
    block.name = binding.native;
    if (binding.addDescription) block.arguments.description = description;
  }
  return result;
}
