use serde_json::Value;

use crate::model::{Message, RequestInfo, UnifiedRequest};

use crate::api::google_generative_ai::decode::{
	decode_request as decode_gai_request, decode_request_info as decode_gai_request_info,
};

pub const API: &str = "google-vertex";

/// Path identity a Vertex route carries beyond the family root:
/// `projects/{project}/locations/{location}` segments are absent on the
/// Express/global endpoint (SDK builds `publishers/google/models/{model}`
/// there too — @google/genai dist node/index.mjs:3270-3277, 13539-13547).
pub struct VertexRoute {
	pub project: Option<String>,
	pub location: Option<String>,
	pub model: String,
}

pub fn parse_route(path: &str) -> Result<VertexRoute, String> {
	let path_only = path.split('?').next().unwrap_or(path);
	let segments: Vec<&str> = path_only.trim_matches('/').split('/').collect();
	let project = segment_after(&segments, "projects");
	let location = segment_after(&segments, "locations");
	let last = segments.last().copied().unwrap_or_default();
	let model = last.split(':').next().unwrap_or_default();
	if model.is_empty() {
		return Err(format!("no model in path: {path}"));
	}
	Ok(VertexRoute { project, location, model: model.to_string() })
}

fn segment_after(segments: &[&str], marker: &str) -> Option<String> {
	segments
		.iter()
		.position(|s| *s == marker)
		.and_then(|i| segments.get(i + 1))
		.map(|s| (*s).to_string())
}

/// Wire bodies are the family-root `GenerateContentRequest` verbatim; only the
/// api identity changes (google-vertex.ts buildParams reuses google-shared
/// convertMessages/convertTools exactly like google-generative-ai.ts).
pub fn decode_request(path: &str, body: &Value) -> Result<UnifiedRequest, String> {
	let mut unified = decode_gai_request(path, body)?;
	retag(&mut unified);
	Ok(unified)
}

/// `api_key` is whichever credential header the caller extracted: Vertex takes
/// an OAuth2 `Authorization: Bearer` token by default (ADC) or an Express-mode
/// `x-goog-api-key` (google-vertex.ts:429-435 resolveApiKey).
pub fn decode_request_info(path: &str, api_key: Option<&str>, body: &Value) -> Result<RequestInfo, String> {
	let mut info = decode_gai_request_info(path, api_key, body)?;
	info.api = API.to_string();
	Ok(info)
}

fn retag(unified: &mut UnifiedRequest) {
	for message in &mut unified.context.messages {
		if let Message::Assistant(a) = message {
			a.api = API.to_string();
		}
	}
}
