"""Export only shape-preserving, sanitized local corpus excerpts; never log source text."""
import argparse
import hashlib
import json
from itertools import islice
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "tests/fixtures/corpus-discovery"
SESSION = "01a139a8-b5d1-7662-8f93-ad9dbbc5f7d7"
LINES = [25, 26, 27, 28, 29, 33, 34, 35, 36]
KEYS = set("""api arguments cacheRead cacheWrite command constrainedSampling content cost
cwd description details docs errorMessage id input isError limit model name offset output
parameters path preamble properties provider rawStopReason reasoning required responseId role
rules sections stopReason strict text textSignature thinking thinkingLevel thinkingSignature
timeout timestamp toolCallId toolName tools toolsAdded total totalTokens type usage capturedAt
summary encrypted_content v phase message""".split())
ENUMS = {
    "role": {"system", "user", "assistant", "toolResult"},
    "type": {"text", "thinking", "toolCall", "object", "string", "number", "integer",
             "boolean", "array", "null", "reasoning", "summary_text", "reasoning_text", "json_schema"},
    "api": {"openai-completions", "openai-responses", "openai-codex-responses"},
    "stopReason": {"stop", "length", "toolUse", "error", "aborted"},
    "rawStopReason": {"stop", "tool_calls", "completed", "end_turn"},
    "thinkingLevel": {"off", "minimal", "low", "medium", "high", "xhigh"},
    "phase": {"commentary", "final"},
}
TOOLS = {"read", "bash", "edit", "write", "grep", "find", "ls"}


def records(path, limit=None):
    with path.open() as stream:
        return [json.loads(line) for line in islice(stream, limit) if line.strip()]


def sources(sessions_root):
    names = {5: "post-tool-thinking", 9: "thinking-tool-success",
             11: "provider-model-not-found", 13: "provider-thinking-rejected"}
    for slot, name in names.items():
        dirs = [p for p in ROOT.glob(".tmp-corpus-b3-*") if p.name.endswith(f"-{slot}")]
        assert len(dirs) == 1, f"batch3 slot {slot}: expected one source directory"
        files = list(dirs[0].glob("real-session/.pi/mock-corpus/capture-*.jsonl"))
        assert len(files) == 1, f"batch3 slot {slot}: expected one capture"
        yield name, records(files[0]), {"kind": "extension-capture", "batch": 3, "slot": slot}
    files = list(sessions_root.glob(f"*mock-with-pi*/*_{SESSION}.jsonl"))
    assert len(files) == 1, "expected original build session"
    entries = records(files[0], max(LINES))
    selected = [entries[line - 1] for line in LINES]
    assert selected[0]["id"] == "c3c87937" and selected[4]["id"] == "3aa9baa3"
    by_id = {entry["id"]: entry for entry in entries if "id" in entry}
    for previous, current in zip(selected, selected[1:]):
        parent = by_id[current["parentId"]]
        while parent["id"] != previous["id"]:
            assert parent["type"] == "custom", "selected messages cross a non-custom entry"
            parent = by_id[parent["parentId"]]
    yield "native-mixed-tool-rounds", [{"message": e["message"]} for e in selected], {
        "kind": "native-session-excerpt", "sessionId": SESSION, "lines": LINES,
        "entryIds": ["c3c87937", "3aa9baa3"], "completeConversation": False,
    }


class Sanitizer:
    def __init__(self, rows):
        self.tokens = {}
        times = set()
        def collect(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key in ("timestamp", "capturedAt"):
                        times.add(item)
                    collect(item)
            elif isinstance(value, list):
                for item in value:
                    collect(item)
        collect(rows)
        self.times = {value: 946684800000 + i for i, value in enumerate(sorted(times))}

    def token(self, value):
        if value not in self.tokens:
            self.tokens[value] = f"sanitized-{len(self.tokens) + 1:04d}"
        return self.tokens[value]

    def clean(self, value, field=""):
        if isinstance(value, dict):
            assert set(value) <= KEYS, "unrecognized source keys; no source values emitted"
            return {key: self.clean(item, key) for key, item in value.items()}
        if isinstance(value, list):
            return [self.clean(item, field) for item in value]
        if value is None or isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            if field in ("timestamp", "capturedAt"):
                return self.times[value]
            return value if field == "v" else (0 if isinstance(value, int) else 0.0)
        assert isinstance(value, str), "non-JSON source value"
        if not value.strip():
            return value
        if field in ENUMS:
            assert value in ENUMS[field], "unrecognized protocol enum"
            return value
        if field in ("name", "toolName") and value in TOOLS:
            return value
        if field == "required" and value in KEYS:
            return value
        if field.endswith("Signature"):
            if value == "reasoning_content":
                return value
            try:
                parsed = json.loads(value)
            except ValueError:
                return self.token(value)
            return json.dumps(self.clean(parsed), ensure_ascii=False, separators=(",", ":"))
        if field == "errorMessage":
            if "model_not_found" in value:
                return '404 {"error":{"code":"model_not_found","message":"Sanitized rejection"}}'
            if "1210" in value:
                return '400 {"error":{"code":"1210","message":"Sanitized thinking rejection"}}'
        return self.token(value)


def shape(value):
    if isinstance(value, dict):
        return {key: shape(item) for key, item in value.items()}
    if isinstance(value, list):
        return [shape(item) for item in value]
    return type(value).__name__


def main():
    if not __debug__:
        raise SystemExit("Optimized Python disables validation; use python3 without -O")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare without writing")
    parser.add_argument("--sessions-root", type=Path, default=Path.home() / ".pi/agent/sessions")
    args = parser.parse_args()
    manifest = {"formatVersion": 1, "classification": "sanitized-real-excerpts", "cases": []}
    outputs = {}
    for name, rows, source in sources(args.sessions_root):
        cleaned = Sanitizer(rows).clean(rows)
        assert shape(rows) == shape(cleaned), "source and sanitized JSON shapes differ"
        payload = "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
                          for row in cleaned)
        outputs[f"{name}.jsonl"] = payload
        manifest["cases"].append({"name": name, "file": f"{name}.jsonl", "source": source,
                                  "rows": len(rows), "sha256": hashlib.sha256(payload.encode()).hexdigest()})
    outputs["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    if not args.check:
        DEST.mkdir(parents=True, exist_ok=True)
    for name, payload in outputs.items():
        path = DEST / name
        existing = path.read_text() if path.exists() else None
        if args.check:
            assert existing == payload, f"sanitized output differs: {name}"
        elif existing != payload:
            path.write_text(payload)
    print(f"{'CHECK' if args.check else 'EXPORT'}: 5 sanitized excerpts, 25 messages; source shapes match")


if __name__ == "__main__":
    main()
