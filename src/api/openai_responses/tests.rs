use serde_json::{json, Value};

use crate::model::*;

use super::decode::decode_request;
use super::vendor::short_hash;

fn auth_only() -> Vec<(String, String)> {
	vec![("Authorization".to_string(), "Bearer sk-test".to_string())]
}

// wire fixtures derive from pi-mono/packages/ai/test/*, sources noted per test

#[test]
fn decode_foreign_tool_call_id() {
	// openai-responses-foreign-toolcall-id.test.ts
	let item = "I9b95oN1wD/cHXKTw3PpRkL6KkCtzTJhUxMouMWYwHeTo2j3htzfSk7YPx2vifiIM4g3A8XXyOj8q4Bt6SLUG7gqY1E3ELkrkVQNHglRfUmWj84lqxJY+Puieb3VKyX0FB+83TUzn91cDMF/4gzt990IzqVrc+nIb9RRscRD070Du16q1glydVjWR0SBJsE6TbY/esOjFpqplogQqrajm1eI++f3eLi73R6q7hVusY0QbeFySVxABCjhN0lXB04caBe1rzHjYzul6MAXb7uq+0r17VLq+yrtyYhN12wkmFqHeqTyEei6EFPyMy24Nc+IbJlkP0OCg02W+gOnyBFcbi2ctcJFSOHQqSjt1DnqBdqCnnhwUqXjbWiT0wh3DmLScRgTHmGkaZI+oAcQQjfic65nxj+TnEkReA==";
	assert_eq!(short_hash(item), "1l1qc04z6lycg");
	let body = json!({
		"model": "gpt-5.5",
		"input": [
			{"role": "developer", "content": "You are concise."},
			{"role": "user", "content": [{"type": "input_text", "text": "Use the tool."}]},
			{"type": "function_call", "id": "fc_1l1qc04z6lycg", "call_id": "call_4VnzVawQXPB9MgYib7CiQFEY",
				"name": "edit", "arguments": "{\"path\":\"src/styles/app.css\"}"},
			{"type": "function_call_output", "call_id": "call_4VnzVawQXPB9MgYib7CiQFEY", "output": "ok"}
		]
	});
	let headers = vec![
		("Authorization".to_string(), "Bearer sk-test".to_string()),
		("session_id".to_string(), "session-123".to_string()),
		("x-client-request-id".to_string(), "session-123".to_string()),
	];
	let (unified, info) = decode_request(&body.to_string(), &headers).unwrap();
	assert_eq!(unified.model, "gpt-5.5");
	assert_eq!(unified.context.messages.len(), 4);
	let full_id = "call_4VnzVawQXPB9MgYib7CiQFEY|fc_1l1qc04z6lycg";
	let Message::Assistant(a) = &unified.context.messages[2] else { panic!("assistant") };
	let ContentBlock::ToolCall(tc) = &a.content[0] else { panic!("toolCall") };
	assert_eq!(tc.id, full_id);
	assert_eq!(tc.name, "edit");
	assert_eq!(tc.arguments["path"], "src/styles/app.css");
	let Message::ToolResult(tr) = &unified.context.messages[3] else { panic!("toolResult") };
	assert_eq!(tr.tool_call_id, full_id);
	assert_eq!(tr.tool_name, "edit");
	assert!(!tr.is_error);
	assert_eq!(info.key_id, "sk-test");
	assert_eq!(info.session_signal.as_deref(), Some("session-123"));
}

#[test]
fn decode_assistant_text_and_reasoning_items() {
	// openai-responses-message-id.test.ts + azure-openai-responses-reasoning-replay.test.ts
	let body = json!({
		"model": "gpt-5.5",
		"input": [
			{"role": "developer", "content": "You are concise."},
			{"role": "user", "content": "hello"},
			{"type": "reasoning", "id": "rs_1", "summary": [{"type": "summary_text", "text": "private reasoning"}], "encrypted_content": "enc"},
			{"type": "message", "role": "assistant", "id": "msg_pi_1", "status": "completed",
				"content": [{"type": "output_text", "text": "visible answer", "annotations": []}]},
			{"type": "message", "role": "assistant", "id": "msg_phase", "status": "completed", "phase": "final_answer",
				"content": [{"type": "output_text", "text": "final", "annotations": []}]}
		]
	});
	let (unified, _) = decode_request(&body.to_string(), &auth_only()).unwrap();
	assert_eq!(unified.context.messages.len(), 3);
	let Message::Assistant(a) = &unified.context.messages[2] else { panic!("assistant") };
	assert_eq!(a.provider, "openai");
	assert_eq!(a.model, "gpt-5.5");
	assert_eq!(a.stop_reason, StopReason::Stop);
	let ContentBlock::Thinking(th) = &a.content[0] else { panic!("thinking") };
	assert_eq!(th.thinking, "private reasoning");
	let sig: Value = serde_json::from_str(th.thinking_signature.as_deref().unwrap()).unwrap();
	assert_eq!(sig["encrypted_content"], "enc");
	let ContentBlock::Text(t1) = &a.content[1] else { panic!("text") };
	assert_eq!(t1.text, "visible answer");
	assert_eq!(t1.text_signature.as_deref(), Some(r#"{"v":1,"id":"msg_pi_1"}"#));
	let ContentBlock::Text(t2) = &a.content[2] else { panic!("text") };
	assert_eq!(t2.text_signature.as_deref(), Some(r#"{"v":1,"id":"msg_phase","phase":"final_answer"}"#));
}

#[test]
fn decode_namespace_and_custom_tool_calls() {
	// openai-responses-namespace.test.ts
	let body = json!({
		"model": "gpt-5.4",
		"input": [
			{"type": "function_call", "id": "fc_test", "call_id": "call_test", "name": "lookup",
				"arguments": "{\"value\":\"hello\"}", "namespace": "dynamic_tools"},
			{"type": "custom_tool_call", "id": "ctc_test", "call_id": "call_ct", "name": "query", "input": "hello"},
			{"type": "function_call_output", "call_id": "call_test", "output": "done"},
			{"type": "custom_tool_call_output", "call_id": "call_ct", "output": "ok"}
		]
	});
	let (unified, _) = decode_request(&body.to_string(), &auth_only()).unwrap();
	let Message::Assistant(a) = &unified.context.messages[0] else { panic!("assistant") };
	let ContentBlock::ToolCall(fc) = &a.content[0] else { panic!("toolCall") };
	assert_eq!(fc.id, "call_test|fc_test");
	assert_eq!(fc.namespace.as_deref(), Some("dynamic_tools"));
	let Message::ToolResult(r1) = &unified.context.messages[1] else { panic!("toolResult") };
	assert_eq!((r1.tool_call_id.as_str(), r1.tool_name.as_str()), ("call_test|fc_test", "lookup"));
	let ContentBlock::ToolCall(cc) = &a.content[1] else { panic!("toolCall") };
	assert_eq!(cc.id, "call_ct|ctc_test");
	assert_eq!(cc.arguments["input"], "hello");
	let Message::ToolResult(r2) = &unified.context.messages[2] else { panic!("toolResult") };
	assert_eq!((r2.tool_call_id.as_str(), r2.tool_name.as_str()), ("call_ct|ctc_test", "query"));
}

#[test]
fn decode_tool_outputs_string_and_parts() {
	// openai-responses-empty-tool-result.test.ts + openai-responses-tool-result-images.test.ts
	let body = json!({
		"model": "gpt-4o-mini",
		"input": [
			{"type": "function_call", "call_id": "c1", "name": "bash", "arguments": "{}"},
			{"type": "function_call_output", "call_id": "c1", "output": "(no tool output)"},
			{"type": "function_call", "call_id": "c2", "name": "img", "arguments": "{}"},
			{"type": "function_call_output", "call_id": "c2", "output": [
				{"type": "input_text", "text": "circle"},
				{"type": "input_image", "detail": "auto", "image_url": "data:image/png;base64,AAA="}
			]}
		]
	});
	let (unified, _) = decode_request(&body.to_string(), &auth_only()).unwrap();
	let Message::ToolResult(r1) = &unified.context.messages[1] else { panic!("toolResult") };
	assert_eq!(r1.tool_call_id, "c1");
	assert_eq!(r1.content.len(), 1);
	let Message::ToolResult(r2) = &unified.context.messages[3] else { panic!("toolResult") };
	assert_eq!(r2.content.len(), 2);
	let UserBlock::Image(img) = &r2.content[1] else { panic!("image") };
	assert_eq!((img.mime_type.as_str(), img.data.as_str()), ("image/png", "AAA="));
}

#[test]
fn decode_options_tools_and_session_fallback() {
	// openai-responses-compat.test.ts
	let body = json!({
		"model": "gpt-5.4",
		"input": [{"role": "user", "content": "hi"}],
		"tools": [{"type": "function", "name": "ping", "description": "Ping", "parameters": {"type": "object"}, "strict": false}],
		"tool_choice": "required",
		"reasoning": {"effort": "xhigh", "summary": "auto"},
		"max_output_tokens": 1024,
		"temperature": 0.7,
		"prompt_cache_key": "session-proxy"
	});
	let (unified, info) = decode_request(&body.to_string(), &auth_only()).unwrap();
	assert_eq!(unified.options.max_tokens, Some(1024));
	assert_eq!(unified.options.temperature, Some(0.7));
	assert_eq!(unified.options.tool_choice.as_ref().and_then(serde_json::Value::as_str), Some("required"));
	assert_eq!(unified.options.reasoning.as_deref(), Some("xhigh"));
	assert_eq!(unified.options.session_id.as_deref(), Some("session-proxy"));
	assert_eq!(info.session_signal.as_deref(), Some("session-proxy"));
	let Message::System(s) = &unified.context.messages[0] else { panic!("system") };
	assert_eq!(s.content, SystemContent::Text(String::new()));
	let tools = s.tools_added.as_ref().unwrap();
	assert_eq!(tools.len(), 1);
	assert_eq!(tools[0].name, "ping");
	assert_eq!(tools[0].constrained_sampling, None);
	let headers = vec![
		("Authorization".to_string(), "Bearer k".to_string()),
		("x-session-id".to_string(), "session-openrouter".to_string()),
	];
	let (_, info) = decode_request(&body.to_string(), &headers).unwrap();
	assert_eq!(info.session_signal.as_deref(), Some("session-openrouter"));
}

#[test]
fn decode_rejects_invalid_input() {
	let unpaired = json!({"model": "m", "input": [{"type": "function_call_output", "call_id": "x", "output": ""}]});
	assert!(decode_request(&unpaired.to_string(), &auth_only()).is_err());
	let object_choice = json!({"model": "m", "input": [], "tool_choice": {"type": "function", "name": "f"}});
	assert_eq!(decode_request(&object_choice.to_string(), &auth_only()).unwrap().0.options.tool_choice, Some(object_choice["tool_choice"].clone()));
	let grammar_tool = json!({"model": "m", "input": [], "tools": [{"type": "custom", "name": "g", "format": {"type": "grammar"}}]});
	assert!(decode_request(&grammar_tool.to_string(), &auth_only()).is_err());
	assert!(decode_request(&json!({"model": "m", "input": []}).to_string(), &[]).is_err());
}

