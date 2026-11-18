import { join, relative } from "node:path";
import { showcaseCases } from "../independent/contract/full-showcase-scenarios.mjs";
import { discoverSources, discoverTests } from "./discover-files.mjs";

const piFlags = ["--print", "--offline", "--approve", "--no-extensions", "--no-skills", "--no-prompt-templates",
  "--no-themes", "--no-context-files", "--no-mcp", "--thinking", "off", "--tools", "bash"];
const piArgs = (extra = []) => [...piFlags, ...extra, "--model", "<local-provider>/mock-m", "--session-dir", "<isolated-session>", "[ -c on continuation ]", "<case-input>"];

export function suitePlan(repo) {
  const playbook = join(repo, "playbook");
  const files = discoverTests([join(playbook, "tests"), join(playbook, "tests2"), join(playbook, "examples2/full-showcase/tests")]);
  const modules = files.map((file, index) => ({
    id: `module-${String(index + 1).padStart(3, "0")}`, file: relative(repo, file),
    command: [process.execPath, "--test", "--test-reporter=tap", file], testFile: true,
    cases: ["all node:test cases declared by this file, including generated cases"],
    needs: file.endsWith("http-mounts.test.mjs") ? ["server"] : []
  }));
  const jobs = [
    { id: "syntax", command: [process.execPath, join(playbook, "tests2/local-suite/check-syntax.mjs")],
      cases: discoverSources(playbook).map((file) => relative(repo, file)), needs: [] },
    ...modules,
    { id: "pi-v1", command: [process.execPath, join(playbook, "tests2/run-v1-pi-e2e.mjs")], timeoutMs: 900000,
      cases: ["v1 report happy/wrong/expect", "case branches and routing", "affine/segment/fault", "result-ref walk"], piArgs: piArgs(), needs: ["pi", "server"] },
    { id: "pi-v2", command: [process.execPath, join(playbook, "tests2/pi-e2e2.mjs")], timeoutMs: 300000,
      cases: ["v2 system, batching, import loop, unique IDs"], piArgs: piArgs(), needs: ["pi", "server"] },
    { id: "pi-representative", command: [process.execPath, join(playbook, "tests2/independent/jobs/run-real-pi.mjs")], timeoutMs: 600000,
      cases: ["representative Pi two turns, real captures and four mutations"], piArgs: piArgs(["--system-prompt", "local-contract"]), needs: ["pi", "server"] },
    { id: "pi-full-showcase", command: [process.execPath, join(playbook, "tests2/independent/jobs/run-full-showcase-pi.mjs")], timeoutMs: 1200000,
      cases: [...showcaseCases.map((item) => item.id), "invalid-first"], piArgs: piArgs(["--system-prompt", "local-contract"]), needs: ["pi", "server"] }
  ];
  return { jobs, selectedTestFiles: files.map((file) => relative(repo, file)), exclusions: [
    "node_modules, artifacts, fixtures and retired paths are not independent test entries",
    "integrations/cca business matrices and archived snapshots are outside this playbook-local suite",
    "root Rust tests, unrelated provider protocol suites and real providers are outside scope",
    "v1 case/affine/walk helpers are invoked by pi-v1, not counted as separate entries",
    "OC and CC real interactive acceptance remains manual; only synthetic HTTP mount wiring runs here"
  ] };
}
