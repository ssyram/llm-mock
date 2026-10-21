use serde_json::{json, Value};
use crate::model::*;
use super::encode::{encode_error, encode_response};
use super::vendor::short_hash;

fn assistant(content: Vec<ContentBlock>, stop: StopReason) -> AssistantMessage {
	AssistantMessage {
		record: Default::default(),
		content,
		api: "openai-responses".to_string(),
		provider: "openai".to_string(),
		model: "gpt-5.4".to_string(),
		usage: Usage::default(),
		stop_reason: stop,
		timestamp: 0,
		response_model: None,
		response_id: None,
		provider_thinking_level: None,
		thinking_level: None,
		error_message: None,
		raw_stop_reason: None,
		end_turn: None,
		duration_ms: None,
	}
}

fn frames_value(frames: &[String]) -> Vec<Value> {
	frames.iter().map(|f| serde_json::from_str(f.trim_start_matches("data: ").trim_end()).unwrap()).collect()
}

#[test]
fn encode_tool_call_stream() {
	// openai-responses-namespace.test.ts + openai-responses-terminal-event.test.ts frame shapes
	let msg = assistant(
		vec![ContentBlock::ToolCall(ToolCall {
			id: "call_test|fc_test".to_string(),
			name: "lookup".to_string(),
			arguments: [("value".to_string(), json!("hello"))].into_iter().collect(),
			thought_signature: None,
			namespace: Some("dynamic_tools".to_string()),
		})],
		StopReason::ToolUse,
	);
	let frames = frames_value(&encode_response(&msg).unwrap());
	assert_eq!(frames.len(), 4);
	assert_eq!(frames[0], json!({"type": "response.created", "response": {"id": "resp_mock"}}));
	assert_eq!(frames[1]["item"], json!({"type": "function_call", "id": "fc_test", "call_id": "call_test", "name": "lookup", "arguments": ""}));
	assert_eq!(frames[2]["item"], json!({"type": "function_call", "id": "fc_test", "call_id": "call_test", "name": "lookup", "arguments": "{\"value\":\"hello\"}", "namespace": "dynamic_tools"}));
	assert_eq!(frames[3]["type"], "response.completed");
	assert_eq!(frames[3]["response"]["status"], "completed");
}

#[test]
fn encode_text_thinking_and_usage() {
	let mut msg = assistant(
		vec![
			ContentBlock::Thinking(ThinkingContent {
				thinking: "private".to_string(),
				thinking_signature: Some(r#"{"encrypted_content":"enc","id":"rs_1","summary":[],"type":"reasoning"}"#.to_string()),
				redacted: None,
			}),
			ContentBlock::Text(TextContent {
				text: "Hello".to_string(),
				text_signature: Some(r#"{"v":1,"id":"msg_9","phase":"final_answer"}"#.to_string()),
			}),
		],
		StopReason::Stop,
	);
	msg.response_id = Some("resp_test".to_string());
	msg.usage = Usage { input: 10, cache_read: 2, cache_write: 3, output: 4, reasoning: Some(1), total_tokens: 17, ..Usage::default() };
	let frames = frames_value(&encode_response(&msg).unwrap());
	assert_eq!(frames.len(), 8);
	assert_eq!(frames[1]["item"], json!({"type": "reasoning", "id": "rs_1", "summary": []}));
	assert_eq!(frames[2], json!({"type": "response.reasoning_summary_text.delta", "output_index": 0, "delta": "private"}));
	assert_eq!(frames[3]["item"]["encrypted_content"], "enc");
	let text_done = &frames[6]["item"];
	assert_eq!(text_done["id"], "msg_9");
	assert_eq!(text_done["phase"], "final_answer");
	assert_eq!(text_done["content"][0]["text"], "Hello");
	let usage = &frames[7]["response"]["usage"];
	assert_eq!(usage["input_tokens"], 15);
	assert_eq!(usage["input_tokens_details"]["cached_tokens"], 2);
	assert_eq!(usage["input_tokens_details"]["cache_write_tokens"], 3);
	assert_eq!(usage["output_tokens"], 4);
	assert_eq!(usage["output_tokens_details"]["reasoning_tokens"], 1);
	assert_eq!(usage["total_tokens"], 17);
}

#[test]
fn encode_stop_reasons_and_errors() {
	let length = assistant(vec![], StopReason::Length);
	let frames = frames_value(&encode_response(&length).unwrap());
	assert_eq!(frames[1]["type"], "response.incomplete");
	assert_eq!(frames[1]["response"]["incomplete_details"]["reason"], "max_output_tokens");
	let mut error = assistant(vec![], StopReason::Error);
	error.error_message = Some("boom".to_string());
	let frames = frames_value(&encode_response(&error).unwrap());
	assert_eq!(frames[1]["type"], "response.failed");
	assert_eq!(frames[1]["response"]["error"]["message"], "boom");
	assert!(encode_response(&assistant(vec![], StopReason::Aborted)).is_err());
	assert_eq!(
		encode_error(&MockError { status: 500, code: "server_error".to_string(), message: "boom".to_string() }),
		r#"{"error":{"code":"server_error","message":"boom"}}"#
	);
}

#[test]
fn encode_synthesizes_item_ids_for_foreign_tool_calls() {
	// id without "|": item id = fc_ + short_hash(id), else the parser yields "<call>|undefined"
	assert_eq!(short_hash("tool-1"), "usyvb21d8zol2");
	let msg = assistant(
		vec![ContentBlock::ToolCall(ToolCall {
			id: "tool-1".to_string(),
			name: "bash".to_string(),
			arguments: [("command".to_string(), json!("true"))].into_iter().collect(),
			thought_signature: None,
			namespace: None,
		})],
		StopReason::ToolUse,
	);
	let frames = frames_value(&encode_response(&msg).unwrap());
	assert_eq!(frames[1]["item"]["id"], "fc_usyvb21d8zol2");
	assert_eq!(frames[1]["item"]["call_id"], "tool-1");
}
