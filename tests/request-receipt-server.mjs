import { fileURLToPath } from "node:url";
import { startServer } from "./harness.mjs";

export function startReceiptServer() {
	const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
	const script = fileURLToPath(new URL("./request-receipt-script.mjs", import.meta.url));
	return startServer(0, {}, { type: "script", command: `${quote(process.execPath)} ${quote(script)}` });
}
