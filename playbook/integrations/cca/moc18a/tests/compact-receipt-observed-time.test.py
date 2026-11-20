#!/usr/bin/env python3
"""终门时刻观测的适配器证明：合成 loopback HTTP（只证适配器，真 OC 闭环由原生实跑证明）。

cx16 真实留痕（main-messages.json 原生 tool part，READ ONLY）：state 携
time={"start":ms,"end":ms} 毫秒宿主事件钟——main.s31 A_DONE end=1795150575120、
main.s52 E_DONE end=1795150656204。observe 必须把该权威完成时刻显式 ms→ns 换算
后随回执运输（observed.completed_ns＋source），绝不以检索当下冒充完成时刻；
无 time 的件＝无可信时刻（observed=None），回执照常绑定，时序证据诚实缺位。
_bind_uncovered 把时刻＋来源写入绑定回执（随链持久）；compact_genesis.validate
接受新旧两形（成对、正整数纳秒、非空来源），半对/零值/坏型一律拒绝。
"""
import http.server
import importlib.util
import json
import shutil
import sys
import tempfile
import threading
from pathlib import Path

sys.dont_write_bytecode = True
import os
HERE = Path(__file__).resolve().parent
ADAPTER_DIR = HERE.parent / "adapter"
sys.path.insert(0, str(ADAPTER_DIR))
sys.path.insert(0, str(HERE))
from cca_scripts_path import cca_scripts  # noqa: E402  (loud failure without an explicit CCA root)
os.environ.setdefault("CCA_NEW_CCA_HOME", str(cca_scripts().parent))
import lane_context  # noqa: E402  (adds checked-in adapter + CCA script paths)
import opencode_tool_receipt  # noqa: E402
import compact_genesis  # noqa: E402
import compact_root_mint  # noqa: E402
from cca_bench.suites.mock_results import MockFault  # noqa: E402

_spec = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fx)

S31_END_MS = 1795150575120  # cx16 main.s31 A_DONE state.time.end（真实留痕，毫秒）
S52_END_MS = 1795150656204  # cx16 main.s52 E_DONE state.time.end（真实留痕，毫秒）
GATE_INTERVAL_NS = (S52_END_MS - S31_END_MS) * 1_000_000  # 81.084 s，与原始间隔一致
S31_INPUT = {"target": "A_DONE", "evidence": "bench final delivery for analysis"}
FAILURES = []
STATE = {"messages": []}


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def gate_part(call_id, tool, output, end_ms=None):
    """cx16 原生 tool part 形状：只换值不换形；end_ms=None 即无 time 件的旧形。"""
    state = {"status": "completed", "input": S31_INPUT if call_id == "main.s31" else {"checks": []},
             "output": output, "title": "",
             "metadata": {"output": output, "exit": 0, "truncated": False}}
    if end_ms is not None:
        state["time"] = {"start": end_ms - 379, "end": end_ms}
    return {"info": {"id": "msg_" + call_id.replace(".", ""), "sessionID": fx.ROOT_SESSION,
                     "role": "assistant", "time": {"created": 1795150505179}},
            "parts": [{"id": "prt_" + call_id.replace(".", ""), "sessionID": fx.ROOT_SESSION,
                       "messageID": "msg_" + call_id.replace(".", ""), "type": "tool",
                       "callID": call_id, "tool": tool, "state": state}]}


class Synthetic(http.server.BaseHTTPRequestHandler):
    """显式合成：只证明适配器协议交互，不模拟原生 OC 语义。"""

    def do_GET(self):
        body = json.dumps(STATE["messages"]).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Synthetic)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = Path(tempfile.mkdtemp(prefix="pb2-receipt-time-"))
    lane = base / "client"
    (lane / "records").mkdir(parents=True)
    (lane / "ready.json").write_text(json.dumps(
        {"session": fx.ROOT_SESSION, "server": "http://127.0.0.1:%d" % server.server_address[1]}),
        encoding="utf-8")
    env = {"root": lane, "root_session": fx.ROOT_SESSION}
    s31 = {"id": "main.s31", "name": "fsm_fsm_try_transition"}
    try:
        STATE["messages"] = [gate_part("main.s31", "fsm_fsm_try_transition",
                                       '{"current_state":"A_DONE"}', S31_END_MS)]
        got = opencode_tool_receipt.observe(env, s31)
        check("S31 权威完成时刻显式 ms→ns 随回执运输(绝不以检索当下冒充)",
              got.get("kind") == "receipt" and got["receipt"]["isError"] is False
              and got.get("observed") == {"completed_ns": S31_END_MS * 1_000_000,
                                          "source": "oc-tool-part.state.time.end"},
              json.dumps(got.get("observed")))
        STATE["messages"] = [gate_part("main.s32", "fsm_fsm_submit_self_check", '{"status":"ready"}')]
        got2 = opencode_tool_receipt.observe(env, {"id": "main.s32", "name": "fsm_fsm_submit_self_check"})
        check("无 time 件＝无可信时刻(observed=None，回执照常绑定)",
              got2.get("kind") == "receipt" and got2["receipt"]["isError"] is False
              and got2.get("observed") is None)
        check("浮点毫秒按毫秒取整后显式换算",
              opencode_tool_receipt.observed_completion({"time": {"end": float(S52_END_MS)}})
              == {"completed_ns": S52_END_MS * 1_000_000, "source": "oc-tool-part.state.time.end"})
        for bad, carrier in ((None, {}), (0, {"time": {"end": 0}}), (-5, {"time": {"end": -5}}),
                             ("x", {"time": {"end": "x"}}), (True, {"time": {"end": True}}),
                             (None, {"time": "not-a-dict"})):
            check("非法 end=%r 不产时刻" % (bad,),
                  opencode_tool_receipt.observed_completion(carrier) is None)
        STATE["messages"] = [gate_part("main.s31", "fsm_fsm_try_transition",
                                       '{"current_state":"A_DONE"}', S31_END_MS),
                             gate_part("main.s32", "fsm_fsm_submit_self_check", '{"status":"ready"}')]
        receipts, sources = compact_root_mint._bind_uncovered(
            env, [{"id": "main.s31", "tool": "fsm_fsm_try_transition"},
                  {"id": "main.s32", "tool": "fsm_fsm_submit_self_check"}], [], [])
        check("铸造侧把时刻＋来源随回执入链(无时刻件保持缺位)",
              receipts[0].get("observed_ns") == S31_END_MS * 1_000_000
              and receipts[0].get("observed_source") == "oc-tool-part.state.time.end"
              and "observed_ns" not in receipts[1] and "observed_source" not in receipts[1]
              and len(sources) == 2, json.dumps(receipts[0]))

        def entry_with(extra):
            receipt = {"call_id": "main.s31", "tool": "fsm_fsm_try_transition",
                       "arguments": S31_INPUT, "result": '{"current_state":"A_DONE"}',
                       "result_truncated": False}
            return {"rest": {"serial": 0, "consumed_tail": None, "waiting_text_sha256": None},
                    "emitted_decisions": [{"action": "tool", "id": "main.s31"}],
                    "receipts": [{**receipt, **extra}]}

        def fault_of(extra):
            try:
                compact_genesis.validate(entry_with(extra))
            except MockFault as fault:
                return fault.kind
            except Exception as error:  # noqa: BLE001
                return "unexpected:%s" % type(error).__name__
            return None

        check("链域校验：旧形(无观测)与成对观测形均合法",
              fault_of({}) is None
              and fault_of({"observed_ns": GATE_INTERVAL_NS, "observed_source": "oc-part"}) is None)
        for extra, why in (({"observed_ns": 5}, "半对缺来源"),
                           ({"observed_ns": 0, "observed_source": "x"}, "零纳秒"),
                           ({"observed_ns": -1, "observed_source": "x"}, "负纳秒"),
                           ({"observed_ns": "5", "observed_source": "x"}, "字符串纳秒"),
                           ({"observed_ns": 5, "observed_source": ""}, "空来源"),
                           ({"observed_ns": 5, "observed_source": "x", "extra": 1}, "未知字段")):
            check("链域校验拒绝：%s" % why, fault_of(extra) == "compact_genesis_invalid",
                  fault_of(extra) or "accepted")
    finally:
        server.shutdown()
        shutil.rmtree(base, ignore_errors=True)
    if FAILURES:
        print("FAILED %d checks: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
