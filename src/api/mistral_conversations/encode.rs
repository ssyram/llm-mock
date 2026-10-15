use crate::api::encode_thinking::{project_content, SignatureDomain};
use super::vendor::sse_data;
use crate::model::*;
use serde_json::json;

pub fn encode_sse(message: &AssistantMessage) -> Result<Vec<String>, String> {
    if message.stop_reason == StopReason::Pending {
        return Err("cannot encode pending Mistral response".into());
    }
    let id = message.response_id.as_deref().unwrap_or("mock-mistral");
    let model = message.response_model.as_deref().unwrap_or(&message.model);
    let mut frames = Vec::new();
    let mut tool_index = 0;
    let content = project_content(&message.content, SignatureDomain::Unsigned);
    for block in content.iter() {
        let delta = match block {
            ContentBlock::Text(t) => json!({"content": t.text}),
            ContentBlock::Thinking(t) => json!({"content":[{"type":"thinking","thinking":[{"type":"text","text":t.thinking}]}]}),
            ContentBlock::ToolCall(t) => {
                let index = tool_index;
                tool_index += 1;
                json!({"tool_calls":[{"index":index,"id":t.id,"type":"function","function":{"name":t.name,"arguments":serde_json::to_string(&t.arguments).expect("tool arguments serialize")}}]})
            }
            ContentBlock::Image(_) => {
                return Err("Mistral chat completions cannot encode image output".into())
            }
        };
        frames.push(sse_data(&json!({"id":id,"object":"chat.completion.chunk","created":0,"model":model,"choices":[{"index":0,"delta":delta,"finish_reason":null}]})));
    }
    let finish = match message.stop_reason {
        StopReason::ToolUse => "tool_calls",
        StopReason::Length => "length",
        StopReason::Error => "error",
        StopReason::Aborted => "abort",
        _ => "stop",
    };
    frames.push(sse_data(&json!({"id":id,"object":"chat.completion.chunk","created":0,"model":model,"choices":[{"index":0,"delta":{},"finish_reason":finish}]})));
    frames.push(sse_data(&json!({"id":id,"object":"chat.completion.chunk","created":0,"model":model,"choices":[],"usage":{"prompt_tokens":message.usage.input + message.usage.cache_read,"prompt_tokens_details":{"cached_tokens":message.usage.cache_read},"completion_tokens":message.usage.output,"total_tokens":message.usage.total_tokens}})));
    frames.push("data: [DONE]\n\n".into());
    Ok(frames)
}

pub fn encode_error(error: &MockError) -> String {
    json!({"error":{"message":error.message,"type":error.code,"code":error.code}}).to_string()
}
