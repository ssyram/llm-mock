use super::decode_content::{
    assistant, content_text, decode_call, decode_tools, decode_user_content, text_block,
};
use crate::model::*;
use serde_json::Value;

pub fn decode_messages(body: &Value, model: &str) -> Result<Vec<Message>, String> {
    let source = body
        .get("messages")
        .and_then(Value::as_array)
        .ok_or("missing messages array")?;
    let tools = decode_tools(body.get("tools").and_then(Value::as_array));
    let mut output = Vec::new();
    for msg in source {
        let role = msg.get("role").and_then(Value::as_str).unwrap_or_default();
        match role {
            "system" | "developer" => output.push(Message::System(SystemMessage {
                content: SystemContent::Text(content_text(msg.get("content"))),
                sections: None,
                tools_added: None,
                tools_removed: None,
                timestamp: 0,
            })),
            "user" => {
                let blocks = decode_user_content(msg.get("content"))?;
                if !blocks.is_empty() {
                    let content = match blocks.as_slice() {
                        [UserBlock::Text(t)] => UserContent::Text(t.text.clone()),
                        _ => UserContent::Blocks(blocks),
                    };
                    output.push(Message::User(UserMessage {
                        content,
                        timestamp: 0,
                    }));
                }
            }
            "assistant" => {
                let mut content = Vec::new();
                if let Some(reasoning) = msg
                    .get("reasoning_content")
                    .or_else(|| msg.get("reasoning"))
                    .and_then(Value::as_str)
                {
                    content.push(ContentBlock::Thinking(ThinkingContent {
                        thinking: reasoning.into(),
                        thinking_signature: None,
                        redacted: None,
                    }));
                }
                if let Some(parts) = msg.get("content").and_then(Value::as_array) {
                    for part in parts {
                        match part.get("type").and_then(Value::as_str) {
                            Some("thinking") => {
                                let thinking: String = part
                                    .get("thinking")
                                    .and_then(Value::as_array)
                                    .into_iter()
                                    .flatten()
                                    .filter_map(|p| p.get("text").and_then(Value::as_str))
                                    .collect();
                                content.push(ContentBlock::Thinking(ThinkingContent {
                                    thinking,
                                    thinking_signature: None,
                                    redacted: None,
                                }));
                            }
                            Some("text") => {
                                if let Some(text) = part.get("text").and_then(Value::as_str) {
                                    content.push(ContentBlock::Text(text_block(text)));
                                }
                            }
                            _ => {}
                        }
                    }
                } else {
                    let text = content_text(msg.get("content"));
                    if !text.is_empty() {
                        content.push(ContentBlock::Text(text_block(&text)));
                    }
                }
                if let Some(calls) = msg.get("tool_calls").and_then(Value::as_array) {
                    for call in calls {
                        content.push(ContentBlock::ToolCall(decode_call(call)?));
                    }
                }
                if !content.is_empty() {
                    output.push(Message::Assistant(assistant(content, model)));
                }
            }
            "tool" => output.push(Message::ToolResult(ToolResultMessage {
                tool_call_id: msg
                    .get("tool_call_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                tool_name: msg
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                content: decode_user_content(msg.get("content"))?,
                is_error: false,
                timestamp: 0,
                duration_ms: None,
            })),
            other => return Err(format!("unsupported Mistral message role: {other}")),
        }
    }
    if !tools.is_empty() {
        if let Some(Message::System(system)) = output.first_mut() {
            system.tools_added = Some(tools);
        } else {
            output.insert(
                0,
                Message::System(SystemMessage {
                    content: SystemContent::Text(String::new()),
                    sections: None,
                    tools_added: Some(tools),
                    tools_removed: None,
                    timestamp: 0,
                }),
            );
        }
    }
    Ok(output)
}
