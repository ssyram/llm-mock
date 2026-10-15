use super::{
    decode::{decode_request, decode_request_info},
    encode::encode_sse,
    vendor::model_from_path,
};
use crate::model::*;
use serde_json::json;

#[test]
fn decodes_converse_request_and_sigv4_key_id() {
    let body = json!({"messages":[{"role":"user","content":[{"text":"hello"}]}],"system":[{"text":"guide"}],"inferenceConfig":{"maxTokens":64,"temperature":0.2},"toolConfig":{"tools":[{"toolSpec":{"name":"lookup","inputSchema":{"json":{"type":"object"}}}}],"toolChoice":{"tool":{"name":"lookup"}}}});
    let request = decode_request("/model/anthropic.claude-v2/converse-stream", &body).unwrap();
    assert_eq!(request.model, "anthropic.claude-v2");
    assert_eq!(request.options.max_tokens, Some(64));
    assert_eq!(request.options.tool_choice, Some(json!({"type": "tool", "name": "lookup"})));
    assert_eq!(request.context.messages.len(), 2);
    let headers = vec![("authorization".into(), "AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20260101/us-east-1/bedrock/aws4_request, SignedHeaders=host, Signature=fake".into())];
    assert_eq!(
        decode_request_info(
            "/model/anthropic.claude-v2/converse-stream",
            &headers,
            &body
        )
        .unwrap()
        .key_id,
        "AKIAEXAMPLE"
    );
    assert_eq!(
        model_from_path(
            "/model/arn%3Aaws%3Abedrock%3Aus-east-1%3A123%3Ainference-profile%2Fmy/converse-stream"
        )
        .unwrap(),
        "arn:aws:bedrock:us-east-1:123:inference-profile/my"
    );
}

pub(super) fn sample_message() -> AssistantMessage {
    AssistantMessage {
        content: vec![ContentBlock::Text(TextContent {
            text: "hello".into(),
            text_signature: None,
        })],
        api: "bedrock-converse-stream".into(),
        provider: "amazon-bedrock".into(),
        model: "m".into(),
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
    }
}

#[test]
fn encodes_bedrock_event_sequence() {
    let frames = encode_sse(&sample_message()).unwrap();
    assert_eq!(frames.len(), 5);
    assert!(frames[0].contains("messageStart"));
    assert!(frames[1].contains("contentBlockDelta"));
    assert!(frames[2].contains("contentBlockStop"));
    assert!(frames[3].contains("messageStop"));
    assert!(frames[4].contains("metadata"));
}
