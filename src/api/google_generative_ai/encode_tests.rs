use serde_json::{json, Map, Value};

use crate::model::{
    AssistantMessage, ContentBlock, MockError, StopReason, TextContent, ThinkingContent,
    ToolCall, Usage,
};

use super::encode::{encode_error, encode_sse};

fn assistant(content: Vec<ContentBlock>, model: &str, stop: StopReason) -> AssistantMessage {
    AssistantMessage {
        content,
        api: "google-generative-ai".to_string(),
        provider: "google".to_string(),
        model: model.to_string(),
        response_model: None,
        response_id: None,
        provider_thinking_level: None,
        thinking_level: None,
        usage: Usage::default(),
        stop_reason: stop,
        error_message: None,
        raw_stop_reason: None,
        end_turn: None,
        timestamp: 0,
        duration_ms: None,
    }
}

fn args(pairs: Value) -> Map<String, Value> {
    serde_json::from_value(pairs).unwrap()
}

fn parse_frame(frame: &str) -> Value {
    let payload = frame
        .strip_prefix("data: ")
        .and_then(|rest| rest.strip_suffix("\n\n"))
        .unwrap_or_else(|| panic!("frame not SSE data form: {frame:?}"));
    serde_json::from_str(payload).unwrap()
}

// usage and chunk shapes from google-raw-stop-reason.test.ts streamChunks
#[test]
fn encodes_text_only_message_to_two_frames() {
    let mut message = assistant(
        vec![ContentBlock::Text(TextContent {
            text: "hello".into(),
            text_signature: None,
        })],
        "gemini-2.5-flash",
        StopReason::Stop,
    );
    message.response_id = Some("resp_google".into());
    message.usage = Usage {
        input: 2,
        output: 1,
        cache_read: 0,
        cache_write: 0,
        cache_write_1h: None,
        reasoning: None,
        total_tokens: 3,
        cost: Default::default(),
    };
    let frames = encode_sse(&message).unwrap();
    assert_eq!(frames.len(), 2);
    assert_eq!(
        frames[0],
        "data: {\"responseId\":\"resp_google\",\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"hello\"}]}}]}\n\n"
    );
    assert_eq!(
        frames[1],
        "data: {\"candidates\":[{\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":2,\"candidatesTokenCount\":1,\"totalTokenCount\":3}}\n\n"
    );
}

#[test]
fn encodes_thinking_text_and_tool_call_per_block() {
    let thinking = ContentBlock::Thinking(ThinkingContent {
        thinking: "hmm".into(),
        thinking_signature: Some("AAAAAAAAAAAAAAAAAAAAAA==".into()),
        redacted: None,
    });
    let tool = ContentBlock::ToolCall(ToolCall {
        id: "call_1".into(),
        name: "bash".into(),
        arguments: args(json!({"command": "echo hi"})),
        thought_signature: None,
        namespace: None,
    });
    let mut message =
        assistant(vec![thinking, tool], "gemini-3-pro-preview", StopReason::ToolUse);
    message.usage = Usage {
        input: 2,
        output: 5,
        cache_read: 1,
        cache_write: 0,
        cache_write_1h: None,
        reasoning: Some(2),
        total_tokens: 8,
        cost: Default::default(),
    };
    let frames = encode_sse(&message).unwrap();
    assert_eq!(frames.len(), 3);
    let first = parse_frame(&frames[0]);
    let part = &first["candidates"][0]["content"]["parts"][0];
    assert_eq!(part["thought"], json!(true));
    assert_eq!(part["text"], json!("hmm"));
    assert_eq!(part["thoughtSignature"], json!("AAAAAAAAAAAAAAAAAAAAAA=="));
    let second = parse_frame(&frames[1]);
    let call = &second["candidates"][0]["content"]["parts"][0]["functionCall"];
    assert_eq!(call["id"], json!("call_1"));
    assert_eq!(call["name"], json!("bash"));
    assert_eq!(call["args"], json!({"command": "echo hi"}));
    let terminal = parse_frame(&frames[2]);
    assert_eq!(terminal["candidates"][0]["finishReason"], json!("STOP"));
    assert_eq!(
        terminal["usageMetadata"],
        json!({
            "promptTokenCount": 3,
            "cachedContentTokenCount": 1,
            "candidatesTokenCount": 3,
            "thoughtsTokenCount": 2,
            "totalTokenCount": 8,
        })
    );
}

#[test]
fn omits_tool_call_ids_for_pre_gemini3_models() {
    let tool = ContentBlock::ToolCall(ToolCall {
        id: "call_1".into(),
        name: "bash".into(),
        arguments: args(json!({})),
        thought_signature: None,
        namespace: None,
    });
    let message = assistant(vec![tool], "gemini-2.5-flash", StopReason::ToolUse);
    let frames = encode_sse(&message).unwrap();
    let call = &parse_frame(&frames[0])["candidates"][0]["content"]["parts"][0]["functionCall"];
    assert!(call.get("id").is_none());
}

// stop reason matrix from google-raw-stop-reason.test.ts
#[test]
fn encodes_stop_reason_variants() {
    let make = |stop: StopReason, raw: Option<&str>| {
        let mut message = assistant(vec![], "gemini-2.5-flash", stop);
        message.raw_stop_reason = raw.map(str::to_string);
        parse_frame(&encode_sse(&message).unwrap()[0])["candidates"][0]["finishReason"]
            .clone()
    };
    assert_eq!(make(StopReason::Stop, None), json!("STOP"));
    assert_eq!(make(StopReason::Length, None), json!("MAX_TOKENS"));
    assert_eq!(make(StopReason::Error, Some("SAFETY".into())), json!("SAFETY"));
    assert_eq!(make(StopReason::Error, None), json!("OTHER"));
}

#[test]
fn rejects_image_blocks() {
    let image = ContentBlock::Image(crate::model::ImageContent {
        data: "abc".into(),
        mime_type: "image/png".into(),
    });
    let message = assistant(vec![image], "gemini-3-pro-preview", StopReason::Stop);
    assert!(encode_sse(&message).is_err());
}

#[test]
fn encodes_mock_error_as_google_error_body() {
    let error = MockError {
        status: 429,
        code: "RESOURCE_EXHAUSTED".to_string(),
        message: "rate limited".to_string(),
    };
    let body = encode_error(&error);
    assert_eq!(
        body,
        vec!["{\"error\":{\"code\":429,\"message\":\"rate limited\",\"status\":\"RESOURCE_EXHAUSTED\"}}".to_string()]
    );
}
