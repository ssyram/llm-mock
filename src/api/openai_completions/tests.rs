use serde_json::{json, Value};

use super::decode::decode;
use super::encode::{encode, encode_error};
use crate::model::*;

fn parse_frame(frame: &str) -> Value {
    let body = frame.strip_prefix("data: ").and_then(|b| b.strip_suffix("\n\n")).expect("sse frame shape");
    serde_json::from_str(body).expect("frame json")
}

fn assistant(content: Vec<ContentBlock>, stop: StopReason, usage: Usage) -> AssistantMessage {
    AssistantMessage {
        record: Default::default(),
        content,
        api: "openai-completions".into(),
        provider: String::new(),
        model: "gpt-4o-mini".into(),
        usage,
        stop_reason: stop,
        timestamp: 0,
        response_model: None,
        response_id: None,
        provider_thinking_level: None,
        thinking_level: None,
        error_message: None,
        raw_stop_reason: None,
        end_turn: None,
        duration_ms: None,
    }
}

#[test]
fn decodes_full_tool_roundtrip_request() {
    let body = json!({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "Read README"},
            {"role": "assistant", "content": null, "tool_calls": [
                {"id": "call_1", "type": "function", "function": {"name": "read", "arguments": "{\"path\":\"README.md\"}"}}
            ]},
            {"role": "tool", "content": "# Title", "tool_call_id": "call_1"},
            {"role": "assistant", "content": "ok"}
        ],
        "stream": true,
        "stream_options": {"include_usage": true},
        "store": false,
        "prompt_cache_key": "session-123",
        "max_completion_tokens": 1024,
        "temperature": 0.5,
        "tools": [{"type": "function", "function": {
            "name": "read", "description": "Read a file",
            "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
            "strict": false
        }}],
        "tool_choice": "required"
    });
    let decoded = decode(&body, None).expect("decode ok");
    assert_eq!(decoded.model, "gpt-4o-mini");
    assert_eq!(decoded.options.max_tokens, Some(1024));
    assert_eq!(decoded.options.temperature, Some(0.5));
    assert_eq!(decoded.options.session_id.as_deref(), Some("session-123"));
    assert_eq!(decoded.options.tool_choice.as_ref().and_then(serde_json::Value::as_str), Some("required"));
    let messages = &decoded.context.messages;
    assert_eq!(messages.len(), 5);
    let Message::System(system) = &messages[0] else { panic!("system") };
    assert_eq!(system.content, SystemContent::Text("You are helpful.".into()));
    let tools = system.tools_added.as_ref().expect("tools attached");
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].name, "read");
    assert_eq!(tools[0].parameters["required"][0], "path");
    assert_eq!(messages[1], Message::User(UserMessage { content: UserContent::Text("Read README".into()), timestamp: 0 }));
    let Message::Assistant(call) = &messages[2] else { panic!("assistant") };
    let ContentBlock::ToolCall(tc) = &call.content[0] else { panic!("toolCall") };
    assert_eq!((tc.id.as_str(), tc.name.as_str()), ("call_1", "read"));
    assert_eq!(Value::Object(tc.arguments.clone()), json!({"path": "README.md"}));
    let Message::ToolResult(tr) = &messages[3] else { panic!("toolResult") };
    assert_eq!((tr.tool_call_id.as_str(), tr.tool_name.as_str()), ("call_1", ""));
    assert_eq!(tr.content[0], UserBlock::Text(TextContent { text: "# Title".into(), text_signature: None }));
    assert!(!tr.is_error);
    assert_eq!(call.stop_reason, StopReason::Stop);
    assert_eq!(messages[4], Message::Assistant(assistant(vec![ContentBlock::Text(TextContent { text: "ok".into(), text_signature: None })], StopReason::Stop, Usage::default())));
}

#[test]
fn decodes_user_images_and_rejects_non_data_urls() {
    let body = json!({
        "model": "m",
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "look"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,ZmFrZQ=="}}
        ]}]
    });
    let decoded = decode(&body, None).expect("decode ok");
    let Message::User(user) = &decoded.context.messages[0] else { panic!("user") };
    let UserContent::Blocks(blocks) = &user.content else { panic!("blocks") };
    assert_eq!(blocks[1], UserBlock::Image(ImageContent { mime_type: "image/png".into(), data: "ZmFrZQ==".into() }));
    let bad = json!({"model": "m", "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "https://example.com/x.png"}}]}]});
    assert!(decode(&bad, None).is_err());
}

#[test]
fn decodes_reasoning_details_and_empty_assistant() {
    let body = json!({"model": "m", "messages": [
        {"role": "assistant", "content": null, "reasoning_details": [
            {"type": "reasoning.encrypted", "id": "call_1", "data": "encrypted-signature"}
        ], "tool_calls": [
            {"id": "call_1", "type": "function", "function": {"name": "read", "arguments": "{\"path\":\"README.md\"}"}}
        ]},
        {"role": "assistant", "content": null}
    ]});
    let decoded = decode(&body, None).expect("decode ok");
    assert_eq!(decoded.context.messages.len(), 1);    let Message::Assistant(a) = &decoded.context.messages[0] else { panic!("assistant") };
    let ContentBlock::Thinking(t) = &a.content[0] else { panic!("thinking") };
    assert_eq!(t.thinking, "");
    assert_eq!(serde_json::from_str::<serde_json::Value>(t.thinking_signature.as_deref().unwrap()).unwrap(), json!([{"type":"reasoning.encrypted","id":"call_1","data":"encrypted-signature"}]));
    let field_only = decode(&json!({"model": "m", "messages": [
        {"role": "assistant", "content": "answer", "reasoning_content": "hmm"}
    ]}), None).unwrap();
    let Message::Assistant(a) = &field_only.context.messages[0] else { panic!("assistant") };
    let ContentBlock::Thinking(t) = &a.content[0] else { panic!("thinking") };
    assert_eq!((t.thinking.as_str(), t.thinking_signature.as_deref()), ("hmm", Some("reasoning_content")));
    assert_eq!(a.content[1], ContentBlock::Text(TextContent { text: "answer".into(), text_signature: None }));
}

#[test]
fn encodes_full_stream_matching_parser_expectations() {
    let usage = Usage { input: 8, output: 5, cache_read: 2, cache_write: 0, cache_write_1h: None, reasoning: Some(3), total_tokens: 15, cost: Cost::default() };
    let msg = assistant(vec![
        ContentBlock::Thinking(ThinkingContent { thinking: "let me think".into(), thinking_signature: Some("reasoning_content".into()), redacted: None }),
        ContentBlock::Text(TextContent { text: "answer".into(), text_signature: None }),
        ContentBlock::ToolCall(ToolCall { id: "call_1".into(), name: "read".into(), arguments: json!({"path": "README.md"}).as_object().unwrap().clone(), thought_signature: None, namespace: None }),
    ], StopReason::ToolUse, usage);
    let frames = encode(&msg).expect("encode ok");
    assert_eq!(frames.len(), 6);
    let thinking = parse_frame(&frames[0]);
    assert_eq!(thinking["choices"][0]["delta"]["reasoning_content"], "let me think");
    let text = parse_frame(&frames[1]);
    assert_eq!(text["choices"][0]["delta"]["content"], "answer");
    let call = parse_frame(&frames[2]);
    assert_eq!(call["choices"][0]["delta"]["tool_calls"][0]["index"], 0);
    assert_eq!(call["choices"][0]["delta"]["tool_calls"][0]["id"], "call_1");
    assert_eq!(call["choices"][0]["delta"]["tool_calls"][0]["function"]["arguments"], "{\"path\":\"README.md\"}");
    let finish = parse_frame(&frames[3]);
    assert_eq!(finish["choices"][0]["finish_reason"], "tool_calls");
    assert!(finish["choices"][0]["delta"].as_object().unwrap().is_empty());
    let usage_chunk = parse_frame(&frames[4]);
    assert_eq!(usage_chunk["choices"].as_array().unwrap().len(), 0);
    assert_eq!(usage_chunk["usage"]["prompt_tokens"], 10);
    assert_eq!(usage_chunk["usage"]["completion_tokens"], 5);
    assert_eq!(usage_chunk["usage"]["prompt_tokens_details"]["cached_tokens"], 2);
    assert_eq!(usage_chunk["usage"]["completion_tokens_details"]["reasoning_tokens"], 3);
    assert!(usage_chunk["usage"]["prompt_tokens_details"].get("cache_write_tokens").is_none());
    assert_eq!(frames[5], "data: [DONE]\n\n");
}

#[test]
fn encodes_response_metadata_and_details_signature() {
    let mut msg = assistant(vec![ContentBlock::Thinking(ThinkingContent { thinking: "reasoned".into(), thinking_signature: Some(r#"[{"type":"reasoning.text","text":"reasoned"}]"#.into()), redacted: None })], StopReason::Stop, Usage::default());
    msg.response_id = Some("chatcmpl-test".into());
    msg.response_model = Some("routed/model".into());
    let frames = encode(&msg).expect("encode ok");
    let first = parse_frame(&frames[0]);
    assert_eq!(first["id"], "chatcmpl-test");
    assert_eq!(first["model"], "routed/model");
    assert_eq!(first["choices"][0]["delta"]["reasoning_content"], "reasoned");
    let details = parse_frame(&frames[1]);
    assert_eq!(details["choices"][0]["delta"]["reasoning_details"][0]["type"], "reasoning.text");
    assert_eq!(parse_frame(&frames[2])["choices"][0]["finish_reason"], "stop");
}

#[test]
fn encodes_error_forms() {
    let mut msg = assistant(vec![], StopReason::Error, Usage::default());
    msg.error_message = Some("Provider finish_reason: content_filter".into());
    let frames = encode(&msg).expect("encode ok");
    assert_eq!(parse_frame(&frames[0])["choices"][0]["finish_reason"], "content_filter");
    let body: Value = serde_json::from_str(&encode_error(&MockError {
        status: 429,
        code: "rate_limit_exceeded".into(),
        message: "Too many requests".into(),
    })).unwrap();
    assert_eq!(body["error"]["message"], "Too many requests");
    assert_eq!(body["error"]["code"], "rate_limit_exceeded");
    assert_eq!(body["error"]["type"], "rate_limit_exceeded");
}

#[test]
fn encode_rejects_unrepresentable_content() {
    let img = assistant(vec![ContentBlock::Image(ImageContent { data: "Zg==".into(), mime_type: "image/png".into() })], StopReason::Stop, Usage::default());
    assert!(encode(&img).is_err());
    let pending = assistant(vec![], StopReason::Pending, Usage::default());
    assert!(encode(&pending).is_err());
}
