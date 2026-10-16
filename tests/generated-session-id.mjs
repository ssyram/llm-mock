const generated = new WeakSet();

export function markGeneratedSessionId(options) {
	options.sessionId = "@pi-generated:uuidv7";
	generated.add(options);
}

export function expectsGeneratedSessionId(options) {
	return options !== undefined && generated.has(options);
}
