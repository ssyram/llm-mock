use serde::Deserialize;
use serde_json::Value;

fn imul(a: u32, b: u32) -> u32 {
	(a as i32).wrapping_mul(b as i32) as u32
}

fn to_base36(mut v: u32) -> String {
	if v == 0 {
		return "0".to_string();
	}
	const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
	let mut out = Vec::new();
	while v > 0 {
		out.push(DIGITS[(v % 36) as usize]);
		v /= 36;
	}
	out.reverse();
	String::from_utf8(out).expect("base36 alphabet is ascii")
}

/// Port of pi-ai shortHash (utils/hash.ts) over UTF-16 code units.
pub fn short_hash(s: &str) -> String {
	let mut h1: u32 = 0xdeadbeef;
	let mut h2: u32 = 0x41c6ce57;
	for ch in s.encode_utf16() {
		h1 = imul(h1 ^ ch as u32, 2654435761);
		h2 = imul(h2 ^ ch as u32, 1597334677);
	}
	h1 = imul(h1 ^ (h1 >> 16), 2246822507) ^ imul(h2 ^ (h2 >> 13), 3266489909);
	h2 = imul(h2 ^ (h2 >> 16), 2246822507) ^ imul(h1 ^ (h1 >> 13), 3266489909);
	format!("{}{}", to_base36(h2), to_base36(h1))
}

/// Byte-canonical form of pi-ai encodeTextSignatureV1 (key order v, id, phase).
pub fn text_signature(id: &str, phase: Option<&str>) -> String {
	let id = serde_json::to_string(id).expect("string serializes");
	match phase {
		None => format!("{{\"v\":1,\"id\":{id}}}"),
		Some(p) => format!("{{\"v\":1,\"id\":{id},\"phase\":{}}}", serde_json::to_string(p).expect("string serializes")),
	}
}

pub fn split_data_uri(url: &str) -> Result<(String, String), String> {
	let rest = url.strip_prefix("data:").ok_or("input_image without data URI")?;
	let (meta, data) = rest.split_once(',').ok_or("input_image data URI without payload")?;
	let mime = meta.strip_suffix(";base64").ok_or("input_image not base64")?;
	Ok((mime.to_string(), data.to_string()))
}

pub fn output_part_text(part: &WireOutputPart) -> &str {
	match part {
		WireOutputPart::OutputText { text } => text,
		WireOutputPart::Refusal { refusal } => refusal,
	}
}

pub fn text_part_text(part: &WireTextPart) -> &str {
	match part {
		WireTextPart::SummaryText { text } => text,
		WireTextPart::ReasoningText { text } => text,
	}
}

#[derive(Deserialize)]
pub struct WireRequest {
	pub model: String,
	pub input: Vec<WireItem>,
	#[serde(default)]
	pub tools: Option<Vec<WireTool>>,
	#[serde(default)]
	pub tool_choice: Option<Value>,
	#[serde(default)]
	pub reasoning: Option<WireReasoning>,
	#[serde(default)]
	pub max_output_tokens: Option<u64>,
	#[serde(default)]
	pub temperature: Option<f64>,
	#[serde(default)]
	pub prompt_cache_key: Option<String>,
}

#[derive(Deserialize)]
pub struct WireReasoning {
	pub effort: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum WireItem {
	Typed(WireTypedItem),
	Role(WireRoleItem),
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireTypedItem {
	Message(WireMessageItem),
	Reasoning(WireReasoningItem),
	FunctionCall(WireCallItem),
	CustomToolCall(WireCustomCallItem),
	FunctionCallOutput(WireCallOutputItem),
	CustomToolCallOutput(WireCallOutputItem),
}

#[derive(Deserialize)]
pub struct WireRoleItem {
	pub role: String,
	pub content: RoleContent,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum RoleContent {
	Text(String),
	Parts(Vec<WireInputPart>),
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireInputPart {
	InputText { text: String },
	InputImage { image_url: String },
}

#[derive(Deserialize)]
pub struct WireMessageItem {
	pub role: String,
	#[serde(default)]
	pub id: Option<String>,
	pub content: Vec<WireOutputPart>,
	#[serde(default)]
	pub phase: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireOutputPart {
	OutputText { text: String },
	Refusal { refusal: String },
}

#[derive(Deserialize)]
pub struct WireReasoningItem {
	pub id: String,
	#[serde(default)]
	pub summary: Vec<WireTextPart>,
	#[serde(default)]
	pub content: Option<Vec<WireTextPart>>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireTextPart {
	SummaryText { text: String },
	ReasoningText { text: String },
}

#[derive(Deserialize)]
pub struct WireCallItem {
	#[serde(default)]
	pub id: Option<String>,
	pub call_id: String,
	pub name: String,
	pub arguments: String,
	#[serde(default)]
	pub namespace: Option<String>,
}

#[derive(Deserialize)]
pub struct WireCustomCallItem {
	#[serde(default)]
	pub id: Option<String>,
	pub call_id: String,
	pub name: String,
	pub input: String,
	#[serde(default)]
	pub namespace: Option<String>,
}

#[derive(Deserialize)]
pub struct WireCallOutputItem {
	pub call_id: String,
	pub output: WireOutputContent,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum WireOutputContent {
	Text(String),
	Parts(Vec<WireInputPart>),
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireTool {
	Function {
		name: String,
		description: String,
		parameters: Value,
	},
	Custom {
		name: String,
		#[serde(default)]
		description: String,
		format: crate::api::grammar_tool::WireGrammar,
	},
}
