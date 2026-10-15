use serde_json::json;

use crate::model::Message;

use super::decode::{api_version, decode_request, route_matches, API};

// wire fixtures derive from pi-mono/packages/ai/test/azure-openai-*.test.ts
// (same WireRequest shape as the openai-responses family root; only the
// credential moves to the `api-key` header).

#[test]
fn decode_azure_request_with_api_key_header() {
	let body = json!({
		"model": "gpt-5.5",
		"input": [
			{"type": "message", "role": "assistant", "id": "msg_1", "status": "completed",
				"content": [{"type": "output_text", "text": "hi", "annotations": []}]},
			{"role": "user", "content": "hello"}
		],
		"prompt_cache_key": "sess-123"
	});
	let headers = vec![("api-key".to_string(), "azure-key-1".to_string())];
	let (unified, info) = decode_request(&body.to_string(), &headers).unwrap();
	assert_eq!(info.api, API);
	assert_eq!(info.key_id, "azure-key-1");
	assert_eq!(info.model, "gpt-5.5");
	assert_eq!(info.session_signal.as_deref(), Some("sess-123"));
	let Message::Assistant(a) = &unified.context.messages[0] else { panic!("assistant") };
	assert_eq!(a.api, "azure-openai-responses");
	assert_eq!(a.provider, "azure");
}

#[test]
fn decode_azure_request_rejects_missing_api_key() {
	let body = json!({"model": "gpt-5.5", "input": [{"role": "user", "content": "hello"}]});
	let headers = vec![("Authorization".to_string(), "Bearer sk-x".to_string())];
	let err = decode_request(&body.to_string(), &headers).unwrap_err();
	assert_eq!(err, "missing api-key header");
}

#[test]
fn azure_route_forms() {
	assert!(route_matches("/openai/v1/responses?api-version=v1"));
	assert!(route_matches("/responses"));
	assert!(!route_matches("/openai/v1/chat/completions"));
	assert!(!route_matches("/openai/deployments/gpt-5.5/responses"));
}

#[test]
fn azure_api_version_default_is_v1() {
	assert_eq!(api_version(""), "v1");
	assert_eq!(api_version("api-version=2025-04-01-preview"), "2025-04-01-preview");
	assert_eq!(api_version("alt=sse&api-version=v1"), "v1");
}
