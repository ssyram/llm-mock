use super::{decode::decode_request, encode::encode_sse};
use crate::model::*;
use serde_json::json;

#[test]
fn decodes_mistral_chat_completion_request_and_bearer() {
    let body = json!({"model":"mistral-large-latest","stream":true,"messages":[{"role":"user","content":"hello"},{"role":"assistant","tool_calls":[{"id":"toolcall1","type":"function","function":{"name":"lookup","arguments":"{\"q\":\"x\"}"}}]}],"max_tokens":128,"prompt_cache_key":"session","tools":[{"type":"function","function":{"name":"lookup","description":"search","parameters":{"type":"object"}}}]});
    let headers = vec![
        ("authorization".into(), "Bearer mk-test".into()),
        ("x-affinity".into(), "fallback".into()),
    ];
    let (request, info) = decode_request(&body, &headers).unwrap();
    assert_eq!(request.model, "mistral-large-latest");
    assert_eq!(request.options.max_tokens, Some(128));
    assert_eq!(request.options.session_id.as_deref(), Some("session"));
    assert_eq!(info.key_id, "mk-test");
    assert_eq!(request.context.messages.len(), 3);
}

#[test]
fn decodes_mistral_assistant_same_model_thinking_chunks() {
    let body = json!({"model":"mistral-large-latest","messages":[{
        "role":"assistant","prefix":false,"content":[
            {"type":"thinking","thinking":[{"type":"text","text":"first thought"}]},
            {"type":"thinking","thinking":[{"type":"text","text":"second thought"}]},
            {"type":"text","text":"done"}
        ]
    }]});
    let (request, _) = decode_request(&body, &[]).unwrap();
    assert_eq!(request.context.messages.len(), 1);
    let Message::Assistant(message) = &request.context.messages[0] else {
        panic!("expected assistant message");
    };
    assert_eq!(
        serde_json::to_value(&message.content).unwrap(),
        json!([
            {"type":"thinking","thinking":"first thought"},
            {"type":"thinking","thinking":"second thought"},
            {"type":"text","text":"done"}
        ])
    );
    assert_eq!(message.api, "mistral-conversations");
    assert_eq!(message.provider, "mistral");
    assert_eq!(message.model, "mistral-large-latest");
}

#[test]
fn decodes_mistral_assistant_content_chunk_order_and_nested_thinking() {
    let body = json!({"model":"mistral-large-latest","messages":[{
        "role":"assistant","content":[
            {"type":"text","text":"first"},
            {"type":"text","text":"second"},
            {"type":"thinking","thinking":[
                {"type":"text","text":"think "}, {"type":"text","text":"more"}
            ]},
            {"type":"text","text":"last"}
        ],"tool_calls":[{"id":"toolcall1","type":"function","function":{
            "name":"lookup","arguments":"{\"q\":\"x\"}"
        }}]
    }]});
    let (request, _) = decode_request(&body, &[]).unwrap();
    let Message::Assistant(message) = &request.context.messages[0] else {
        panic!("expected assistant message");
    };
    assert_eq!(
        serde_json::to_value(&message.content).unwrap(),
        json!([
            {"type":"text","text":"first"},
            {"type":"text","text":"second"},
            {"type":"thinking","thinking":"think more"},
            {"type":"text","text":"last"},
            {"type":"toolCall","id":"toolcall1","name":"lookup","arguments":{"q":"x"}}
        ])
    );
}

#[test]
fn decodes_mistral_assistant_thinking_only_chunks() {
    let body = json!({"model":"mistral-large-latest","messages":[{
        "role":"assistant","content":[
            {"type":"thinking","thinking":[{"type":"text","text":"only thought"}]}
        ]
    }]});
    let (request, _) = decode_request(&body, &[]).unwrap();
    assert_eq!(request.context.messages.len(), 1);
    let Message::Assistant(message) = &request.context.messages[0] else {
        panic!("expected assistant message");
    };
    assert_eq!(
        serde_json::to_value(&message.content).unwrap(),
        json!([
            {"type":"thinking","thinking":"only thought"}
        ])
    );
}

#[test]
fn decodes_mistral_assistant_string_and_top_level_reasoning() {
    for field in ["reasoning_content", "reasoning"] {
        let mut body = json!({"model":"mistral-large-latest","messages":[{
            "role":"assistant","content":"answer"
        }]});
        body["messages"][0][field] = json!("legacy thought");
        let (request, _) = decode_request(&body, &[]).unwrap();
        let Message::Assistant(message) = &request.context.messages[0] else {
            panic!("expected assistant message");
        };
        assert_eq!(
            serde_json::to_value(&message.content).unwrap(),
            json!([
                {"type":"thinking","thinking":"legacy thought"},
                {"type":"text","text":"answer"}
            ])
        );
    }
}

#[test]
fn encodes_mistral_thinking_in_content_chunks() {
    let message: AssistantMessage = serde_json::from_value(json!({
        "content": [
            {"type":"thinking","thinking":"consider this"},
            {"type":"text","text":"answer"}
        ],
        "api":"mistral-conversations", "provider":"mistral", "model":"mistral-large-latest",
        "usage":Usage::default(), "stopReason":"stop", "timestamp":0
    }))
    .unwrap();
    let frames = encode_sse(&message).unwrap();
    let first: serde_json::Value =
        serde_json::from_str(frames[0].trim().strip_prefix("data: ").unwrap()).unwrap();
    assert_eq!(
        first["choices"][0]["delta"],
        json!({
            "content":[{"type":"thinking","thinking":[{"type":"text","text":"consider this"}]}]
        })
    );
    assert!(frames[1].contains("\"content\":\"answer\""));
}

#[test]
fn encodes_mistral_sse_completion() {
    let message = AssistantMessage {
        record: Default::default(),
        content: vec![ContentBlock::Text(TextContent {
            text: "hello".into(),
            text_signature: None,
        })],
        api: "mistral-conversations".into(),
        provider: "mistral".into(),
        model: "mistral-large-latest".into(),
        response_model: None,
        response_id: None,
        provider_thinking_level: None,
        thinking_level: None,
        usage: Usage::default(),
        stop_reason: StopReason::Stop,
        error_message: None,
        raw_stop_reason: None,
        end_turn: None,
        timestamp: 0,
        duration_ms: None,
    };
    let frames = encode_sse(&message).unwrap();
    assert_eq!(frames.len(), 4);
    assert!(frames[0].contains("\"content\":\"hello\""));
    assert!(frames[1].contains("\"finish_reason\":\"stop\""));
    assert_eq!(frames[3], "data: [DONE]\n\n");
}
