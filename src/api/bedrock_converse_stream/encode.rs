use crate::api::encode_thinking::{project_content, SignatureDomain};
use super::{eventstream::encode_frame, vendor::sse_event};
use crate::model::*;
use serde_json::{json, Value};

pub fn encode_events(message: &AssistantMessage) -> Result<Vec<Value>, String> {
    if message.stop_reason == StopReason::Pending {
        return Err("cannot encode pending Bedrock response".into());
    }
    let mut events = vec![json!({"messageStart":{"role":"assistant"}})];
    let content = project_content(&message.content, SignatureDomain::Opaque);
    for (index, block) in content.iter().enumerate() {
        match block {
            ContentBlock::Text(text) => events.push(delta(index, json!({"text":text.text}))),
            ContentBlock::Thinking(thinking) if thinking.redacted == Some(true) => {
                events.push(delta(index, json!({"reasoningContent":{"redactedContent":thinking.thinking_signature.as_deref().unwrap_or("")}})));
            }
            ContentBlock::Thinking(thinking) => {
                events.push(delta(
                    index,
                    json!({"reasoningContent":{"text":thinking.thinking}}),
                ));
                if let Some(signature) = &thinking.thinking_signature {
                    events.push(delta(
                        index,
                        json!({"reasoningContent":{"signature":signature}}),
                    ));
                }
            }
            ContentBlock::ToolCall(call) => {
                events.push(json!({"contentBlockStart":{"contentBlockIndex":index,"start":{"toolUse":{"toolUseId":call.id,"name":call.name}}}}));
                events.push(delta(index, json!({"toolUse":{"input":serde_json::to_string(&call.arguments).expect("tool arguments serialize")}})));
            }
            ContentBlock::Image(_) => {
                return Err("Bedrock assistant responses cannot encode image blocks".into())
            }
        }
        events.push(json!({"contentBlockStop":{"contentBlockIndex":index}}));
    }
    let reason = match message.stop_reason {
        StopReason::ToolUse => "tool_use",
        StopReason::Length => "max_tokens",
        StopReason::Error | StopReason::Aborted => "guardrail_intervened",
        _ => "end_turn",
    };
    events.push(json!({"messageStop":{"stopReason":reason}}));
    let mut usage = json!({
        "inputTokens":message.usage.input, "outputTokens":message.usage.output,
        "totalTokens":message.usage.total_tokens, "cacheReadInputTokens":message.usage.cache_read,
        "cacheWriteInputTokens":message.usage.cache_write,
    });
    if let Some(tokens) = message.usage.cache_write_1h {
        usage["cacheDetails"] = json!([{"inputTokens":tokens,"ttl":"1h"}]);
    }
    events.push(json!({"metadata":{"usage":usage,"metrics":{"latencyMs":0}}}));
    Ok(events)
}

fn delta(index: usize, value: Value) -> Value {
    json!({"contentBlockDelta":{"contentBlockIndex":index,"delta":value}})
}

/// Logical JSON events for codec tests, not the AWS HTTP transport.
pub fn encode_sse(message: &AssistantMessage) -> Result<Vec<String>, String> {
    Ok(encode_events(message)?.iter().map(sse_event).collect())
}

pub fn encode_eventstream(message: &AssistantMessage) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    for event in encode_events(message)? {
        let (name, payload) = event.as_object().unwrap().iter().next().unwrap();
        let payload = serde_json::to_vec(payload).expect("JSON value serializes");
        bytes.extend(encode_frame(name, &payload)?);
    }
    Ok(bytes)
}

pub fn encode_error(error: &MockError) -> Value {
    json!({"message":error.message,"__type":error.code})
}
