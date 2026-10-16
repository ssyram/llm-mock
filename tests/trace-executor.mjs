import assert from "node:assert/strict";

export async function executeTrace(calls, expectedCalls, scenario, fault) {
	assert.equal(calls.length, expectedCalls.length);
	const effects = [], completed = [], release = [];
	const gates = calls.map((_, index) => new Promise((resolve) => { release[index] = resolve; }));
	const execute = async (call, index) => {
		effects.push({ name: call.name, arguments: structuredClone(call.arguments) });
		await gates[index];
		if (scenario.errors[index]) throw new Error(`tool-error:${call.arguments.value}`);
		return JSON.stringify({ tool: call.name, arguments: call.arguments });
	};
	const pending = calls.map((call, index) => {
		assert.equal(call.name, expectedCalls[index].name);
		assert.deepEqual(call.arguments, expectedCalls[index].arguments);
		return execute(call, index).then((text) => ({ text, isError: false }), (error) => ({ text: error.message, isError: true })).then((result) => {
			const message = { role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text: result.text }], isError: result.isError, timestamp: 1 };
			completed.push({ index, message });
			return message;
		});
	});
	const duplicate = fault === "duplicate-execution" && calls.length ? execute(calls[0], 0).catch(() => undefined) : undefined;
	for (const index of scenario.order.filter((index) => index < calls.length)) {
		release[index]();
		await pending[index];
	}
	await Promise.all([...pending, duplicate]);
	assert.equal(effects.length, expectedCalls.length, "execution count must equal parsed tool calls");
	assert.deepEqual(completed.map((item) => item.index), scenario.order.filter((index) => index < calls.length));
	return { effects, results: completed.map((item) => item.message), completionOrder: completed.map((item) => item.index) };
}
