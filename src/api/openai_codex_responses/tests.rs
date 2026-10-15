use serde_json::json;

use crate::model::{Message, SystemContent};

use super::decode::{decode_request, extract_account_id, route_matches, API};

// JWT fixture shape mirrors pi-mono/packages/ai/test/openai-codex-oauth.test.ts:25-35
// createAccessToken (standard base64) and real Codex tokens (base64url).
const HEADER_STD: &str = "eyJhbGciOiJub25lIn0=";
const PAYLOAD_STD: &str = "eyJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsiY2hhdGdwdF9hY2NvdW50X2lkIjoiYWNjdC0xMjMifX0=";
const PAYLOAD_URL: &str = "eyJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsiY2hhdGdwdF9hY2NvdW50X2lkIjoiYWNjdC00NTYifX0";
const PAYLOAD_NO_CLAIM: &str = "eyJzdWIiOiJ1c2VyIn0=";
const PAYLOAD_BAD_JSON: &str = "bm90IGpzb24=";

#[test]
fn account_id_from_standard_base64_jwt() {
	let token = format!("{HEADER_STD}.{PAYLOAD_STD}.signature");
	assert_eq!(extract_account_id(&token).unwrap(), "acct-123");
}

#[test]
fn account_id_from_base64url_jwt_without_padding() {
	let token = format!("{HEADER_STD}.{PAYLOAD_URL}.sig");
	assert_eq!(extract_account_id(&token).unwrap(), "acct-456");
}

#[test]
fn account_id_rejects_malformed_tokens() {
	let bad: [String; 4] = [
		"two-parts".to_string(),
		format!("{HEADER_STD}.{PAYLOAD_NO_CLAIM}.sig"),
		format!("{HEADER_STD}.{PAYLOAD_BAD_JSON}.sig"),
		format!("{HEADER_STD}.!!!.sig"),
	];
	for token in bad {
		assert_eq!(extract_account_id(&token).unwrap_err(), "Failed to extract accountId from token");
	}
}

#[test]
fn decode_codex_request_injects_instructions_as_system() {
	// buildRequestBody (openai-codex-responses.ts:548-565): system prompt moves
	// to `instructions`, store:false/stream:true/parallel_tool_calls:true are
	// constants, tool_choice defaults to "auto".
	let body = json!({
		"model": "gpt-5.5-codex",
		"store": false,
		"stream": true,
		"instructions": "You are a helpful assistant.",
		"input": [
			{"role": "user", "content": "hello"},
			{"type": "message", "role": "assistant", "id": "msg_1", "status": "completed",
				"content": [{"type": "output_text", "text": "hi", "annotations": []}]}
		],
		"text": {"verbosity": "low"},
		"include": ["reasoning.encrypted_content"],
		"prompt_cache_key": "sess-7",
		"tool_choice": "auto",
		"parallel_tool_calls": true
	});
	let headers = vec![
		("Authorization".to_string(), format!("Bearer {HEADER_STD}.{PAYLOAD_STD}.signature")),
		("session-id".to_string(), "sess-7".to_string()),
		("x-client-request-id".to_string(), "sess-7".to_string()),
	];
	let (unified, info) = decode_request(&body.to_string(), &headers).unwrap();
	assert_eq!(info.api, API);
	assert_eq!(info.key_id, format!("{HEADER_STD}.{PAYLOAD_STD}.signature"));
	assert_eq!(info.session_signal.as_deref(), Some("sess-7"));
	let Message::System(s) = &unified.context.messages[0] else { panic!("system") };
	assert_eq!(s.content, SystemContent::Text("You are a helpful assistant.".to_string()));
	let Message::User(u) = &unified.context.messages[1] else { panic!("user") };
	assert_eq!(u.content, crate::model::UserContent::Text("hello".to_string()));
	let Message::Assistant(a) = &unified.context.messages[2] else { panic!("assistant") };
	assert_eq!(a.api, "openai-codex-responses");
	assert_eq!(a.provider, "openai-codex");
	assert_eq!(a.model, "gpt-5.5-codex");
}

#[test]
fn decode_codex_tools_only_request_fills_instructions_into_tools_system() {
	// Root decoder gives tools an empty leading System; instructions text lands there.
	// Wire always carries tool_choice explicitly (codex default "auto",
	// CR:563 applies it at build time, not on the wire).
	let body = json!({
		"model": "gpt-5.5-codex",
		"instructions": "Be terse.",
		"input": [{"role": "user", "content": "run it"}],
		"tool_choice": "auto",
		"tools": [{"type": "function", "name": "run", "description": "", "parameters": {"type": "object"}}]
	});
	let headers = vec![("Authorization".to_string(), "Bearer codex-tok".to_string())];
	let (unified, info) = decode_request(&body.to_string(), &headers).unwrap();
	let Message::System(s) = &unified.context.messages[0] else { panic!("system") };
	assert_eq!(s.content, SystemContent::Text("Be terse.".to_string()));
	assert_eq!(s.tools_added.as_ref().map(|t| t.len()), Some(1));
	assert_eq!(info.options.tool_choice.as_ref().and_then(serde_json::Value::as_str), Some("auto"));
}

#[test]
fn codex_route_always_ends_with_codex_responses() {
	assert!(route_matches("/codex/responses"));
	assert!(route_matches("https://chatgpt.com/backend-api/codex/responses"));
	assert!(!route_matches("/responses"));
	assert!(!route_matches("/codex"));
}
