use crate::api::encode_thinking::{project_content, SignatureDomain};
use serde_json::{json, Map, Value};

use crate::model::*;

use super::vendor::short_hash;

pub fn encode_error(err: &MockError) -> String {
	json!({"error": {"code": err.code, "message": err.message}}).to_string()
}

pub fn encode_response(msg: &AssistantMessage) -> Result<Vec<String>, String> {
	encode_response_with_end_turn(msg, None)
}

pub(crate) fn encode_response_with_end_turn(msg: &AssistantMessage, end_turn: Option<bool>) -> Result<Vec<String>, String> {
	let resp_id = msg.response_id.clone().unwrap_or_else(|| "resp_mock".to_string());
	let mut frames = vec![frame(json!({"type": "response.created", "response": {"id": resp_id}}))];
	let content = project_content(&msg.content, SignatureDomain::ReasoningItem);
	for (i, block) in content.iter().enumerate() {
		match block {
			ContentBlock::Thinking(t) => {
				let item = match &t.thinking_signature {
					Some(s) => serde_json::from_str::<Value>(s).map_err(|e| format!("thinking signature: {e}"))?,
					None => json!({"type": "reasoning", "id": format!("rs_{i}"), "summary": [{"type": "summary_text", "text": t.thinking}]}),
				};
				if item.get("type").and_then(Value::as_str) != Some("reasoning") {
					return Err("thinking signature is not a reasoning item".to_string());
				}
				let fallback = format!("rs_{i}");
				let id = item.get("id").and_then(Value::as_str).unwrap_or(&fallback);
				frames.push(frame(json!({"type": "response.output_item.added", "output_index": i, "item": {"type": "reasoning", "id": id, "summary": []}})));
				if !t.thinking.is_empty() {
					frames.push(frame(json!({"type": "response.reasoning_summary_text.delta", "output_index": i, "delta": t.thinking})));
				}
				frames.push(frame(json!({"type": "response.output_item.done", "output_index": i, "item": item})));
			}
			ContentBlock::Text(t) => {
				let (id, phase) = match &t.text_signature {
					Some(s) => parse_text_signature(s)?,
					None => (format!("msg_{i}"), None),
				};
				let mut done = Map::new();
				done.insert("type".into(), json!("message"));
				done.insert("id".into(), json!(id));
				done.insert("role".into(), json!("assistant"));
				done.insert("status".into(), json!("completed"));
				done.insert("content".into(), json!([{"type": "output_text", "text": t.text, "annotations": []}]));
				if let Some(p) = phase {
					done.insert("phase".into(), json!(p));
				}
				frames.push(frame(json!({"type": "response.output_item.added", "output_index": i, "item": {"type": "message", "id": id, "role": "assistant", "status": "in_progress", "content": []}})));
				if !t.text.is_empty() {
					frames.push(frame(json!({"type": "response.output_text.delta", "output_index": i, "delta": t.text})));
				}
				frames.push(frame(json!({"type": "response.output_item.done", "output_index": i, "item": Value::Object(done)})));
			}
			ContentBlock::ToolCall(c) => {
				let (call_id, item_id) = match c.id.split_once('|') {
					Some((call, item)) => (call.to_string(), item.to_string()),
					None => (c.id.clone(), format!("fc_{}", short_hash(&c.id))),
				};
				let mut done = Map::new();
				done.insert("type".into(), json!("function_call"));
				done.insert("id".into(), json!(item_id));
				done.insert("call_id".into(), json!(call_id));
				done.insert("name".into(), json!(c.name));
				done.insert("arguments".into(), json!(Value::Object(c.arguments.clone()).to_string()));
				if let Some(ns) = &c.namespace {
					done.insert("namespace".into(), json!(ns));
				}
				frames.push(frame(json!({"type": "response.output_item.added", "output_index": i, "item": {"type": "function_call", "id": item_id, "call_id": call_id, "name": c.name, "arguments": ""}})));
				frames.push(frame(json!({"type": "response.output_item.done", "output_index": i, "item": Value::Object(done)})));
			}
			ContentBlock::Image(_) => return Err("image blocks are not encodable in a response stream".to_string()),
		}
	}
	frames.push(terminal_frame(msg, &resp_id, end_turn)?);
	Ok(frames)
}

fn parse_text_signature(s: &str) -> Result<(String, Option<String>), String> {
	if s.starts_with('{') {
		if let Ok(v) = serde_json::from_str::<Value>(s) {
			if v.get("v").and_then(Value::as_i64) == Some(1) {
				if let Some(id) = v.get("id").and_then(Value::as_str) {
					let phase = v.get("phase").and_then(Value::as_str).map(str::to_string);
					return Ok((id.to_string(), phase));
				}
			}
		}
	}
	Ok((s.to_string(), None))
}

fn terminal_frame(msg: &AssistantMessage, resp_id: &str, end_turn: Option<bool>) -> Result<String, String> {
	let usage = &msg.usage;
	let mut usage_json = json!({
		"input_tokens": usage.input + usage.cache_read + usage.cache_write,
		"output_tokens": usage.output,
		"total_tokens": usage.total_tokens,
		"input_tokens_details": {"cached_tokens": usage.cache_read, "cache_write_tokens": usage.cache_write},
	});
	if let Some(r) = usage.reasoning {
		usage_json["output_tokens_details"] = json!({"reasoning_tokens": r});
	}
	let event_type = match msg.stop_reason {
		StopReason::Stop | StopReason::ToolUse => "response.completed",
		StopReason::Length => "response.incomplete",
		StopReason::Error => "response.failed",
		other => return Err(format!("stop reason {other:?} is not encodable")),
	};
	let mut response = match msg.stop_reason {
		StopReason::Length => json!({"id": resp_id, "status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}, "usage": usage_json}),
		StopReason::Error => json!({"id": resp_id, "status": "failed", "error": {"code": "server_error", "message": msg.error_message.clone().unwrap_or_else(|| "unknown error".to_string())}}),
		_ => json!({"id": resp_id, "status": "completed", "usage": usage_json}),
	};
	if msg.stop_reason != StopReason::Error {
		if let Some(value) = end_turn {
			response["end_turn"] = json!(value);
		}
	}
	Ok(frame(json!({"type": event_type, "response": response})))
}

fn frame(v: Value) -> String {
	format!("data: {v}\n\n")
}
