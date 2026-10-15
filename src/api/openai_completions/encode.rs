use crate::api::encode_thinking::{project_content, SignatureDomain};
use serde_json::{Map, Value, json};

use crate::model::*;

use crate::api::encode_thinking::{completion_details, REASONING_FIELDS};

pub fn encode(msg: &AssistantMessage) -> Result<Vec<String>, String> {
    let mut base = Map::new();
    if let Some(id) = &msg.response_id {
        base.insert("id".into(), Value::String(id.clone()));
    }
    if let Some(model) = &msg.response_model {
        base.insert("model".into(), Value::String(model.clone()));
    }
    let mut frames = Vec::new();
    let mut tool_index = 0u32;
    let content = project_content(&msg.content, SignatureDomain::CompletionDetails);
    for block in content.iter() {
        match block {
            ContentBlock::Text(t) => {
                frames.push(delta_frame(&base, Map::from_iter([("content".to_string(), Value::String(t.text.clone()))])));
            }
            ContentBlock::Thinking(t) => {
                let signature = t.thinking_signature.as_deref();
                if !t.thinking.is_empty() {
                    let field = signature.filter(|s| REASONING_FIELDS.contains(s)).unwrap_or("reasoning_content");
                    frames.push(delta_frame(&base, Map::from_iter([(field.to_string(), Value::String(t.thinking.clone()))])));
                }
                if let Some(details) = signature.and_then(completion_details) {
                    frames.push(delta_frame(&base, Map::from_iter([("reasoning_details".to_string(), details)])));
                }
            }
            ContentBlock::ToolCall(tc) => {
                let arguments = serde_json::to_string(&tc.arguments).expect("serialize tool arguments");
                let call = json!({
                    "index": tool_index,
                    "id": tc.id,
                    "type": "function",
                    "function": { "name": tc.name, "arguments": arguments }
                });
                frames.push(delta_frame(&base, Map::from_iter([("tool_calls".to_string(), Value::Array(vec![call]))])));
                tool_index += 1;
            }
            ContentBlock::Image(_) => return Err("openai-completions cannot encode image blocks".to_string()),
        }
    }
    frames.push(chunk_frame(&base, json!([{ "index": 0, "delta": {}, "finish_reason": finish_reason(msg)? }])));
    frames.push(usage_frame(&base, &msg.usage));
    frames.push("data: [DONE]\n\n".to_string());
    Ok(frames)
}

pub fn encode_error(err: &MockError) -> String {
    let body = json!({ "error": { "message": err.message, "type": err.code, "code": err.code } });
    serde_json::to_string(&body).expect("serialize error body")
}

fn finish_reason(msg: &AssistantMessage) -> Result<String, String> {
    match msg.stop_reason {
        StopReason::Stop => Ok("stop".to_string()),
        StopReason::Length => Ok("length".to_string()),
        StopReason::ToolUse => Ok("tool_calls".to_string()),
        StopReason::Error => {
            let prefix = "Provider finish_reason: ";
            if let Some(suffix) = msg.error_message.as_deref().and_then(|m| m.strip_prefix(prefix)) {
                if !suffix.is_empty() {
                    return Ok(suffix.to_string());
                }
            }
            Ok("error".to_string())
        }
        other => Err(format!("openai-completions cannot encode stop reason {other:?}")),
    }
}

fn usage_frame(base: &Map<String, Value>, usage: &Usage) -> String {
    let mut prompt_details = Map::new();
    prompt_details.insert("cached_tokens".into(), json!(usage.cache_read));
    if usage.cache_write > 0 {
        prompt_details.insert("cache_write_tokens".into(), json!(usage.cache_write));
    }
    let mut wire_usage = Map::new();
    wire_usage.insert("prompt_tokens".into(), json!(usage.input + usage.cache_read + usage.cache_write));
    wire_usage.insert("completion_tokens".into(), json!(usage.output));
    wire_usage.insert("prompt_tokens_details".into(), Value::Object(prompt_details));
    if let Some(reasoning) = usage.reasoning.filter(|r| *r > 0) {
        wire_usage.insert("completion_tokens_details".into(), json!({ "reasoning_tokens": reasoning }));
    }
    let mut chunk = base.clone();
    chunk.insert("choices".into(), Value::Array(vec![]));
    chunk.insert("usage".into(), Value::Object(wire_usage));
    format!("data: {}\n\n", serde_json::to_string(&Value::Object(chunk)).expect("serialize chunk"))
}

fn delta_frame(base: &Map<String, Value>, delta: Map<String, Value>) -> String {
    chunk_frame(&base.clone(), json!([{ "index": 0, "delta": Value::Object(delta) }]))
}

fn chunk_frame(base: &Map<String, Value>, choices: Value) -> String {
    let mut chunk = base.clone();
    chunk.insert("choices".into(), choices);
    format!("data: {}\n\n", serde_json::to_string(&Value::Object(chunk)).expect("serialize chunk"))
}
