use crate::api::encode_thinking::{project_content, SignatureDomain};
use serde_json::json;

use super::vendor::{PiMessagesEvent, WireToolCall};
use crate::model::{AssistantMessage, ContentBlock, MockError, StopReason};

pub fn encode(message: &AssistantMessage) -> Result<Vec<String>, String> {
    let terminal = terminal_event(message)?;
    let mut frames = vec![frame(PiMessagesEvent::Start)?];
    let content = project_content(&message.content, SignatureDomain::Opaque);
    for (content_index, content) in content.iter().enumerate() {
        match content {
            ContentBlock::Text(text) => {
                frames.push(frame(PiMessagesEvent::TextStart { content_index })?);
                frames.push(frame(PiMessagesEvent::TextDelta {
                    content_index,
                    delta: &text.text,
                })?);
                frames.push(frame(PiMessagesEvent::TextEnd {
                    content_index,
                    content: &text.text,
                    content_signature: text.text_signature.as_deref(),
                })?);
            }
            ContentBlock::Thinking(thinking) => {
                frames.push(frame(PiMessagesEvent::ThinkingStart { content_index })?);
                frames.push(frame(PiMessagesEvent::ThinkingDelta {
                    content_index,
                    delta: &thinking.thinking,
                })?);
                frames.push(frame(PiMessagesEvent::ThinkingEnd {
                    content_index,
                    content: &thinking.thinking,
                    content_signature: thinking.thinking_signature.as_deref(),
                    redacted: thinking.redacted,
                })?);
            }
            ContentBlock::ToolCall(tool) => {
                frames.push(frame(PiMessagesEvent::ToolcallStart {
                    content_index,
                    id: &tool.id,
                    tool_name: &tool.name,
                })?);
                let arguments = serde_json::to_string(&tool.arguments)
                    .map_err(|error| format!("invalid pi-messages tool arguments: {error}"))?;
                frames.push(frame(PiMessagesEvent::ToolcallDelta {
                    content_index,
                    delta: &arguments,
                })?);
                frames.push(frame(PiMessagesEvent::ToolcallEnd {
                    content_index,
                    tool_call: WireToolCall::ToolCall(tool),
                })?);
            }
            ContentBlock::Image(_) => {
                return Err("pi-messages assistant events cannot encode images".to_owned());
            }
        }
    }
    frames.push(frame(terminal)?);
    Ok(frames)
}

fn terminal_event(message: &AssistantMessage) -> Result<PiMessagesEvent<'_>, String> {
    match message.stop_reason {
        StopReason::Stop | StopReason::Length | StopReason::ToolUse => Ok(PiMessagesEvent::Done {
            reason: message.stop_reason,
            usage: &message.usage,
            response_id: message.response_id.as_deref(),
            provider_thinking_level: message.provider_thinking_level.as_deref(),
        }),
        StopReason::Error | StopReason::Aborted => Ok(PiMessagesEvent::Error {
            reason: message.stop_reason,
            usage: &message.usage,
            error_message: message.error_message.as_deref(),
            response_id: message.response_id.as_deref(),
            provider_thinking_level: message.provider_thinking_level.as_deref(),
        }),
        reason => Err(format!(
            "pi-messages cannot encode terminal stop reason {reason:?}"
        )),
    }
}

fn frame(event: PiMessagesEvent<'_>) -> Result<String, String> {
    serde_json::to_string(&event)
        .map(|json| format!("data: {json}\n\n"))
        .map_err(|error| format!("invalid pi-messages event: {error}"))
}

pub fn encode_error(error: &MockError) -> String {
    json!({ "error": { "code": error.code, "message": error.message } }).to_string()
}
