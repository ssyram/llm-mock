use super::decode::decode_request;
use crate::model::{Message, UserBlock};
use serde_json::{json, Value};

#[test]
fn reasoning_preserves_each_extension_envelope_and_absence() {
    let variants = [
        json!({"thinking":{"type":"enabled","budget_tokens":1024}}),
        json!({"thinking":{"type":"adaptive","display":"summarized","block_binding":{"prefix_mismatch_behavior":"drop_block"}},"output_config":{"effort":"high"},"anthropic_beta":["thinking-binding-controls-2026-08-01"]}),
        json!({"thinking":{"type":"enabled","budget_tokens":2048},"anthropic_beta":["interleaved-thinking-2025-05-14"]}),
        json!({"reasoning_effort":"medium"}),
        json!({"reasoning":{"effort":"xhigh"}}),
    ];
    for fields in variants {
        let request = decode_request(
            "/model/m/converse-stream",
            &json!({
                "messages":[],"additionalModelRequestFields":fields
            }),
        )
        .unwrap();
        let recovered: Value =
            serde_json::from_str(request.options.reasoning.as_deref().unwrap()).unwrap();
        assert_eq!(recovered, fields);
    }
    for body in [
        json!({"messages":[]}),
        json!({"messages":[],"additionalModelRequestFields":{}}),
    ] {
        assert_eq!(
            decode_request("/model/m/converse-stream", &body)
                .unwrap()
                .options
                .reasoning,
            None
        );
    }
}

#[test]
fn tool_result_preserves_image_bytes_mime_order_and_error_status() {
    let image = json!({"image":{"format":"jpeg","source":{"bytes":"AQID"}}});
    for (parts, error) in [
        (json!([{"text":"before"},image,{"text":"after"}]), true),
        (json!([image]), false),
        (json!([{"text":"text only"}]), false),
    ] {
        let request = decode_request("/model/m/converse-stream", &json!({"messages":[{
            "role":"user","content":[{"toolResult":{"toolUseId":"call","status":if error {"error"} else {"success"},"content":parts}}]
        }]})).unwrap();
        let Message::ToolResult(result) = &request.context.messages[0] else {
            panic!("tool result")
        };
        assert_eq!(result.tool_call_id, "call");
        assert_eq!(result.is_error, error);
        assert_eq!(result.content.len(), parts.as_array().unwrap().len());
        for (block, part) in result.content.iter().zip(parts.as_array().unwrap()) {
            match block {
                UserBlock::Text(t) => assert_eq!(t.text, part["text"].as_str().unwrap()),
                UserBlock::Image(i) => {
                    assert_eq!(i.data, "AQID");
                    assert_eq!(i.mime_type, "image/jpeg");
                }
            }
        }
    }
}

#[test]
fn tool_result_rejects_malformed_image_like_user_image() {
    let error = decode_request("/model/m/converse-stream", &json!({"messages":[{
        "role":"user","content":[{"toolResult":{"toolUseId":"call","content":[{"image":{"format":"png","source":{}}}]}}]
    }]})).unwrap_err();
    assert_eq!(error, "Bedrock image source.bytes must be base64 text");
}
