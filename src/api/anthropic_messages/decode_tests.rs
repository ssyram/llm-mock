//! Decode-side fixture tests. Wire samples derive from pi-mono packages/ai/test:
//! anthropic-mid-conversation-effort.test.ts (effort markers),
//! anthropic-empty-thinking-signature-compat.test.ts (thinking blocks).

use serde_json::{json, Value};

use super::{decode_request, WireHeaders};

fn headers<'a>() -> WireHeaders<'a> {
	WireHeaders {
		x_api_key: Some("sk-test"),
		authorization: None,
		x_session_affinity: None,
		x_session_id: None,
	}
}

fn full_conversation_wire() -> Value {
	json!({
		"model": "claude-sonnet-4-6",
		"max_tokens": 1024,
		"stream": true,
		"temperature": 0,
		"system": [{"type": "text", "text": "You are helpful.", "cache_control": {"type": "ephemeral"}}],
		"messages": [
			{"role": "user", "content": "hello"},
			{"role": "assistant", "content": [
				{"type": "thinking", "thinking": "hmm", "signature": "sig1"},
				{"type": "text", "text": "Calling edit"},
				{"type": "tool_use", "id": "toolu_1", "name": "edit", "input": {"path": "a.rs"}}
			]},
			{"role": "user", "content": [
				{"type": "tool_result", "tool_use_id": "toolu_1", "content": "done", "is_error": false}
			]},
			{"role": "user", "content": [
				{"type": "text", "text": "thanks", "cache_control": {"type": "ephemeral"}}
			]}
		],
		"tools": [
			{"name": "edit", "description": "Edit a file",
			 "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": []},
			 "eager_input_streaming": true, "cache_control": {"type": "ephemeral"}}
		],
		"tool_choice": {"type": "auto"}
	})
}

#[test]
fn decodes_full_conversation_to_canonical_form() {
	let decoded = decode_request(&full_conversation_wire(), &headers()).unwrap();
	let zero_cost = json!({"input": 0.0, "output": 0.0, "cacheRead": 0.0, "cacheWrite": 0.0, "total": 0.0});
	assert_eq!(
		serde_json::to_value(&decoded.request).unwrap(),
		json!({
			"model": "claude-sonnet-4-6",
			"context": {"messages": [
				{"role": "system", "content": "You are helpful.", "toolsAdded": [
					{"name": "edit", "description": "Edit a file",
					 "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": []}}
				], "timestamp": 0},
				{"role": "user", "content": "hello", "timestamp": 0},
				{"role": "assistant", "content": [
					{"type": "thinking", "thinking": "hmm", "thinkingSignature": "sig1"},
					{"type": "text", "text": "Calling edit"},
					{"type": "toolCall", "id": "toolu_1", "name": "edit", "arguments": {"path": "a.rs"}}
				], "api": "anthropic-messages", "provider": "anthropic", "model": "claude-sonnet-4-6",
				   "usage": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 0, "cost": zero_cost},
				   "stopReason": "stop", "timestamp": 0},
				{"role": "toolResult", "toolCallId": "toolu_1", "toolName": "edit",
				 "content": [{"text": "done"}], "isError": false, "timestamp": 0},
				{"role": "user", "content": [{"text": "thanks"}], "timestamp": 0}
			]},
			"options": {"maxTokens": 1024, "temperature": 0.0, "toolChoice": "auto"}
		})
	);
	assert_eq!(
		serde_json::to_value(&decoded.info).unwrap(),
		json!({"api": "anthropic-messages", "keyId": "sk-test", "model": "claude-sonnet-4-6",
			   "options": {"maxTokens": 1024, "temperature": 0.0, "toolChoice": "auto"}})
	);
}

#[test]
fn decodes_effort_markers_as_reasoning_option() {
	let body = json!({
		"model": "claude-opus-4-8",
		"max_tokens": 2048,
		"stream": true,
		"thinking": {"type": "adaptive", "display": "summarized",
					 "block_binding": {"prefix_mismatch_behavior": "drop_block"}},
		"output_config": {"effort": "high"},
		"messages": [
			{"role": "user", "content": "one"},
			{"role": "system", "content": [], "output_config": {"effort": "high"}}
		]
	});
	let decoded = decode_request(&body, &headers()).unwrap();
	assert_eq!(
		serde_json::to_value(&decoded.request).unwrap(),
		json!({
			"model": "claude-opus-4-8",
			"context": {"messages": [{"role": "user", "content": "one", "timestamp": 0}]},
			"options": {"maxTokens": 2048, "reasoning": "high"}
		})
	);
}

#[test]
fn assistant_string_content_equals_one_text_block() {
	for text in ["Hi, I'm Claude.", "中文 🎉\nnext line"] {
		let mut body = json!({
			"model": "claude-sonnet-4-6", "max_tokens": 64,
			"messages": [
				{"role": "user", "content": "hello"},
				{"role": "assistant", "content": text},
				{"role": "user", "content": "continue"}
			]
		});
		let shorthand = decode_request(&body, &headers()).unwrap();
		body["messages"][1]["content"] = json!([{"type": "text", "text": text}]);
		let blocks = decode_request(&body, &headers()).unwrap();
		let request = serde_json::to_value(&shorthand.request).unwrap();
		assert_eq!(request, serde_json::to_value(&blocks.request).unwrap());
		assert_eq!(request["context"]["messages"][1]["content"], json!([{"type":"text", "text":text}]));
		assert_eq!(serde_json::to_value(&shorthand.info).unwrap(), serde_json::to_value(&blocks.info).unwrap());
	}
}

#[test]
fn rejects_missing_or_non_content_assistant_values() {
	for content in [Value::Null, json!(42), json!({"text":"not a block array"})] {
		let body = json!({"model":"m", "max_tokens":16, "messages":[{"role":"assistant", "content":content}]});
		assert!(decode_request(&body, &headers()).is_err());
	}
}

#[test]
fn rejects_tool_result_without_matching_tool_use() {
	let body = json!({
		"model": "claude-sonnet-4-6",
		"max_tokens": 64,
		"stream": true,
		"messages": [
			{"role": "user", "content": [
				{"type": "tool_result", "tool_use_id": "toolu_missing", "content": "x", "is_error": false}
			]}
		]
	});
	let err = decode_request(&body, &headers()).unwrap_err();
	assert!(err.contains("tool_result without matching tool_use"), "{err}");
}
