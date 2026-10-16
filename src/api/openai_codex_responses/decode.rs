use serde_json::Value;

use crate::model::{Message, RequestInfo, SystemContent, SystemMessage, UnifiedRequest};

use crate::api::openai_responses::decode::decode_request as decode_responses_request;

pub const API: &str = "openai-codex-responses";
pub const PROVIDER: &str = "openai-codex";

/// openai-codex-responses.ts:53 JWT_CLAIM_PATH.
const JWT_CLAIM_PATH: &str = "https://api.openai.com/auth";

/// Thin wrapper over the family-root decoder. Codex differences handled here:
/// Bearer auth is unchanged (root path), but the system prompt travels in the
/// top-level `instructions` field (includeSystemPrompt: false,
/// openai-codex-responses.ts:544) instead of an input item.
pub fn decode_request(body: &str, headers: &[(String, String)]) -> Result<(UnifiedRequest, RequestInfo), String> {
	let parsed = super::parse_request::parse_request(body)?;
	let (mut unified, mut info) = decode_responses_request(&parsed.to_string(), headers)?;
	if let Some(instructions) = parsed.get("instructions").and_then(Value::as_str).filter(|text| !text.is_empty()) {
		apply_instructions(&mut unified, instructions);
	}
	info.api = API.to_string();
	retag(&mut unified);
	Ok((unified, info))
}

fn apply_instructions(unified: &mut UnifiedRequest, instructions: &str) {
	match unified.context.messages.first_mut() {
		// A tools-only request makes the root decoder insert an empty System
		// (tools attach there); the instructions text belongs in that message.
		Some(Message::System(s)) => {
			if matches!(&s.content, SystemContent::Text(t) if t.is_empty()) {
				s.content = SystemContent::Text(instructions.to_string());
			}
		}
		_ => unified.context.messages.insert(
			0,
			Message::System(SystemMessage {
				content: SystemContent::Text(instructions.to_string()),
				sections: None,
				tools_added: None,
				tools_removed: None,
				timestamp: 0,
			}),
		),
	}
}

fn retag(unified: &mut UnifiedRequest) {
	for message in &mut unified.context.messages {
		if let Message::Assistant(a) = message {
			a.api = API.to_string();
			a.provider = PROVIDER.to_string();
		}
	}
}

/// Port of openai-codex-responses.ts:1628-1639 extractAccountId: the token is
/// a three-segment JWT whose payload carries the ChatGPT account id under the
/// `https://api.openai.com/auth` claim. Base64url segments are accepted
/// alongside standard base64 (atob tolerates neither; pi-ai's own test tokens
/// are standard base64, real Codex tokens are base64url).
pub fn extract_account_id(token: &str) -> Result<String, String> {
	extract_account_id_inner(token).map_err(|_| "Failed to extract accountId from token".to_string())
}

fn extract_account_id_inner(token: &str) -> Result<String, String> {
	let parts: Vec<&str> = token.split('.').collect();
	if parts.len() != 3 {
		return Err("invalid token".to_string());
	}
	let payload: Value = serde_json::from_slice(&decode_base64(parts[1])?).map_err(|e| e.to_string())?;
	payload
		.get(JWT_CLAIM_PATH)
		.and_then(|auth| auth.get("chatgpt_account_id"))
		.and_then(Value::as_str)
		.filter(|id| !id.is_empty())
		.map(str::to_string)
		.ok_or_else(|| "no account ID in token".to_string())
}

fn decode_base64(segment: &str) -> Result<Vec<u8>, String> {
	fn value_of(byte: u8) -> Option<u8> {
		match byte {
			b'A'..=b'Z' => Some(byte - b'A'),
			b'a'..=b'z' => Some(byte - b'a' + 26),
			b'0'..=b'9' => Some(byte - b'0' + 52),
			b'+' | b'-' => Some(62),
			b'/' | b'_' => Some(63),
			_ => None,
		}
	}
	let mut out = Vec::new();
	let mut buffer: u32 = 0;
	let mut bits = 0;
	for byte in segment.bytes() {
		if byte == b'=' {
			continue;
		}
		buffer = (buffer << 6) | value_of(byte).ok_or("invalid base64 character")? as u32;
		bits += 6;
		if bits >= 8 {
			bits -= 8;
			out.push((buffer >> bits) as u8);
		}
	}
	Ok(out)
}

/// resolveCodexUrl (openai-codex-responses.ts:642-649) always ends the wire
/// path with `/codex/responses` (default base `https://chatgpt.com/backend-api`).
pub fn route_matches(path: &str) -> bool {
	let path = path.split('?').next().unwrap_or(path).trim_end_matches('/');
	path.ends_with("/codex/responses")
}
