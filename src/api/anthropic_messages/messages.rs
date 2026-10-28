//! Per-message wire→unified mapping for anthropic-messages (spec §a).

use std::collections::HashMap;

use super::vendor::{WireBlock, WireContent, WireMessage, WireTool};
use crate::model::*;

pub(super) fn wire_tool(t: &WireTool) -> Tool {
	Tool {
		name: t.name.clone(),
		description: t.description.clone(),
		parameters: t
			.input_schema
			.clone()
			.unwrap_or(serde_json::json!({"type":"object","properties":{},"required":[]})),
		constrained_sampling: None,
	}
}

pub(super) fn decode_system_update(blocks: &[WireBlock]) -> SystemMessage {
	let mut texts: Vec<String> = Vec::new();
	let mut added: Vec<Tool> = Vec::new();
	let mut removed: Vec<ToolReference> = Vec::new();
	for block in blocks {
		match block {
			WireBlock::Text { text } => texts.push(text.clone()),
			WireBlock::ToolAddition { tool } => {
				if let Some(definition) = &tool.definition {
					added.push(wire_tool(definition));
				}
			}
			WireBlock::ToolRemoval { tool } => removed.push(ToolReference { name: tool.name.clone() }),
			_ => {}
		}
	}
	SystemMessage {
		content: SystemContent::Text(texts.join("\n\n")),
		sections: None,
		tools_added: (!added.is_empty()).then_some(added),
		tools_removed: (!removed.is_empty()).then_some(removed),
		timestamp: 0,
	}
}

fn text_block(text: &str) -> UserBlock {
	UserBlock::Text(TextContent {
		text: text.to_owned(),
		text_signature: None,
	})
}

fn user_block(block: &WireBlock) -> Result<UserBlock, String> {
	match block {
		WireBlock::Text { text } => Ok(text_block(text)),
		WireBlock::Image { source } => Ok(UserBlock::Image(ImageContent {
			data: source.data.clone(),
			mime_type: source.media_type.clone(),
		})),
		other => Err(format!("unsupported block in user/tool_result content: {other:?}")),
	}
}

pub(super) fn decode_user(
	msg: &WireMessage,
	tool_names: &mut HashMap<String, String>,
	out: &mut Vec<Message>,
) -> Result<(), String> {
	let blocks = match &msg.content {
		Some(WireContent::Text(text)) => {
			out.push(Message::User(UserMessage {
				content: UserContent::Text(text.clone()),
				timestamp: 0,
			}));
			return Ok(());
		}
		Some(WireContent::Blocks(blocks)) => blocks,
		None => return Ok(()),
	};
	// Mixed user content is legal wire since pi-ai 1.4 (#10794): an error
	// tool result's images are split out, so the user message is
	// [...tool_results, caption text, images...]. Decode order-preserving:
	// consecutive tool results become ToolResultMessages, consecutive
	// text/image blocks become one UserMessage.
	let mut user_blocks: Vec<UserBlock> = Vec::new();
	for block in blocks {
		match block {
			WireBlock::ToolResult {
				tool_use_id,
				content,
				is_error,
			} => {
				if !user_blocks.is_empty() {
					out.push(Message::User(UserMessage {
						content: UserContent::Blocks(std::mem::take(&mut user_blocks)),
						timestamp: 0,
					}));
				}
				let tool_name = tool_names
					.get(tool_use_id)
					.cloned()
					.ok_or_else(|| format!("tool_result without matching tool_use: {tool_use_id}"))?;
				let content: Vec<UserBlock> = match content {
					Some(WireContent::Text(text)) => vec![text_block(text)],
					Some(WireContent::Blocks(blocks)) => {
						blocks.iter().map(user_block).collect::<Result<_, _>>()?
					}
					None => Vec::new(),
				};
				out.push(Message::ToolResult(ToolResultMessage {
					record: Default::default(),
					tool_call_id: tool_use_id.clone(),
					tool_name,
					content,
					is_error: *is_error,
					timestamp: 0,
					duration_ms: None,
				}));
			}
			other => user_blocks.push(user_block(other)?),
		}
	}
	if !user_blocks.is_empty() {
		out.push(Message::User(UserMessage {
			content: UserContent::Blocks(user_blocks),
			timestamp: 0,
		}));
	}
	Ok(())
}

pub(super) fn decode_assistant(
	msg: &WireMessage,
	model: &str,
	tool_names: &mut HashMap<String, String>,
) -> Result<AssistantMessage, String> {
	let text_block;
	let blocks: &[WireBlock] = match &msg.content {
		Some(WireContent::Text(text)) => {
			text_block = WireBlock::Text { text: text.clone() };
			std::slice::from_ref(&text_block)
		}
		Some(WireContent::Blocks(blocks)) => blocks,
		None => return Err("assistant content must be a string or block array".to_owned()),
	};
	let mut content: Vec<ContentBlock> = Vec::new();
	for block in blocks {
		match block {
			WireBlock::Text { text } => content.push(ContentBlock::Text(TextContent {
				text: text.clone(),
				text_signature: None,
			})),
			WireBlock::Thinking { thinking, signature } => {
				content.push(ContentBlock::Thinking(ThinkingContent {
					thinking: thinking.clone(),
					thinking_signature: Some(signature.clone()),
					redacted: None,
				}));
			}
			WireBlock::RedactedThinking { data } => {
				content.push(ContentBlock::Thinking(ThinkingContent {
					thinking: "[Reasoning redacted]".to_owned(),
					thinking_signature: Some(data.clone()),
					redacted: Some(true),
				}));
			}
			WireBlock::ToolUse { id, name, input } => {
				tool_names.insert(id.clone(), name.clone());
				content.push(ContentBlock::ToolCall(ToolCall {
					id: id.clone(),
					name: name.clone(),
					arguments: input.as_object().cloned().unwrap_or_default(),
					thought_signature: None,
					namespace: None,
				}));
			}
			other => return Err(format!("unsupported block in assistant message: {other:?}")),
		}
	}
	Ok(AssistantMessage {
		record: Default::default(),
		content,
		api: "anthropic-messages".to_owned(),
		provider: "anthropic".to_owned(),
		model: model.to_owned(),
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
	})
}
