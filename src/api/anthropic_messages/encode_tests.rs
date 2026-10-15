//! Encode-side fixture tests. SSE frame shapes derive from
//! pi-mono packages/ai/test/anthropic-sse-parsing.test.ts (minimalAnthropicEvents,
//! tool_use input_json_delta, thinking/signature_delta).

use serde_json::{json, Value};

use super::{encode_error, encode_message};
use crate::model::{
	AssistantMessage, ContentBlock, MockError, StopReason, TextContent, ThinkingContent, ToolCall, Usage,
};

fn assistant(content: Vec<ContentBlock>, stop: StopReason) -> AssistantMessage {
	AssistantMessage {
		content,
		api: "anthropic-messages".to_owned(),
		provider: "anthropic".to_owned(),
		model: "claude-sonnet-4-6".to_owned(),
		response_model: None,
		response_id: None,
		provider_thinking_level: None,
		thinking_level: None,
		usage: Usage { input: 12, output: 5, ..Usage::default() },
		stop_reason: stop,
		error_message: None,
		raw_stop_reason: None,
		end_turn: None,
		timestamp: 0,
		duration_ms: None,
	}
}

fn parse_frames(frames: &[String]) -> Vec<(&str, Value)> {
	frames
		.iter()
		.map(|frame| {
			let mut lines = frame.trim_end_matches('\n').splitn(2, '\n');
			let event = lines.next().unwrap().strip_prefix("event: ").unwrap();
			let data = lines.next().unwrap().strip_prefix("data: ").unwrap();
			(event, serde_json::from_str(data).unwrap())
		})
		.collect()
}

#[test]
fn encodes_text_response_like_minimal_fixture() {
	let mut message = assistant(
		vec![ContentBlock::Text(TextContent { text: "Hello".to_owned(), text_signature: None })],
		StopReason::Stop,
	);
	message.response_id = Some("msg_test".to_owned());
	let encoded = encode_message(&message).unwrap();
	assert!(encoded[0].starts_with("event: message_start\ndata: "));
	assert!(encoded[0].ends_with("\n\n"));
	let usage = json!({"input_tokens": 12, "output_tokens": 5, "cache_read_input_tokens": 0,
					   "cache_creation_input_tokens": 0});
	assert_eq!(
		parse_frames(&encoded),
		vec![
			("message_start", json!({"type": "message_start",
				"message": {"id": "msg_test", "model": "claude-sonnet-4-6", "usage": usage}})),
			("content_block_start", json!({"type": "content_block_start", "index": 0,
				"content_block": {"type": "text", "text": ""}})),
			("content_block_delta", json!({"type": "content_block_delta", "index": 0,
				"delta": {"type": "text_delta", "text": "Hello"}})),
			("content_block_stop", json!({"type": "content_block_stop", "index": 0})),
			("message_delta", json!({"type": "message_delta", "delta": {"stop_reason": "end_turn"},
				"usage": usage})),
			("message_stop", json!({"type": "message_stop"})),
		]
	);
}

#[test]
fn encodes_thinking_redacted_and_tool_call_blocks() {
	let message = assistant(
		vec![
			ContentBlock::Thinking(ThinkingContent {
				thinking: "thought".to_owned(),
				thinking_signature: Some("sig".to_owned()),
				redacted: None,
			}),
			ContentBlock::Thinking(ThinkingContent {
				thinking: "[Reasoning redacted]".to_owned(),
				thinking_signature: Some("opaque".to_owned()),
				redacted: Some(true),
			}),
			ContentBlock::ToolCall(ToolCall {
				id: "toolu_1".to_owned(),
				name: "edit".to_owned(),
				arguments: json!({"path": "a.rs"}).as_object().unwrap().clone(),
				thought_signature: None,
				namespace: None,
			}),
		],
		StopReason::ToolUse,
	);
	let encoded = encode_message(&message).unwrap();
	let frames = parse_frames(&encoded);
	assert_eq!(frames[1], ("content_block_start", json!({"type": "content_block_start", "index": 0,
		"content_block": {"type": "thinking", "thinking": "", "signature": ""}})));
	assert_eq!(frames[2], ("content_block_delta", json!({"type": "content_block_delta", "index": 0,
		"delta": {"type": "thinking_delta", "thinking": "thought"}})));
	assert_eq!(frames[3], ("content_block_delta", json!({"type": "content_block_delta", "index": 0,
		"delta": {"type": "signature_delta", "signature": "sig"}})));
	assert_eq!(frames[5], ("content_block_start", json!({"type": "content_block_start", "index": 1,
		"content_block": {"type": "redacted_thinking", "data": "opaque"}})));
	assert_eq!(frames[7], ("content_block_start", json!({"type": "content_block_start", "index": 2,
		"content_block": {"type": "tool_use", "id": "toolu_1", "name": "edit", "input": {}}})));
	assert_eq!(frames[8], ("content_block_delta", json!({"type": "content_block_delta", "index": 2,
		"delta": {"type": "input_json_delta", "partial_json": "{\"path\":\"a.rs\"}"}})));
	assert_eq!(frames[10], ("message_delta", json!({"type": "message_delta",
		"delta": {"stop_reason": "tool_use"}, "usage": {"input_tokens": 12, "output_tokens": 5,
		"cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}})));
}

#[test]
fn encodes_error_stop_reason_as_refusal() {
	let mut message = assistant(vec![], StopReason::Error);
	message.error_message = Some("boom".to_owned());
	let encoded = encode_message(&message).unwrap();
	let frames = parse_frames(&encoded);
	assert_eq!(frames[1], ("message_delta", json!({"type": "message_delta",
		"delta": {"stop_reason": "refusal",
				  "stop_details": {"type": "refusal", "explanation": "boom"}},
		"usage": {"input_tokens": 12, "output_tokens": 5, "cache_read_input_tokens": 0,
				  "cache_creation_input_tokens": 0}})));
}

#[test]
fn encodes_mock_error_as_error_event() {
	let encoded = encode_error(&MockError {
		status: 429,
		code: "rate_limit_error".to_owned(),
		message: "Too many requests".to_owned(),
	});
	assert_eq!(
		parse_frames(&encoded),
		vec![("error", json!({"type": "error",
			"error": {"type": "rate_limit_error", "message": "Too many requests"}}))]
	);
}

#[test]
fn refusal_stops_preserve_explanation_or_use_the_default() {
	for stop in [StopReason::Error, StopReason::Pending, StopReason::Aborted, StopReason::Deferred] {
		for explanation in [None, Some(""), Some("cancelled")] {
			let mut message = assistant(vec![], stop);
			message.error_message = explanation.map(str::to_owned);
			let encoded = encode_message(&message).unwrap();
			let frames = parse_frames(&encoded);
			assert_eq!(frames[1].1["delta"]["stop_reason"], "refusal");
			assert_eq!(frames[1].1["delta"]["stop_details"]["explanation"],
				explanation.filter(|text| !text.is_empty()).unwrap_or("The model refused to complete the request"));
		}
	}
}
