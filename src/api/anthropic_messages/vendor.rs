//! Anthropic Messages wire-side serde structs (request direction).
//! Field set and shapes per pi-ai buildParams output, packages/ai/src/api/anthropic-messages.ts:1157-1323.

use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize, Debug)]
pub struct WireRequest {
	pub model: String,
	pub messages: Vec<WireMessage>,
	pub max_tokens: u64,
	#[serde(default)]
	pub system: Option<WireContent>,
	#[serde(default)]
	pub temperature: Option<f64>,
	#[serde(default)]
	pub tools: Option<Vec<WireTool>>,
	#[serde(default)]
	pub tool_choice: Option<Value>,
	#[serde(default)]
	pub thinking: Option<Value>,
	#[serde(default)]
	pub output_config: Option<Value>,
	#[serde(default)]
	pub metadata: Option<Value>,
}

#[derive(Deserialize, Debug)]
pub struct WireMessage {
	pub role: String,
	#[serde(default)]
	pub content: Option<WireContent>,
	#[serde(default)]
	pub output_config: Option<Value>,
}

#[derive(Deserialize, Debug)]
#[serde(untagged)]
pub enum WireContent {
	Text(String),
	Blocks(Vec<WireBlock>),
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireBlock {
	Text {
		text: String,
	},
	Image {
		source: WireImageSource,
	},
	Thinking {
		#[serde(default)]
		thinking: String,
		#[serde(default)]
		signature: String,
	},
	RedactedThinking {
		#[serde(default)]
		data: String,
	},
	ToolUse {
		id: String,
		name: String,
		#[serde(default)]
		input: Value,
	},
	ToolResult {
		tool_use_id: String,
		#[serde(default)]
		content: Option<WireContent>,
		#[serde(default)]
		is_error: bool,
	},
	ToolAddition {
		tool: WireToolAddition,
	},
	ToolRemoval {
		tool: WireToolRemoval,
	},
}

#[derive(Deserialize, Debug)]
pub struct WireImageSource {
	pub media_type: String,
	pub data: String,
}

#[derive(Deserialize, Debug)]
pub struct WireToolAddition {
	#[serde(default)]
	pub definition: Option<WireTool>,
}

#[derive(Deserialize, Debug)]
pub struct WireToolRemoval {
	pub name: String,
}

#[derive(Deserialize, Debug)]
pub struct WireTool {
	pub name: String,
	pub description: String,
	#[serde(default)]
	pub input_schema: Option<Value>,
}
