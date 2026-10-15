use std::collections::HashMap;

use serde_json::Value;

use crate::model::*;

use super::request_headers::{bearer, session_signal};
use super::vendor::*;

const API: &str = "openai-responses";
const PROVIDER: &str = "openai";

pub fn decode_request(body: &str, headers: &[(String, String)]) -> Result<(UnifiedRequest, RequestInfo), String> {
	let raw: Value = serde_json::from_str(body).map_err(|e| format!("invalid JSON body: {e}"))?;
	let req: WireRequest = serde_json::from_str(body).map_err(|e| format!("invalid request: {e}"))?;
	let raw_items = raw.get("input").and_then(Value::as_array).ok_or("missing input array")?;
	let key_id = bearer(headers)?;
	let session = session_signal(headers, req.prompt_cache_key.as_deref());

	let mut messages: Vec<Message> = Vec::new();
	let mut calls: HashMap<String, (String, String)> = HashMap::new();
	let mut pending: Vec<ContentBlock> = Vec::new();

	for (idx, item) in req.input.iter().enumerate() {
		match item {
			WireItem::Role(r) => {
				flush_assistant(&mut pending, &req.model, &mut messages);
				match (r.role.as_str(), &r.content) {
					("system" | "developer", RoleContent::Text(s)) => messages.push(Message::System(SystemMessage {
						content: SystemContent::Text(s.clone()),
						sections: None,
						tools_added: None,
						tools_removed: None,
						timestamp: 0,
					})),
					("user", RoleContent::Text(s)) => {
						messages.push(Message::User(UserMessage { content: UserContent::Text(s.clone()), timestamp: 0 }));
					}
					("user", RoleContent::Parts(parts)) => {
						let blocks = user_blocks(parts)?;
						if let Some(blocks) = blocks {
							messages.push(Message::User(UserMessage { content: blocks, timestamp: 0 }));
						}
					}
					(role, _) => return Err(format!("unsupported role item: {role}")),
				}
			}
			WireItem::Typed(WireTypedItem::Message(m)) => {
				if m.role != "assistant" {
					return Err(format!("unsupported typed message role: {}", m.role));
				}
				pending.push(ContentBlock::Text(TextContent {
					text: m.content.iter().map(output_part_text).collect::<String>(),
					text_signature: m.id.as_ref().map(|id| text_signature(id, m.phase.as_deref())),
				}));
			}
			WireItem::Typed(WireTypedItem::Reasoning(r)) => {
				let summary = r.summary.iter().map(text_part_text).collect::<Vec<_>>().join("\n\n");
				let content = r.content.as_ref().map(|parts| parts.iter().map(text_part_text).collect::<Vec<_>>().join("\n\n")).unwrap_or_default();
				let raw_item = raw_items.get(idx).ok_or("input index mismatch")?;
				pending.push(ContentBlock::Thinking(ThinkingContent {
					thinking: if !summary.is_empty() { summary } else { content },
					thinking_signature: Some(serde_json::to_string(raw_item).map_err(|e| format!("reasoning item: {e}"))?),
					redacted: None,
				}));
			}
			WireItem::Typed(WireTypedItem::FunctionCall(c)) => {
				let full_id = call_full_id(&c.call_id, c.id.as_deref());
				let args = serde_json::from_str(&c.arguments).map_err(|e| format!("function_call arguments: {e}"))?;
				calls.insert(c.call_id.clone(), (full_id.clone(), c.name.clone()));
				pending.push(ContentBlock::ToolCall(ToolCall {
					id: full_id,
					name: c.name.clone(),
					arguments: args,
					thought_signature: None,
					namespace: c.namespace.clone(),
				}));
			}
			WireItem::Typed(WireTypedItem::CustomToolCall(c)) => {
				let full_id = call_full_id(&c.call_id, c.id.as_deref());
				calls.insert(c.call_id.clone(), (full_id.clone(), c.name.clone()));
				pending.push(ContentBlock::ToolCall(ToolCall {
					id: full_id,
					name: c.name.clone(),
					arguments: [("input".to_string(), Value::String(c.input.clone()))].into_iter().collect(),
					thought_signature: None,
					namespace: c.namespace.clone(),
				}));
			}
			WireItem::Typed(WireTypedItem::FunctionCallOutput(o)) | WireItem::Typed(WireTypedItem::CustomToolCallOutput(o)) => {
				flush_assistant(&mut pending, &req.model, &mut messages);
				let (full_id, name) = calls.get(&o.call_id).ok_or_else(|| format!("unpaired tool output for call_id {}", o.call_id))?;
				messages.push(Message::ToolResult(ToolResultMessage {
					tool_call_id: full_id.clone(),
					tool_name: name.clone(),
					content: output_content(&o.output)?,
					is_error: false,
					timestamp: 0,
					duration_ms: None,
				}));
			}
		}
	}
	flush_assistant(&mut pending, &req.model, &mut messages);
	attach_tools(&req, &mut messages)?;

	let options = DecodedOptions {
		max_tokens: req.max_output_tokens,
		temperature: req.temperature,
		session_id: session.clone(),
		tool_choice: req.tool_choice.clone(),
		reasoning: req.reasoning.as_ref().map(|r| r.effort.clone()),
	};
	let unified = UnifiedRequest { model: req.model.clone(), context: TranscriptContext { messages }, options: options.clone() };
	let info = RequestInfo { api: API.to_string(), key_id, model: req.model, options, session_signal: session };
	Ok((unified, info))
}

fn flush_assistant(pending: &mut Vec<ContentBlock>, model: &str, messages: &mut Vec<Message>) {
	if pending.is_empty() {
		return;
	}
	messages.push(Message::Assistant(AssistantMessage {
		content: std::mem::take(pending),
		api: API.to_string(),
		provider: PROVIDER.to_string(),
		model: model.to_string(),
		usage: Usage::default(),
		stop_reason: StopReason::Stop,
		timestamp: 0,
		response_model: None,
		response_id: None,
		provider_thinking_level: None,
		thinking_level: None,
		error_message: None,
		raw_stop_reason: None,
		end_turn: None,
		duration_ms: None,
	}));
}

fn attach_tools(req: &WireRequest, messages: &mut Vec<Message>) -> Result<(), String> {
	let Some(tools) = req.tools.as_ref() else { return Ok(()) };
	let decoded: Vec<Tool> = tools.iter().map(|t| match t {
		WireTool::Function { name, description, parameters } => Ok(Tool {
			name: name.clone(),
			description: description.clone(),
			parameters: parameters.clone(),
			constrained_sampling: None,
		}),
		WireTool::Custom { name, description, format } => crate::api::grammar_tool::decode_grammar_tool(
			name, description, &format.syntax, &format.definition,
		),
	}).collect::<Result<_, _>>()?;
	match messages.first_mut() {
		Some(Message::System(s)) => s.tools_added = Some(decoded),
		_ => messages.insert(0, Message::System(SystemMessage {
			content: SystemContent::Text(String::new()),
			sections: None,
			tools_added: Some(decoded),
			tools_removed: None,
			timestamp: 0,
		})),
	}
	Ok(())
}

fn user_blocks(parts: &[WireInputPart]) -> Result<Option<UserContent>, String> {
	let blocks: Vec<UserBlock> = parts.iter().map(|p| match p {
		WireInputPart::InputText { text } => {
			Ok::<UserBlock, String>(UserBlock::Text(TextContent { text: text.clone(), text_signature: None }))
		}
		WireInputPart::InputImage { image_url } => {
			let (mime_type, data) = split_data_uri(image_url)?;
			Ok(UserBlock::Image(ImageContent { data, mime_type }))
		}
	}).collect::<Result<_, _>>()?;
	Ok(if blocks.is_empty() { None } else { Some(UserContent::Blocks(blocks)) })
}

fn output_content(output: &WireOutputContent) -> Result<Vec<UserBlock>, String> {
	match output {
		WireOutputContent::Text(s) => {
			Ok(vec![UserBlock::Text(TextContent { text: s.clone(), text_signature: None })])
		}
		WireOutputContent::Parts(parts) => parts.iter().map(|p| match p {
			WireInputPart::InputText { text } => {
				Ok(UserBlock::Text(TextContent { text: text.clone(), text_signature: None }))
			}
			WireInputPart::InputImage { image_url } => {
				let (mime_type, data) = split_data_uri(image_url)?;
				Ok(UserBlock::Image(ImageContent { data, mime_type }))
			}
		}).collect(),
	}
}

fn call_full_id(call_id: &str, item_id: Option<&str>) -> String {
	match item_id {
		Some(item) => format!("{call_id}|{item}"),
		None => call_id.to_string(),
	}
}


