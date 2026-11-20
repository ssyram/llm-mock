"""Worker 抽样前的权威意图材料读取与 intent_compliance 如实组装。

读取：任务包同工作区的 _cca_analysis/intent.md 全文——包内 intent_head 只是截断
提示，不构成已读；读不到即 MockFault（基础设施异常），不降级、不绕过、不伪造已读。
组装：结论只陈述实际发生的事——本次读取的身份（任务/工作区/路径/字节数/小节
哈希）与实际抽样的 findings 逐类计数，并明确合成分析的边界：Mock 做了这次读取
与观察，未对二者做任何语义比对，也不因词表缺失而声称与用户意图无关或不矛盾。
陈述句不回显 intent 原文或词元；材料原文只留在进程内，不进观测通道。
"""
import hashlib
from pathlib import Path

from cca_bench.suites.mock_results import MockFault

OPENING = ("I have obeyed the rules of reading the `intent.md` file first before my analysis "
           "and my finding(s) related to `intent.md` is (are)")
INTENT_RELATIVE = Path("_cca_analysis") / "intent.md"
SECTION_MARKER = "## 用户意图与需求"


def intent_section(text):
    """与 staged intent_head 同法的「用户意图与需求」小节抽取（全文读后本地重抽）。"""
    index = text.find(SECTION_MARKER)
    if index >= 0:
        start = index + len(SECTION_MARKER)
        following = text.find("\n## ", start)
        section = text[start:following if following >= 0 else len(text)].strip()
    else:
        section = text.strip()
    return section


def read_intent_material(package):
    """读任务包同工作区（config.workspace）的完整 intent.md；失败即硬错。"""
    workspace = Path(package["config"]["workspace"])
    path = workspace / INTENT_RELATIVE
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise MockFault("intent_material_missing",
                        "task %s: authoritative %s unreadable in workspace %s before drawing findings: %s"
                        % (package.get("task_id"), INTENT_RELATIVE, workspace, exc)) from exc
    section = intent_section(text)
    return {"task_id": package.get("task_id"), "workspace": str(workspace), "path": str(path),
            "bytes": len(text.encode("utf-8")), "section": section,
            "section_chars": len(section),
            "section_sha256": hashlib.sha256(section.encode("utf-8")).hexdigest()}


def intent_read_note(material):
    """把实际读取连同任务/工作区身份留在 adapter 观测通道（tape_notes）。"""
    return {"intent_read": {key: material[key] for key in
                            ("task_id", "workspace", "path", "bytes", "section_chars", "section_sha256")}}


def intent_compliance(material, findings):
    """由实际材料与实际 findings 组装闸门认可的 intent_compliance 陈述句。"""
    counts = (len(findings.get("edges") or ()), len(findings.get("nodes") or ()),
              len(findings.get("extern") or ()))
    drawn = "" if any(counts) else "; no findings were drawn this task"
    body = ("per the intent.md read in full (%d bytes at %s in this task's workspace; "
            "%s section %d chars, sha256:%s): this task's drawn findings are %d call-edge report(s), "
            "%d discovered-node report(s), %d extern mark(s)%s; this synthetic Mock read the recorded "
            "user intent, observed these drawn findings and counts, performed no further analysis of "
            "them, and claims nothing beyond that read and observation."
            % (material["bytes"], INTENT_RELATIVE.as_posix(), SECTION_MARKER,
               material["section_chars"], material["section_sha256"][:16], *counts, drawn))
    return OPENING + " " + body
