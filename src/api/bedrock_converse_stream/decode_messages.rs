use super::decode_assistant::decode_assistant_blocks;
use super::decode_image::decode_image;
use super::vendor::{API, PROVIDER};
use crate::model::*;
use serde_json::{Map, Value};

pub fn decode_messages(body: &Value, model: &str) -> Result<Vec<Message>, String> {
    let source = body
        .get("messages")
        .and_then(Value::as_array)
        .ok_or("missing messages array")?;
    let tools = decode_tools(
        body.get("toolConfig")
            .and_then(|v| v.get("tools"))
            .and_then(Value::as_array),
    );
    let system = body
        .get("system")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|p| p.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .unwrap_or_default();
    let mut output = Vec::new();
    if !system.is_empty() || !tools.is_empty() {
        output.push(Message::System(SystemMessage {
            content: SystemContent::Text(system),
            sections: None,
            tools_added: (!tools.is_empty()).then_some(tools.clone()),
            tools_removed: None,
            timestamp: 0,
        }));
    }
    for msg in source {
        let role = msg
            .get("role")
            .and_then(Value::as_str)
            .ok_or("message missing role")?;
        let blocks = msg
            .get("content")
            .and_then(Value::as_array)
            .ok_or("message missing content array")?;
        match role {
            "user" => {
                let mut user = Vec::new();
                let mut results = Vec::new();
                for block in blocks {
                    if let Some(text) = block.get("text").and_then(Value::as_str) {
                        user.push(UserBlock::Text(text_block(text)));
                    } else if let Some(image) = block.get("image") {
                        user.push(UserBlock::Image(decode_image(image)?));
                    } else if let Some(result) = block.get("toolResult") {
                        results.push(decode_tool_result(result)?);
                    }
                }
                if !user.is_empty() {
                    output.push(Message::User(UserMessage {
                        content: match user.as_slice() {
                            [UserBlock::Text(t)] => UserContent::Text(t.text.clone()),
                            _ => UserContent::Blocks(user),
                        },
                        timestamp: 0,
                    }));
                }
                output.extend(results);
            }
            "assistant" => {
                let content = decode_assistant_blocks(blocks);
                if !content.is_empty() {
                    output.push(Message::Assistant(assistant(content, model)));
                }
            }
            other => return Err(format!("unsupported Bedrock message role: {other}")),
        }
    }
    if let Some(Message::System(system)) = output.first_mut() {
        if system.tools_added.is_none() && !tools.is_empty() {
            system.tools_added = Some(tools);
        }
    }
    Ok(output)
}

fn decode_tools(items: Option<&Vec<Value>>) -> Vec<Tool> {
    items
        .into_iter()
        .flatten()
        .filter_map(|v| v.get("toolSpec"))
        .map(|spec| Tool {
            name: spec
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
            description: spec
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
            parameters: spec
                .get("inputSchema")
                .and_then(|v| v.get("json"))
                .cloned()
                .unwrap_or_else(|| Value::Object(Map::new())),
            constrained_sampling: None,
        })
        .collect()
}
fn decode_tool_result(value: &Value) -> Result<Message, String> {
    let content = value
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|part| {
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                Some(Ok(UserBlock::Text(text_block(text))))
            } else {
                part.get("image")
                    .map(|image| decode_image(image).map(UserBlock::Image))
            }
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(Message::ToolResult(ToolResultMessage {
        record: Default::default(),
        tool_call_id: value
            .get("toolUseId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        tool_name: String::new(),
        content,
        is_error: value.get("status").and_then(Value::as_str) == Some("error"),
        timestamp: 0,
        duration_ms: None,
    }))
}
fn text_block(text: &str) -> TextContent {
    TextContent {
        text: text.into(),
        text_signature: None,
    }
}
fn assistant(content: Vec<ContentBlock>, model: &str) -> AssistantMessage {
    AssistantMessage {
        record: Default::default(),
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
