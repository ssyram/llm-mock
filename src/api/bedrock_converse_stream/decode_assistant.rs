use crate::model::*;
use serde_json::Value;

pub fn decode_assistant_blocks(blocks: &[Value]) -> Vec<ContentBlock> {
    let mut content = Vec::new();
    for block in blocks {
        if let Some(text) = block.get("text").and_then(Value::as_str) {
            content.push(ContentBlock::Text(TextContent {
                text: text.into(),
                text_signature: None,
            }));
        }
        if let Some(reasoning) = block.get("reasoningContent") {
            if let Some(text) = reasoning
                .get("reasoningText")
                .and_then(|v| v.get("text"))
                .and_then(Value::as_str)
            {
                content.push(ContentBlock::Thinking(ThinkingContent {
                    thinking: text.into(),
                    thinking_signature: reasoning
                        .get("reasoningText")
                        .and_then(|v| v.get("signature"))
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    redacted: None,
                }));
            }
            if let Some(redacted) = reasoning.get("redactedContent").and_then(Value::as_str) {
                content.push(ContentBlock::Thinking(ThinkingContent {
                    thinking: String::new(),
                    thinking_signature: Some(redacted.into()),
                    redacted: Some(true),
                }));
            }
        }
        if let Some(call) = block.get("toolUse") {
            content.push(ContentBlock::ToolCall(ToolCall {
                id: call
                    .get("toolUseId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                name: call
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                arguments: call
                    .get("input")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default(),
                thought_signature: None,
                namespace: None,
            }));
        }
    }
    content
}
