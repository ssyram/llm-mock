//! Encode a unified AssistantMessage / MockError into SSE frames that
//! pi-ai's anthropic-messages stream parser accepts (spec §c).

use crate::api::encode_thinking::{project_content, SignatureDomain};

use serde_json::{json, Map, Value};

use crate::model::{AssistantMessage, ContentBlock, MockError, StopReason, Usage};

pub fn encode_message(msg: &AssistantMessage) -> Result<Vec<String>, String> {
	let id = msg.response_id.clone().unwrap_or_else(|| "msg_mock".to_owned());
	let mut frames = vec![frame(
		"message_start",
		json!({
			"type": "message_start",
			"message": {"id": id, "model": msg.model, "usage": usage_json(&msg.usage)}
		}),
	)];
	let content = project_content(&msg.content, SignatureDomain::Opaque);
	for (index, block) in content.iter().enumerate() {
		match block {
			ContentBlock::Text(text) => {
				frames.push(block_start(index, json!({"type": "text", "text": ""})));
				frames.push(block_delta(index, json!({"type": "text_delta", "text": text.text})));
				frames.push(block_stop(index));
			}
			ContentBlock::Thinking(thinking) if thinking.redacted == Some(true) => {
				let data = thinking.thinking_signature.clone().unwrap_or_default();
				frames.push(block_start(index, json!({"type": "redacted_thinking", "data": data})));
				frames.push(block_stop(index));
			}
			ContentBlock::Thinking(thinking) => {
				frames.push(block_start(index, json!({"type": "thinking", "thinking": "", "signature": ""})));
				frames.push(block_delta(index, json!({"type": "thinking_delta", "thinking": thinking.thinking})));
				if let Some(signature) = &thinking.thinking_signature {
					if !signature.is_empty() {
						frames.push(block_delta(index, json!({"type": "signature_delta", "signature": signature})));
					}
				}
				frames.push(block_stop(index));
			}
			ContentBlock::ToolCall(call) => {
				frames.push(block_start(
					index,
					json!({"type": "tool_use", "id": call.id, "name": call.name, "input": {}}),
				));
				let partial_json = Value::Object(call.arguments.clone()).to_string();
				frames.push(block_delta(index, json!({"type": "input_json_delta", "partial_json": partial_json})));
				frames.push(block_stop(index));
			}
			ContentBlock::Image(_) => {
				return Err("anthropic-messages cannot encode image blocks in responses".to_owned())
			}
		}
	}
	let (reason, explanation) = stop_reason(msg);
	let delta = match explanation {
		Some(explanation) => json!({
			"stop_reason": reason,
			"stop_details": {"type": "refusal", "explanation": explanation}
		}),
		None => json!({"stop_reason": reason}),
	};
	frames.push(frame(
		"message_delta",
		json!({"type": "message_delta", "delta": delta, "usage": usage_json(&msg.usage)}),
	));
	frames.push(frame("message_stop", json!({"type": "message_stop"})));
	Ok(frames)
}

pub fn encode_error(err: &MockError) -> Vec<String> {
	vec![frame(
		"error",
		json!({"type": "error", "error": {"type": err.code, "message": err.message}}),
	)]
}

fn frame(event: &str, data: Value) -> String {
	format!("event: {event}\ndata: {data}\n\n")
}

fn block_start(index: usize, content_block: Value) -> String {
	frame(
		"content_block_start",
		json!({"type": "content_block_start", "index": index, "content_block": content_block}),
	)
}

fn block_delta(index: usize, delta: Value) -> String {
	frame(
		"content_block_delta",
		json!({"type": "content_block_delta", "index": index, "delta": delta}),
	)
}

fn block_stop(index: usize) -> String {
	frame("content_block_stop", json!({"type": "content_block_stop", "index": index}))
}

fn stop_reason(msg: &AssistantMessage) -> (&'static str, Option<String>) {
	match msg.stop_reason {
		StopReason::Stop => ("end_turn", None),
		StopReason::Length => ("max_tokens", None),
		StopReason::ToolUse => ("tool_use", None),
		_ => (
			"refusal",
			Some(
				msg.error_message
					.clone()
					.filter(|message| !message.is_empty())
					.unwrap_or_else(|| "The model refused to complete the request".to_owned()),
			),
		),
	}
}

fn usage_json(usage: &Usage) -> Value {
	let mut map = Map::new();
	map.insert("input_tokens".to_owned(), json!(usage.input));
	map.insert("output_tokens".to_owned(), json!(usage.output));
	map.insert("cache_read_input_tokens".to_owned(), json!(usage.cache_read));
	map.insert("cache_creation_input_tokens".to_owned(), json!(usage.cache_write));
	if let Some(one_hour) = usage.cache_write_1h {
		map.insert(
			"cache_creation".to_owned(),
			json!({"ephemeral_1h_input_tokens": one_hour}),
		);
	}
	if let Some(reasoning) = usage.reasoning {
		map.insert("output_tokens_details".to_owned(), json!({"thinking_tokens": reasoning}));
	}
	Value::Object(map)
}
