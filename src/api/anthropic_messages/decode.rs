//! Decode a pi-ai anthropic-messages wire request into the unified model.
//! Mapping spec: docs/design/mock-llm-server/api/anthropic-messages.md.

use std::collections::HashMap;

use serde_json::Value;

use super::messages::{decode_assistant, decode_system_update, decode_user, wire_tool};
use super::vendor::{WireBlock, WireContent, WireRequest};
use crate::model::*;

pub struct WireHeaders<'a> {
	pub x_api_key: Option<&'a str>,
	pub authorization: Option<&'a str>,
	pub x_session_affinity: Option<&'a str>,
	pub x_session_id: Option<&'a str>,
}

#[derive(Debug)]
pub struct Decoded {
	pub request: UnifiedRequest,
	pub info: RequestInfo,
}

pub fn decode_request(body: &Value, headers: &WireHeaders) -> Result<Decoded, String> {
	let wire: WireRequest =
		serde_json::from_value(body.clone()).map_err(|e| format!("invalid anthropic wire request: {e}"))?;
	let key_id = headers
		.x_api_key
		.map(str::to_owned)
		.or_else(|| {
			headers
				.authorization
				.map(|v| crate::bearer::bearer_token(v).unwrap_or(v).to_owned())
		})
		.ok_or_else(|| "missing x-api-key/authorization header".to_owned())?;
	let mut messages: Vec<Message> = Vec::new();
	let mut tool_names: HashMap<String, String> = HashMap::new();
	let mut reasoning: Option<String> = None;
	for msg in &wire.messages {
		match msg.role.as_str() {
			"user" => decode_user(msg, &mut tool_names, &mut messages)?,
			"assistant" => {
				messages.push(Message::Assistant(decode_assistant(msg, &wire.model, &mut tool_names)?))
			}
			"system" => match msg.output_config.as_ref().and_then(effort_of) {
				Some(effort) => reasoning = Some(effort),
				None => {
					if let Some(WireContent::Blocks(blocks)) = &msg.content {
						messages.push(Message::System(decode_system_update(blocks)));
					}
				}
			},
			role => return Err(format!("unsupported message role: {role}")),
		}
	}
	if reasoning.is_none() {
		reasoning = wire.output_config.as_ref().and_then(effort_of);
	}
	if let Some(thinking) = &wire.thinking {
		reasoning = Some(match thinking["type"].as_str() {
			Some("enabled") => format!("budget:{}", thinking["budget_tokens"].as_u64().unwrap_or(1024)),
			Some("disabled") => "off".to_owned(),
			_ => reasoning.unwrap_or_else(|| "high".to_owned()),
		});
	}
	if let Some(system_message) = build_system_message(&wire.system, &wire.tools) {
		messages.insert(0, Message::System(system_message));
	}
	let session_header = headers
		.x_session_affinity
		.or(headers.x_session_id)
		.map(str::to_owned);
	let session_signal = session_header.clone().or_else(|| {
		wire.metadata
			.as_ref()
			.and_then(|m| m["user_id"].as_str())
			.map(str::to_owned)
	});
	let options = DecodedOptions {
		max_tokens: Some(wire.max_tokens),
		temperature: wire.temperature,
		session_id: session_header,
		tool_choice: wire.tool_choice.as_ref().map(|v| match v["type"].as_str() {
			Some("auto" | "any" | "none") => v["type"].clone(),
			_ => v.clone(),
		}),
		reasoning,
	};
	let info = RequestInfo {
		api: "anthropic-messages".to_owned(),
		key_id,
		model: wire.model.clone(),
		options: options.clone(),
		session_signal,
	};
	Ok(Decoded {
		request: UnifiedRequest {
			model: wire.model,
			context: TranscriptContext { messages },
			options,
		},
		info,
	})
}

fn effort_of(config: &Value) -> Option<String> {
	config["effort"].as_str().map(str::to_owned)
}

fn build_system_message(system: &Option<WireContent>, tools: &Option<Vec<super::vendor::WireTool>>) -> Option<SystemMessage> {
	let system_text = match system {
		Some(WireContent::Text(text)) => Some(text.clone()),
		Some(WireContent::Blocks(blocks)) => Some(
			blocks
				.iter()
				.filter_map(|b| match b {
					WireBlock::Text { text } => Some(text.clone()),
					_ => None,
				})
				.collect::<Vec<_>>()
				.join("\n\n"),
		),
		None => None,
	};
	let tools: Vec<Tool> = tools
		.iter()
		.flatten()
		.filter(|t| t.name != "__pi_deferred_placeholder__")
		.map(wire_tool)
		.collect();
	if system_text.is_none() && tools.is_empty() {
		return None;
	}
	Some(SystemMessage {
		content: SystemContent::Text(system_text.unwrap_or_default()),
		sections: None,
		tools_added: (!tools.is_empty()).then_some(tools),
		tools_removed: None,
		timestamp: 0,
	})
}
