use crate::api::encode_thinking::{project_content, SignatureDomain};
use serde_json::json;

use crate::model::{AssistantMessage, ContentBlock, MockError, StopReason, Usage};

use super::vendor::{
    Candidate, Content, FunctionCall, GenerateContentResponse, Part, UsageMetadata,
};

pub fn encode_sse(message: &AssistantMessage) -> Result<Vec<String>, String> {
    let mut frames = Vec::new();
    let mut first = true;
    let content = project_content(&message.content, SignatureDomain::Opaque);
    for block in content.iter() {
        let part = encode_block(block, &message.model)?;
        let chunk = GenerateContentResponse {
            response_id: first.then(|| message.response_id.clone()).flatten(),
            candidates: Some(vec![Candidate {
                content: Some(Content {
                    role: "model".to_string(),
                    parts: vec![part],
                }),
                finish_reason: None,
            }]),
            usage_metadata: None,
        };
        frames.push(frame(&chunk));
        first = false;
    }
    let terminal = GenerateContentResponse {
        response_id: first.then(|| message.response_id.clone()).flatten(),
        candidates: Some(vec![Candidate {
            content: None,
            finish_reason: Some(finish_reason(message)),
        }]),
        usage_metadata: Some(usage_metadata(&message.usage)),
    };
    frames.push(frame(&terminal));
    Ok(frames)
}

/// MockError is served as the HTTP response body (status = error.status,
/// Content-Type application/json), not as an SSE frame — the Google protocol
/// error shape parsed by SDK throwErrorIfNotOK.
pub fn encode_error(error: &MockError) -> Vec<String> {
    let body = json!({
        "error": {
            "code": error.status,
            "message": error.message,
            "status": error.code,
        }
    });
    vec![body.to_string()]
}

fn encode_block(block: &ContentBlock, model: &str) -> Result<Part, String> {
    match block {
        ContentBlock::Text(text) => Ok(Part {
            text: Some(text.text.clone()),
            thought_signature: text.text_signature.clone(),
            ..Part::default()
        }),
        ContentBlock::Thinking(thinking) => Ok(Part {
            text: Some(thinking.thinking.clone()),
            thought: Some(true),
            thought_signature: thinking.thinking_signature.clone(),
            ..Part::default()
        }),
        ContentBlock::ToolCall(call) => Ok(Part {
            function_call: Some(FunctionCall {
                id: requires_tool_call_id(model).then(|| call.id.clone()),
                name: Some(call.name.clone()),
                args: Some(call.arguments.clone()),
            }),
            thought_signature: call.thought_signature.clone(),
            ..Part::default()
        }),
        ContentBlock::Image(_) => {
            Err("google-generative-ai responses cannot carry image blocks".to_string())
        }
    }
}

fn finish_reason(message: &AssistantMessage) -> String {
    match message.stop_reason {
        StopReason::Stop | StopReason::ToolUse => "STOP".to_string(),
        StopReason::Length => "MAX_TOKENS".to_string(),
        _ => message.raw_stop_reason.clone().unwrap_or_else(|| "OTHER".into()),
    }
}

fn usage_metadata(usage: &Usage) -> UsageMetadata {
    let reasoning = usage.reasoning.unwrap_or(0);
    UsageMetadata {
        prompt_token_count: usage.input + usage.cache_read,
        cached_content_token_count: (usage.cache_read > 0).then_some(usage.cache_read),
        candidates_token_count: usage.output.saturating_sub(reasoning),
        thoughts_token_count: (reasoning > 0).then_some(reasoning),
        total_token_count: usage.total_tokens,
    }
}

fn requires_tool_call_id(model_id: &str) -> bool {
    if model_id.starts_with("claude-") || model_id.starts_with("gpt-oss-") {
        return true;
    }
    gemini_major(model_id).is_some_and(|v| v >= 3)
}

fn gemini_major(model_id: &str) -> Option<u32> {
    let id = model_id.to_lowercase();
    let rest = id
        .strip_prefix("gemini-live-")
        .or_else(|| id.strip_prefix("gemini-"))?;
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse().ok()
}

fn frame(chunk: &GenerateContentResponse) -> String {
    format!(
        "data: {}\n\n",
        serde_json::to_string(chunk).expect("response chunk serializes")
    )
}
