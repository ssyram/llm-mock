// spec 图消费边界：同节点同边数不同拓扑必须按 spec 物化（数量核对不可掩盖）；
// 非旧生成器形状（路径图/双环）合法；非法图/未实现语义明确拒绝。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const specGraph = join(here, "..", "adapter", "spec_graph.py");
const run = (spec) => {
  const dir = mkdtempSync(join("/tmp", "pb2-specgraph-"));
  const specPath = join(dir, "spec.json");
  const outPath = join(dir, "artifact.json");
  writeFileSync(specPath, JSON.stringify(spec));
  const done = spawnSync("python3", [specGraph, specPath, outPath], { encoding: "utf8", timeout: 60000 });
  return { status: done.status, stderr: done.stderr, artifact: done.status === 0 ? JSON.parse(readFileSync(outPath, "utf8")) : null, dir };
};

const base = { seed: 1, parallel: 2, batch: 2, mock: { max_new_nodes: 2, max_new_facts: 4, wait_seconds: [0.5, 3] } };

test("同数量不同拓扑（双 3 环 vs 旧 ring3+孤立）按 spec 原样物化，不被数量核对替换", () => {
  const spec = { ...base, nodes: ["a0", "a1", "a2", "b0", "b1", "b2"],
    edges: [["a0", "a1"], ["a1", "a2"], ["a2", "a0"], ["b0", "b1"], ["b1", "b2"], ["b2", "b0"]] };
  const { status, stderr, artifact, dir } = run(spec);
  assert.equal(status, 0, stderr);
  assert.deepEqual(artifact.nodes, spec.nodes);
  assert.deepEqual(new Set(artifact.edges.map((e) => e.join("->"))),
    new Set(spec.edges.map((e) => e.join("->"))), "拓扑必须逐边等于 spec，而非旧生成器形状");
  rmSync(dir, { recursive: true, force: true });

});

test("非旧生成器图（6 节点 5 边路径图）合法并完整物化", () => {
  const spec = { ...base, nodes: ["p0", "p1", "p2", "p3", "p4", "p5"],
    edges: [["p0", "p1"], ["p1", "p2"], ["p2", "p3"], ["p3", "p4"], ["p4", "p5"]] };
  const { status, stderr, artifact, dir } = run(spec);
  assert.equal(status, 0, stderr);
  assert.deepEqual(artifact.nodes, spec.nodes);
  assert.equal(artifact.edges.length, 5);
  rmSync(dir, { recursive: true, force: true });
});

for (const [name, spec, pattern] of [
  ["空节点表拒绝", { ...base, nodes: [], edges: [] }, /non-empty/],
  ["重复节点拒绝", { ...base, nodes: ["x", "x"], edges: [] }, /duplicate node/],
  ["非 C 标识符节点拒绝", { ...base, nodes: ["9bad"], edges: [] }, /C identifier/],
  ["边引用未声明节点拒绝", { ...base, nodes: ["a"], edges: [["a", "ghost"]] }, /undeclared/],
  ["entries 非空=如实缺口拒绝（不伪造）", { ...base, nodes: ["a", "b"], edges: [], entries: ["a"] }, /entries lanes are not implemented/],
]) {
  test(name, () => {
    const { status, stderr } = run(spec);
    assert.notEqual(status, 0, "非法/未实现输入必须拒绝");
    assert.match(stderr, pattern);
  });
}

test("真实 C 源物化走生产 write_c_sources 路径且只写私有 workspace", () => {
  const spec = { ...base, nodes: ["t0", "t1", "t2", "r0_0", "r0_1", "r0_2"],
    edges: [["r0_0", "r0_1"], ["r0_1", "r0_2"], ["r0_2", "r0_0"]] };
  const dir = mkdtempSync(join("/tmp", "pb2-specwrite-"));
  const script = `
import sys, json
import importlib.util
mod = importlib.util.spec_from_file_location("sg", ${JSON.stringify(specGraph)})
sg = importlib.util.module_from_spec(mod); mod.loader.exec_module(sg)
artifact = sg.consume_graph_spec(json.loads(${JSON.stringify(JSON.stringify(spec))}))
stats, root = sg.write_sources(artifact, ${JSON.stringify(dir)})
print(json.dumps({"stats": stats, "root": str(root)}))
`;
  const done = spawnSync("python3", ["-c", script], { encoding: "utf8", timeout: 60000 });
  assert.equal(done.status, 0, done.stderr);
  const out = JSON.parse(done.stdout);
  assert.ok(out.root.startsWith(dir), "源材料只能写进私有 workspace");
  const csource = readFileSync(join(out.root, "p0", "g0.c"), "utf8");
  assert.match(csource, /void r0_0\(void\) \{\s*r0_1\(\);\s*\}/, "环边按 spec 物化为真实 C 调用");
  rmSync(dir, { recursive: true, force: true });
});
