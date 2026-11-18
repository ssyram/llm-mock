import test from "node:test";
import assert from "node:assert/strict";
import { allowedPiVendorLosses, projectPiHistory } from "../oracle/vendor-projection.mjs";

test("projection keeps semantic assistant and result fields", () => {
  const projected = projectPiHistory([
    { role: "system", content: "local-contract", toolsAdded: [{ name: "bash" }] },
    { role: "assistant", timestamp: 7, content: [
      { type: "text", text: "" },
      { type: "toolCall", id: "id-1", name: "bash", arguments: { command: "printf ok" } }
    ] },
    { role: "toolResult", toolCallId: "id-1", content: [{ type: "text", text: "ok" }] }
  ]);
  assert.deepEqual(projected, [
    { role: "system", text: "local-contract", toolsAdded: [{ name: "bash" }] },
    { role: "assistant", say: "", calls: [{ id: "id-1", name: "bash", arguments: { command: "printf ok" } }] },
    { role: "toolResult", toolCallId: "id-1", text: "ok" }
  ]);
});

test("loss list is narrow and explicit", () => {
  assert.ok(allowedPiVendorLosses.includes("toolResult.isError for transports that do not carry it"));
  assert.ok(!allowedPiVendorLosses.some((item) => /assistant text|toolCall id|tool arguments/.test(item)));
});
