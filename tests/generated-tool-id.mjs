const generated = new WeakSet();

export function markGeneratedToolId(block, counter) {
	block.id = `@pi-generated:${counter}`;
	generated.add(block);
}

export function expectsGeneratedToolId(block) {
	return generated.has(block);
}
