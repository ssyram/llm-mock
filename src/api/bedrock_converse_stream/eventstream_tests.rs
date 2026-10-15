use super::{
    encode::{encode_events, encode_eventstream},
    eventstream::crc32,
    tests::sample_message,
};
use crate::model::{ContentBlock, StopReason, ThinkingContent, ToolCall};
use serde_json::{json, Value};

fn reference_crc(bytes: &[u8]) -> u32 {
    let mut value = u32::MAX;
    for byte in bytes {
        value ^= u32::from(*byte);
        for _ in 0..8 {
            value = (value >> 1) ^ (0xedb8_8320 & 0u32.wrapping_sub(value & 1));
        }
    }
    !value
}

fn u32_at(bytes: &[u8], offset: usize) -> usize {
    u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize
}

pub(super) fn decode_frames(mut bytes: &[u8]) -> Vec<Value> {
    let mut events = Vec::new();
    while !bytes.is_empty() {
        let length = u32_at(bytes, 0);
        let headers_length = u32_at(bytes, 4);
        assert!(length >= 16 + headers_length);
        let frame = &bytes[..length];
        assert_eq!(u32_at(frame, 8) as u32, reference_crc(&frame[..8]));
        assert_eq!(
            u32_at(frame, length - 4) as u32,
            reference_crc(&frame[..length - 4])
        );
        let mut headers = &frame[12..12 + headers_length];
        let mut parsed = std::collections::BTreeMap::new();
        while !headers.is_empty() {
            let name_length = headers[0] as usize;
            let name = std::str::from_utf8(&headers[1..1 + name_length]).unwrap();
            assert_eq!(headers[1 + name_length], 7);
            let size = u16::from_be_bytes(
                headers[2 + name_length..4 + name_length]
                    .try_into()
                    .unwrap(),
            ) as usize;
            let value =
                std::str::from_utf8(&headers[4 + name_length..4 + name_length + size]).unwrap();
            parsed.insert(name, value);
            headers = &headers[4 + name_length + size..];
        }
        assert_eq!(parsed[":message-type"], "event");
        assert_eq!(parsed[":content-type"], "application/json");
        let payload: Value =
            serde_json::from_slice(&frame[12 + headers_length..length - 4]).unwrap();
        assert!(payload.get(parsed[":event-type"]).is_none());
        events.push(json!({parsed[":event-type"]: payload}));
        bytes = &bytes[length..];
    }
    events
}

#[test]
fn crc32_matches_ieee_known_vectors() {
    assert_eq!(crc32(b""), 0);
    assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
    let all_bytes: Vec<u8> = (0..=255).collect();
    assert_eq!(crc32(&all_bytes), reference_crc(&all_bytes));
}

#[test]
fn eventstream_frames_validate_lengths_crcs_headers_and_payloads() {
    let mut message = sample_message();
    if let ContentBlock::Text(text) = &mut message.content[0] {
        text.text = "hello 世界".into();
    }
    let bytes = encode_eventstream(&message).unwrap();
    assert_eq!(decode_frames(&bytes), encode_events(&message).unwrap());
}

#[test]
fn events_match_pi_ai_sdk_reasoning_tool_and_usage_shapes() {
    let mut message = sample_message();
    message.content = vec![
        ContentBlock::Thinking(ThinkingContent {
            thinking: "plan".into(),
            thinking_signature: Some("sig".into()),
            redacted: None,
        }),
        ContentBlock::Thinking(ThinkingContent {
            thinking: "[Reasoning redacted]".into(),
            thinking_signature: Some("AQID".into()),
            redacted: Some(true),
        }),
        ContentBlock::ToolCall(ToolCall {
            id: "call-1".into(),
            name: "lookup".into(),
            arguments: json!({"q":"x"}).as_object().unwrap().clone(),
            thought_signature: None,
            namespace: None,
        }),
    ];
    message.stop_reason = StopReason::ToolUse;
    message.usage.input = 11;
    message.usage.output = 7;
    message.usage.cache_read = 3;
    message.usage.cache_write = 2;
    message.usage.cache_write_1h = Some(1);
    message.usage.total_tokens = 18;
    let events = decode_frames(&encode_eventstream(&message).unwrap());
    assert_eq!(
        events[1]["contentBlockDelta"]["delta"],
        json!({"reasoningContent":{"text":"plan"}})
    );
    assert_eq!(
        events[2]["contentBlockDelta"]["delta"],
        json!({"reasoningContent":{"signature":"sig"}})
    );
    assert_eq!(
        events[4]["contentBlockDelta"]["delta"],
        json!({"reasoningContent":{"redactedContent":"AQID"}})
    );
    assert_eq!(
        events[6]["contentBlockStart"]["start"]["toolUse"],
        json!({"toolUseId":"call-1","name":"lookup"})
    );
    assert_eq!(
        events[7]["contentBlockDelta"]["delta"]["toolUse"]["input"],
        "{\"q\":\"x\"}"
    );
    assert_eq!(events[9]["messageStop"]["stopReason"], "tool_use");
    assert_eq!(
        events[10]["metadata"]["usage"],
        json!({"inputTokens":11,"outputTokens":7,"totalTokens":18,"cacheReadInputTokens":3,"cacheWriteInputTokens":2,"cacheDetails":[{"inputTokens":1,"ttl":"1h"}]})
    );
}

#[test]
fn pending_and_image_responses_cannot_be_encoded() {
    let mut message = sample_message();
    message.stop_reason = StopReason::Pending;
    assert!(encode_eventstream(&message)
        .unwrap_err()
        .contains("pending"));
    message.stop_reason = StopReason::Stop;
    message.content = vec![ContentBlock::Image(crate::model::ImageContent {
        data: "AQID".into(),
        mime_type: "image/png".into(),
    })];
    assert!(encode_eventstream(&message).unwrap_err().contains("image"));
}
