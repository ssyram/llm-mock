"""从输入 spec 的 nodes/edges 直接构造图 artifact（不再以 mode/seed 再生图）。

- 复用冻结 Builder/ShapeArtifact 与 write_c_sources 生产物化路径：节点名/边
  就是 spec 数据本身，同数量不同拓扑不会被数量核对掩盖。
- seed 只进 Mock 选择（PilotDeltaBook），绝不影响图形状；artifact id 中的
  seed 仅作溯源字符串。
- 数据边界如实：本 lane 只支持无 entries 的全集图（spec.entries 非 null ⇒
  明确拒绝，不伪造闭包/桥边语义）；spec 中任何路径字段只当数据读，绝不当
  写入目的地，源材料始终落私有 workspace。
"""
import re
import sys
from pathlib import Path

PROJECT = Path("/Users/ssyram/workspace/work-fv/c-code-verify/.local/analysis-decouple")
sys.path[:0] = [str(PROJECT / ".local/cca-newtree-sut-20261117/scripts"),
                str(PROJECT / ".pi/research/gate-latency-mock-148")]

NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def consume_graph_spec(spec):
    from cca_bench.unit_fixtures import Builder
    nodes = spec.get("nodes")
    edges = spec.get("edges")
    if not isinstance(nodes, list) or not nodes:
        raise SystemExit("input spec nodes must be a non-empty list")
    if not isinstance(edges, list):
        raise SystemExit("input spec edges must be a list")
    if spec.get("entries") not in (None, []):
        raise SystemExit("entries lanes are not implemented in this lane yet (honest gap; not faked)")
    if spec.get("bridge"):
        raise SystemExit("bridge lanes are not implemented in this lane yet (honest gap; not faked)")
    seen = set()
    for name in nodes:
        if not isinstance(name, str) or not NAME.match(name):
            raise SystemExit(f"node name is not a valid C identifier: {name!r}")
        if name in seen:
            raise SystemExit(f"duplicate node name in spec: {name!r}")
        seen.add(name)
    declared = set(nodes)
    pairs = []
    for edge in edges:
        if not isinstance(edge, (list, tuple)) or len(edge) != 2:
            raise SystemExit(f"edge must be a [caller, callee] pair, got {edge!r}")
        caller, callee = edge
        if caller not in declared or callee not in declared:
            raise SystemExit(f"edge references undeclared node: {edge!r}")
        pairs.append((caller, callee))
    builder = Builder("moc18a-new-input", int(spec.get("seed", 0)))
    for name in nodes:
        builder.node(name, "target")
    for caller, callee in pairs:
        builder.edge(caller, callee)
    artifact = builder.build()
    if list(artifact.nodes) != list(nodes) or set(artifact.edges) != set(pairs):
        raise SystemExit("built artifact differs from spec graph (topology mismatch)")
    return artifact


def write_sources(artifact, workspace):
    from cca_bench import graph_csource
    source_root = Path(workspace) / "src"
    return graph_csource.write_c_sources(artifact, source_root), source_root


if __name__ == "__main__":
    import json
    import sys
    if len(sys.argv) != 3 or any(part.startswith("-") for part in sys.argv[1:]):
        raise SystemExit("usage: python3 spec_graph.py SPEC_JSON OUT_ARTIFACT_JSON")
    artifact = consume_graph_spec(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
    Path(sys.argv[2]).write_text(json.dumps({
        "nodes": list(artifact.nodes), "edges": [list(e) for e in artifact.edges],
        "projects": artifact.projects, "sha256": artifact.sha256}, ensure_ascii=False, indent=1), encoding="utf-8")
