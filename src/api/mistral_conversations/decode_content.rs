use super::vendor::{API, PROVIDER};
use crate::model::*;
use serde_json::{Map, Value};

pub fn content_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|p| p.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n\n"),
        _ => String::new(),
    }
}
pub fn decode_user_content(value: Option<&Value>) -> Result<Vec<UserBlock>, String> {
    match value {
        Some(Value::String(text)) => Ok(vec![UserBlock::Text(text_block(text))]),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    return Some(Ok(UserBlock::Text(text_block(text))));
                }
                part.get("image_url")
                    .and_then(|v| v.as_str().or_else(|| v.get("url").and_then(Value::as_str)))
                    .map(|url| {
                        let data = url
                            .strip_prefix("data:")
                            .ok_or_else(|| "Mistral image URL must be a data URL".to_string())?;
                        let (mime, data) = data
                            .split_once(";base64,")
                            .ok_or_else(|| "malformed Mistral image data URL".to_string())?;
                        Ok(UserBlock::Image(ImageContent {
                            data: data.into(),
                            mime_type: mime.into(),
                        }))
                    })
            })
            .collect(),
        _ => Ok(Vec::new()),
    }
}
pub fn decode_call(value: &Value) -> Result<ToolCall, String> {
    let function = value.get("function").ok_or("tool call missing function")?;
    let raw = function
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    let arguments = if let Some(text) = raw.as_str() {
        serde_json::from_str::<Value>(text).map_err(|e| format!("invalid tool arguments: {e}"))?
    } else {
        raw
    };
    Ok(ToolCall {
        id: value
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        name: function
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        arguments: arguments
            .as_object()
            .cloned()
            .ok_or("tool arguments must be an object")?,
        thought_signature: None,
        namespace: None,
    })
}
pub fn decode_tools(values: Option<&Vec<Value>>) -> Vec<Tool> {
    values
        .into_iter()
        .flatten()
        .filter_map(|v| v.get("function"))
        .map(|function| Tool {
            name: function
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
            description: function
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
            parameters: function
                .get("parameters")
                .cloned()
                .unwrap_or_else(|| Value::Object(Map::new())),
            constrained_sampling: None,
        })
        .collect()
}
pub fn text_block(text: &str) -> TextContent {
    TextContent {
        text: text.into(),
        text_signature: None,
    }
}
pub fn assistant(content: Vec<ContentBlock>, model: &str) -> AssistantMessage {
    AssistantMessage {
        content,
        api: API.into(),
        provider: PROVIDER.into(),
        model: model.into(),
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
