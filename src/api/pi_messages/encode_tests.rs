use serde_json::{json, Value};

use super::encode::{encode, encode_error};
use super::test_fixture::{assistant, event};
use crate::model::*;

#[test]
fn emits_complete_ordered_frames_with_signatures_and_json_tool_delta() {
    let message = assistant(StopReason::ToolUse);
    let frames = encode(&message).unwrap();
    let events: Vec<Value> = frames.iter().map(|frame| event(frame)).collect();
    assert_eq!(
        events
            .iter()
            .map(|event| event["type"].as_str().unwrap())
            .collect::<Vec<_>>(),
        [
            "start",
            "text_start",
            "text_delta",
            "text_end",
            "thinking_start",
            "thinking_delta",
            "thinking_end",
            "toolcall_start",
            "toolcall_delta",
            "toolcall_end",
            "done"
        ]
    );
    assert_eq!(events[0], json!({"type":"start"}));
    assert_eq!(events[1], json!({"type":"text_start","contentIndex":0}));
    assert_eq!(events[2]["delta"], "hello\n世界");
    assert_eq!(
        events[3],
        json!({"type":"text_end","contentIndex":0,"content":"hello\n世界","contentSignature":"text-sig"})
    );
    assert_eq!(events[4]["contentIndex"], 1);
    assert_eq!(events[5]["delta"], "reason\n\"quoted\"");
    assert_eq!(events[6]["contentSignature"], "thought-sig");
    assert_eq!(events[6]["redacted"], true);
    assert_eq!(
        events[7],
        json!({"type":"toolcall_start","contentIndex":2,"id":"call-1","toolName":"read"})
    );
    let arguments: Value = serde_json::from_str(events[8]["delta"].as_str().unwrap()).unwrap();
    assert_eq!(
        arguments,
        json!({"path":"文件\n.txt","nested":{"x":[1,true]}})
    );
    assert_eq!(events[9]["toolCall"]["arguments"], arguments);
    assert_eq!(events[9]["toolCall"]["type"], "toolCall");
    assert_eq!(events[9]["toolCall"]["thoughtSignature"], "tool-sig");
    assert_eq!(events[9]["toolCall"]["namespace"], "files");
    assert_eq!(
        events[10],
        json!({"type":"done","reason":"toolUse","usage":message.usage,
        "responseId":"response-1","providerThinkingLevel":"high"})
    );
    assert!(!frames.iter().any(|frame| frame.contains("[DONE]")));
}

#[test]
fn all_final_reasons_have_exactly_one_correct_terminal_frame() {
    for (reason, terminal, wire_reason) in [
        (StopReason::Stop, "done", "stop"),
        (StopReason::Length, "done", "length"),
        (StopReason::ToolUse, "done", "toolUse"),
        (StopReason::Error, "error", "error"),
        (StopReason::Aborted, "error", "aborted"),
    ] {
        let mut message = assistant(reason);
        message.error_message = Some("failure\nmessage".into());
        let events: Vec<Value> = encode(&message)
            .unwrap()
            .iter()
            .map(|frame| event(frame))
            .collect();
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event["type"].as_str(), Some("done" | "error")))
                .count(),
            1
        );
        let last = events.last().unwrap();
        assert_eq!(last["type"], terminal);
        assert_eq!(last["reason"], wire_reason);
        assert_eq!(last["usage"], serde_json::to_value(message.usage).unwrap());
        assert_eq!(last["responseId"], "response-1");
        assert_eq!(last["providerThinkingLevel"], "high");
        if terminal == "error" {
            assert_eq!(last["errorMessage"], "failure\nmessage");
        } else {
            assert!(last.get("errorMessage").is_none());
        }
    }
}

#[test]
fn supports_empty_blocks_and_omits_absent_optional_fields() {
    let mut message = assistant(StopReason::Stop);
    message.content = vec![
        ContentBlock::Text(TextContent {
            text: String::new(),
            text_signature: None,
        }),
        ContentBlock::Thinking(ThinkingContent {
            thinking: String::new(),
            thinking_signature: None,
            redacted: Some(false),
        }),
        ContentBlock::ToolCall(ToolCall {
            id: "empty".into(),
            name: "noop".into(),
            arguments: Default::default(),
            thought_signature: None,
            namespace: None,
        }),
    ];
    message.response_id = None;
    message.provider_thinking_level = None;
    let events: Vec<Value> = encode(&message)
        .unwrap()
        .iter()
        .map(|frame| event(frame))
        .collect();
    assert_eq!(events[2]["delta"], "");
    assert!(events[3].get("contentSignature").is_none());
    assert_eq!(events[5]["delta"], "");
    assert!(events[6].get("contentSignature").is_none());
    assert_eq!(events[6]["redacted"], false);
    assert_eq!(events[8]["delta"], "{}");
    assert!(events[9]["toolCall"].get("thoughtSignature").is_none());
    assert!(events[10].get("responseId").is_none());
    assert!(events[10].get("providerThinkingLevel").is_none());
    message.content.clear();
    assert_eq!(encode(&message).unwrap().len(), 2);
    message.stop_reason = StopReason::Error;
    assert!(event(encode(&message).unwrap().last().unwrap())
        .get("errorMessage")
        .is_none());
}

#[test]
fn rejects_nonterminal_reasons_and_assistant_images() {
    for reason in [StopReason::Pending, StopReason::Deferred] {
        assert!(encode(&assistant(reason)).is_err());
    }
    let mut message = assistant(StopReason::Stop);
    message.content.push(ContentBlock::Image(ImageContent {
        data: "YWJj".into(),
        mime_type: "image/png".into(),
    }));
    assert!(encode(&message).is_err());
}

#[test]
fn encodes_non_sse_http_error_body() {
    let error = MockError {
        status: 429,
        code: "rate_limited".into(),
        message: "try later".into(),
    };
    let body: Value = serde_json::from_str(&encode_error(&error)).unwrap();
    assert_eq!(
        body,
        json!({"error":{"code":"rate_limited","message":"try later"}})
    );
}
