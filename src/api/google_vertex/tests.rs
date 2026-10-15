use serde_json::json;

use crate::model::{Message, UserContent};

use super::decode::{decode_request, decode_request_info, parse_route, API};

const REGIONAL_PATH: &str =
	"/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-pro:streamGenerateContent?alt=sse";
const EXPRESS_PATH: &str = "/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse";

// Route shapes follow @google/genai tModel/path building
// (dist node/index.mjs:3270-3277, 3295, 15775) with pi-ai's explicit
// apiVersion "v1" (google-vertex.ts:62,369,383); body shape is the family-root
// GenerateContentRequest (google-vertex.ts buildParams reuses google-shared).

#[test]
fn parses_regional_route() {
	let route = parse_route(REGIONAL_PATH).unwrap();
	assert_eq!(route.project.as_deref(), Some("my-proj"));
	assert_eq!(route.location.as_deref(), Some("us-central1"));
	assert_eq!(route.model, "gemini-2.5-pro");
}

#[test]
fn parses_express_route_without_project_or_location() {
	let route = parse_route(EXPRESS_PATH).unwrap();
	assert_eq!(route.project, None);
	assert_eq!(route.location, None);
	assert_eq!(route.model, "gemini-2.5-flash");
}

#[test]
fn parses_non_google_publisher_model_and_rejects_empty() {
	let route = parse_route("/v1/projects/p/locations/europe-west4/publishers/meta/models/llama-4:streamGenerateContent").unwrap();
	assert_eq!(route.model, "llama-4");
	assert!(parse_route("/v1/projects/p/locations/l/publishers/google/models/:streamGenerateContent").is_err());
}

#[test]
fn decodes_vertex_request_and_retags_assistant_history() {
	let body = json!({
		"contents": [
			{"role": "model", "parts": [{"text": "ok"}]},
			{"role": "user", "parts": [{"text": "hello"}]}
		],
		"systemInstruction": {"role": "user", "parts": [{"text": "You are helpful"}]},
		"generationConfig": {"temperature": 0.5, "maxOutputTokens": 320}
	});
	let unified = decode_request(REGIONAL_PATH, &body).unwrap();
	assert_eq!(unified.model, "gemini-2.5-pro");
	// systemInstruction becomes the leading message (family-root ordering).
	let Message::Assistant(a) = &unified.context.messages[1] else { panic!("assistant") };
	assert_eq!(a.api, API);
	let Message::User(u) = &unified.context.messages[2] else { panic!("user") };
	assert_eq!(u.content, UserContent::Text("hello".to_string()));
}

#[test]
fn vertex_request_info_carries_key_and_api() {
	let body = json!({"contents": [{"role": "user", "parts": [{"text": "hello"}]}]});
	let bearer = decode_request_info(REGIONAL_PATH, Some("ya29.oauth-token"), &body).unwrap();
	assert_eq!(bearer.api, API);
	assert_eq!(bearer.key_id, "ya29.oauth-token");
	assert_eq!(bearer.model, "gemini-2.5-pro");
	let express = decode_request_info(EXPRESS_PATH, Some("AIza-express-key"), &body).unwrap();
	assert_eq!(express.api, API);
	assert_eq!(express.key_id, "AIza-express-key");
}
