use serde_json::Value;

use crate::model::{
    AssistantMessage, ContentBlock, DecodedOptions, ImageContent, Message, RequestInfo,
    StopReason, SystemContent, SystemMessage, TextContent, ThinkingContent, Tool, ToolCall,
    ToolResultMessage, TranscriptContext, UnifiedRequest, Usage, UserBlock, UserContent,
    UserMessage,
};

use super::vendor::{FunctionResponse, GenerateContentRequest, Part, SystemInstruction, ToolSet};

pub const API: &str = "google-generative-ai";

pub fn decode_request(path: &str, body: &Value) -> Result<UnifiedRequest, String> {
    let model = model_from_path(path)?;
    let wire: GenerateContentRequest =
        serde_json::from_value(body.clone()).map_err(|e| e.to_string())?;
    let tools = decode_tools(&wire.tools);
    let mut messages = vec![];
    if let Some(msg) = system_message(&wire.system_instruction, &tools) {
        messages.push(msg);
    }
    for content in &wire.contents {
        decode_content(content.role.as_str(), &content.parts, &mut messages);
    }
    Ok(UnifiedRequest {
        model,
        context: TranscriptContext { messages },
        options: decode_options(&wire),
    })
}

pub fn decode_request_info(
    path: &str,
    api_key: Option<&str>,
    body: &Value,
) -> Result<RequestInfo, String> {
    let request = decode_request(path, body)?;
    Ok(RequestInfo {
        api: API.to_string(),
        key_id: api_key.unwrap_or_default().to_string(),
        model: request.model, options: request.options, session_signal: None,
    })
}

fn model_from_path(path: &str) -> Result<String, String> {
    let last = path.split('?').next().unwrap_or_default().rsplit('/').next().unwrap_or_default();
    let stripped = last.strip_prefix("models/").or_else(|| last.strip_prefix("tunedModels/")).unwrap_or(last);
    let model = stripped.split(':').next().unwrap_or_default();
    (!model.is_empty()).then(|| model.to_string()).ok_or_else(|| format!("no model in path: {path}"))
}

fn decode_tools(tool_sets: &[ToolSet]) -> Vec<Tool> {
    tool_sets
        .iter()
        .flat_map(|set| set.function_declarations.iter())
        .map(|decl| Tool {
            name: decl.name.clone(),
            description: decl.description.clone(),
            parameters: decl.parameters_json_schema.clone()
                .or_else(|| decl.parameters.clone())
                .unwrap_or_else(|| serde_json::json!({})),
            constrained_sampling: None,
        })
        .collect()
}

fn system_message(instruction: &Option<SystemInstruction>, tools: &[Tool]) -> Option<Message> {
    let text = match instruction {
        Some(SystemInstruction::Text(s)) => s.clone(),
        Some(SystemInstruction::Content { parts, .. }) => parts
            .iter()
            .filter_map(|p| p.text.clone())
            .collect::<Vec<_>>()
            .join("\n\n"),
        None => String::new(),
    };
    if text.is_empty() && tools.is_empty() {
        return None;
    }
    Some(Message::System(SystemMessage {
        content: SystemContent::Text(text),
        sections: None,
        tools_added: (!tools.is_empty()).then(|| tools.to_vec()),
        tools_removed: None,
        timestamp: 0,
    }))
}

fn decode_content(role: &str, parts: &[Part], messages: &mut Vec<Message>) {
    match role {
        "user" => decode_user_parts(parts, messages),
        "model" => {
            let content: Vec<ContentBlock> = parts.iter().filter_map(model_block).collect();
            if !content.is_empty() {
                messages.push(Message::Assistant(AssistantMessage {
                    content,
                    api: API.to_string(), provider: String::new(), model: String::new(),
                    response_model: None, response_id: None, provider_thinking_level: None,
                    thinking_level: None, usage: Usage::default(), stop_reason: StopReason::Stop,
                    error_message: None, raw_stop_reason: None, end_turn: None,
                    timestamp: 0, duration_ms: None,
                }));
            }
        }
        _ => {}
    }
}

fn decode_user_parts(parts: &[Part], messages: &mut Vec<Message>) {
    let mut results = Vec::new();
    let mut blocks = Vec::new();
    for part in parts {
        if let Some(fr) = &part.function_response {
            results.push(decode_function_response(fr));
        } else if let Some(text) = &part.text {
            blocks.push(UserBlock::Text(TextContent { text: text.clone(), text_signature: None }));
        } else if let Some(blob) = &part.inline_data {
            blocks.push(UserBlock::Image(ImageContent {
                data: blob.data.clone(),
                mime_type: blob.mime_type.clone(),
            }));
        }
    }
    if !blocks.is_empty() {
        let content = match blocks.as_slice() {
            [UserBlock::Text(only)] => UserContent::Text(only.text.clone()),
            _ => UserContent::Blocks(blocks),
        };
        messages.push(Message::User(UserMessage { content, timestamp: 0 }));
    }
    messages.extend(results);
}

fn model_block(part: &Part) -> Option<ContentBlock> {
    if let Some(fc) = &part.function_call {
        return Some(ContentBlock::ToolCall(ToolCall {
            id: fc.id.clone().or_else(|| fc.name.clone()).unwrap_or_default(),
            name: fc.name.clone().unwrap_or_default(),
            arguments: fc.args.clone().unwrap_or_default(),
            thought_signature: part.thought_signature.clone(),
            namespace: None,
        }));
    }
    let text = part.text.as_deref()?;
    if part.thought == Some(true) {
        Some(ContentBlock::Thinking(ThinkingContent {
            thinking: text.to_string(),
            thinking_signature: part.thought_signature.clone(),
            redacted: None,
        }))
    } else {
        Some(ContentBlock::Text(TextContent {
            text: text.to_string(),
            text_signature: part.thought_signature.clone(),
        }))
    }
}

fn decode_function_response(fr: &FunctionResponse) -> Message {
    let value = fr.response.error.clone().or_else(|| fr.response.output.clone());
    let text = match value {
        Some(Value::String(s)) => s,
        Some(other) => other.to_string(),
        None => String::new(),
    };
    let mut content = vec![];
    if !text.is_empty() {
        content.push(UserBlock::Text(TextContent { text, text_signature: None }));
    }
    if let Some(parts) = &fr.parts {
        for part in parts {
            if let Some(blob) = &part.inline_data {
                content.push(UserBlock::Image(ImageContent {
                    data: blob.data.clone(),
                    mime_type: blob.mime_type.clone(),
                }));
            }
        }
    }
    Message::ToolResult(ToolResultMessage {
        tool_call_id: fr.id.clone().unwrap_or_else(|| fr.name.clone()),
        tool_name: fr.name.clone(),
        content,
        is_error: fr.response.error.is_some(),
        timestamp: 0,
        duration_ms: None,
    })
}

fn decode_options(wire: &GenerateContentRequest) -> DecodedOptions {
    let config = wire.generation_config.clone().unwrap_or_default();
    DecodedOptions {
        max_tokens: config.max_output_tokens,
        temperature: config.temperature,
        session_id: None,
        tool_choice: wire
            .tool_config
            .as_ref()
            .and_then(|tc| tc.function_calling_config.as_ref())
            .and_then(|c| c.mode.clone())
            .map(|m| Value::String(m.to_lowercase())),
        reasoning: config.thinking_config.and_then(|tc| {
            if let Some(level) = tc.thinking_level {
                Some(level.to_lowercase())
            } else if tc.thinking_budget == Some(0) {
                Some("off".to_string())
            } else {
                tc.thinking_budget.map(|b| format!("budget:{b}"))
            }
        }),
    }
}
