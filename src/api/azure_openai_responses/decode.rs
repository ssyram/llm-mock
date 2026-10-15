use crate::model::{Message, RequestInfo, UnifiedRequest};

use crate::api::openai_responses::decode::decode_request as decode_responses_request;

pub const API: &str = "azure-openai-responses";
pub const PROVIDER: &str = "azure";

/// azure-openai-config.ts:5 DEFAULT_AZURE_API_VERSION.
const DEFAULT_API_VERSION: &str = "v1";

/// Azure ships the credential in the `api-key` header (openai SDK
/// node_modules/openai/azure.js:113-120 authHeaders); the family-root decoder
/// only reads `Authorization: Bearer`, so the header is adapted before reuse.
pub fn decode_request(body: &str, headers: &[(String, String)]) -> Result<(UnifiedRequest, RequestInfo), String> {
	let key = api_key(headers)?;
	let mut adapted = headers.to_vec();
	adapted.push(("Authorization".to_string(), format!("Bearer {key}")));
	let (mut unified, mut info) = decode_responses_request(body, &adapted)?;
	info.api = API.to_string();
	retag(&mut unified);
	Ok((unified, info))
}

fn api_key(headers: &[(String, String)]) -> Result<String, String> {
	headers
		.iter()
		.find(|(name, _)| name.eq_ignore_ascii_case("api-key"))
		.map(|(_, value)| value.clone())
		.ok_or_else(|| "missing api-key header".to_string())
}

/// The v1 Responses route on Azure hosts: pi-ai normalizes every Azure base
/// URL to `.../openai/v1` (azure-openai-config.ts:55-61) and the SDK appends
/// `/responses` without a `/deployments/{name}` segment — `/responses` is not
/// in the SDK's deployment-endpoint set (azure.js:140-151). A custom base URL
/// without a path yields the bare `/responses` form.
pub fn route_matches(path: &str) -> bool {
	let path = path.split('?').next().unwrap_or(path).trim_end_matches('/');
	path == "/openai/v1/responses" || path == "/responses"
}

/// The SDK always sends `?api-version=` (azure.js:45 defaultQuery); pi-ai
/// defaults the value to v1 (azure-openai-config.ts:91-95).
pub fn api_version(query: &str) -> String {
	query
		.split('&')
		.find_map(|pair| {
			let (key, value) = pair.split_once('=')?;
			(key == "api-version").then(|| value.to_string())
		})
		.unwrap_or_else(|| DEFAULT_API_VERSION.to_string())
}

fn retag(unified: &mut UnifiedRequest) {
	for message in &mut unified.context.messages {
		if let Message::Assistant(a) = message {
			a.api = API.to_string();
			a.provider = PROVIDER.to_string();
		}
	}
}
