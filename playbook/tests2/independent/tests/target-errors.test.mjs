import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMock2Request, unifiedInput } from "../support/run-mock2-request.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runRoot = join(process.env.PLAYBOOK_INDEPENDENT_ARTIFACTS ?? resolve(root, "../../../target/test-artifacts/playbook-independent"), `target-errors-${Date.now()}-${process.pid}`);
mkdirSync(runRoot, { recursive: true });
const fixture = (name) => join(root, "fixtures/expected-reject", `${name}.md`);

for (const item of [
  { name: "import-unknown-with-key", messages: [{ role: "user", content: "begin" }], code: "playbook_invalid" },
  { name: "missing-reference", messages: [{ role: "user", content: "begin" }], code: "playbook_ref_error" },
  { name: "reader-stack-return", messages: [{ role: "user", content: "begin" }], code: "playbook_program_error" },
  { name: "result-entry-without-history", messages: [{ role: "user", content: "anything" }], code: "playbook_invalid" },
  { name: "dead-goto-budget", messages: [{ role: "user", content: "go" }], code: "playbook_invalid" },
  { name: "program-fault-hard-stop", messages: [{ role: "user", content: "go" }], code: "playbook_program_error" },
  { name: "unsupported-other-selector", messages: [{ role: "user", content: "begin" }], code: "playbook_invalid" }
]) {
  test(`${item.name} returns ${item.code} without a later host tool effect`, () => {
    const artifactDir = join(runRoot, item.name);
    const outcome = runMock2Request({
      playbook: fixture(item.name),
      input: unifiedInput(item.messages),
      artifactDir
    }).output;
    assert.equal(outcome.error?.code, item.code, JSON.stringify(outcome));
    if (item.name === "result-entry-without-history") {
      assert.match(outcome.error.message, /\$label|label|YAML/, "RV 内部不接受 label：跳转不能借它切入 Validation");
    }
    if (item.name === "dead-goto-budget") {
      assert.match(outcome.error.message, /unknown fence/, "goto 已被三单元裁决删除：解析期拒绝");
    }
    if (item.name === "import-unknown-with-key") {
      assert.match(outcome.error.message, /unknown/);
      assert.doesNotMatch(outcome.error.message, /not defined/i);
    }
    assert.equal(existsSync(join(artifactDir, "must-not-exist.txt")), false);
  });
}
