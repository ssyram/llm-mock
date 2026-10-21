use serde_json::{json, Value};

use crate::model::{AssistantMessage, StopReason};

pub fn assistant(reason: StopReason) -> AssistantMessage {
    let mut message: AssistantMessage = serde_json::from_value(json!({
        "role": "assistant", "api": "pi-messages", "provider": "mock", "model": "test-model",
        "content": [
            {"type":"text", "text":"hello\n世界", "textSignature":"text-sig"},
            {"type":"thinking", "thinking":"reason\n\"quoted\"", "thinkingSignature":"thought-sig", "redacted":true},
            {"type":"toolCall", "id":"call-1", "name":"read", "arguments":{"path":"文件\n.txt","nested":{"x":[1,true]}}, "thoughtSignature":"tool-sig", "namespace":"files"}
        ],
        "usage":{"input":11,"output":7,"cacheRead":3,"cacheWrite":2,"cacheWrite1h":1,"reasoning":4,"totalTokens":23,
            "cost":{"input":0.11,"output":0.07,"cacheRead":0.03,"cacheWrite":0.02,"total":0.23}},
        "stopReason":"stop", "responseId":"response-1", "providerThinkingLevel":"high",
        "timestamp":1700000000123_u64, "durationMs":200, "responseModel":"concrete-model",
        "thinkingLevel":"medium", "rawStopReason":"end_turn", "endTurn":true
    })).unwrap();
    message.stop_reason = reason;
    message
}

pub fn request() -> Value {
    let mut history = serde_json::to_value(assistant(StopReason::ToolUse)).unwrap();
    history["role"] = json!("assistant");
    history["diagnostics"] = json!([{ "type": "fixture", "timestamp": 100, "details": {"retained":true} }]);
    history["deferred"] = json!({"id":"runtime-handle","provider":"mock","modelId":"test-model","api":"pi-messages"});
    let usage = history["usage"].clone();
    json!({
        "model":"test-model",
        "context":{"messages":[
            {"role":"system","content":"base", "timestamp":101,
                "sections":{"keep":"section","remove":null},
                "toolsAdded":[{"name":"read","description":"read file","parameters":{"type":"object"},"constrainedSampling":false}]},
            {"role":"user","content":[{"type":"text","text":"hi"},{"type":"image","data":"YWJj","mimeType":"image/png"}],"timestamp":102},
            {"role":"system","content":[{"type":"text","text":"update","textSignature":"system-sig"}],"toolsRemoved":[{"name":"old"}],"timestamp":103},
            history,
            {"role":"toolResult","toolCallId":"call-1","toolName":"read", "isError":false,
                "content":[{"type":"text","text":"result"},{"type":"image","data":"YWJj","mimeType":"image/jpeg"}],
                "timestamp":105,"durationMs":12,"details":{"record":true},"usage":usage,"nestedCalls":{"calls":[],"complete":true}}
        ]},
        "options":{"maxTokens":128,"temperature":0.25,"reasoning":"high","sessionId":"session-1","toolChoice":"auto","cacheRetention":"long"}
    })
}

pub fn event(frame: &str) -> Value {
    let json = frame
        .strip_prefix("data: ")
        .unwrap()
        .strip_suffix("\n\n")
        .unwrap();
    assert!(!json.contains('\n'));
    serde_json::from_str(json).unwrap()
}
