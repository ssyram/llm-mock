import { dirname, relative } from "node:path";

const REF = /\{\{ (params|vars)\.([A-Za-z0-9_]+) \}\}/g;
const WHOLE_REF = /^\{\{ (params|vars)\.([A-Za-z0-9_]+) \}\}$/;

export function projectStaticIr(ir) {
  if (ir?.schemaVersion !== 2 || !Array.isArray(ir.units) || typeof ir.root !== "string") {
    throw new Error("compile observations must return generic ir schemaVersion=2/root/units");
  }
  const base = dirname(ir.root);
  const units = ir.units.map((unit) => projectUnit(unit, unit.path === ir.root ? "<root>" : relative(base, unit.path))).sort((a, b) => a.id.localeCompare(b.id));
  return { schemaVersion: 2, unitIds: units.map((unit) => unit.id), units };
}

export function rootStaticUnit(projected) {
  const root = projected.units.find((unit) => unit.id === "<root>");
  if (!root) throw new Error("projected IR has no <root> unit");
  return root;
}

function projectUnit(unit, id) {
  return {
    id,
    front: structuredClone(unit.front),
    nodeKinds: unit.nodes.map((node) => node.kind),
    nodes: unit.nodes.map(projectNode),
    matches: unit.matches.map((match) => ({ at: match.at, data: match.data, cases: projectCases(match.cases) })),
    labels: Object.entries(unit.labels).map(([name, nodeIndex]) => ({ name, nodeIndex, nodeKind: unit.nodes[nodeIndex].kind })).sort((a, b) => a.name.localeCompare(b.name)),
    fileCalls: unit.nodes.filter((node) => node.kind === "segment" && node.form === "file").map((node) => ({ path: node.path, with: structuredClone(node.with) })),
    refs: collectRefs(unit.nodes)
  };
}

function projectNode(node) {
  if (node.kind === "rv") {
    return {
      kind: "rv",
      label: node.label ?? null,
      say: node.say ?? null,
      calls: node.calls.map((slot) => ({
        tool: slot.tool,
        args: structuredClone(slot.args),
        expect: slot.expect ? { exitCode: slot.expect.exitCode, contains: slot.expect.contains } : null,
        resultCases: slot.resultCases ? projectCases(slot.resultCases) : null
      })),
      aggregation: node.aggregation ? { command: node.aggregation.command, with: structuredClone(node.aggregation.with), save: structuredClone(node.aggregation.save), cases: projectCases(node.aggregation.cases), volatile: node.aggregation.volatile } : null
    };
  }
  if (node.kind === "user") {
    return { kind: "user", label: node.label ?? null, cases: projectCases(node.cases) };
  }
  return {
    kind: "segment",
    label: node.label ?? null,
    form: node.form,
    ...(node.form === "file" ? { path: node.path, with: structuredClone(node.with) } : { command: node.command, with: structuredClone(node.with), save: structuredClone(node.save), cases: projectCases(node.cases), volatile: node.volatile })
  };
}

function projectCases(cases = []) {
  return cases.map((item) => ({ matcher: item.matcher, value: structuredClone(item.value), pass: item.pass?.to ?? null }));
}

function collectRefs(nodes) {
  const refs = [];
  for (const node of nodes) {
    if (node.kind === "rv") {
      if (node.say !== null) scan(node.say, node, "say", refs);
      for (const slot of node.calls) scan(slot.args, node, `call:${slot.tool}`, refs);
    }
    if (node.kind === "segment") scan(node.with, node, "with", refs);
  }
  return refs.sort((a, b) => a.valuePath.localeCompare(b.valuePath) || a.name.localeCompare(b.name));
}

function scan(value, node, valuePath, refs) {
  if (typeof value === "string") {
    const whole = WHOLE_REF.exec(value);
    for (const match of value.matchAll(REF)) refs.push({ nodeKind: node.kind, label: node.label ?? null, valuePath, scope: match[1], name: match[2], wholeValue: Boolean(whole) });
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, index) => scan(item, node, `${valuePath}[${index}]`, refs));
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) scan(item, node, `${valuePath}.${key}`, refs);
  }
}
