use serde::Deserialize;

#[derive(Deserialize)]
pub struct WireRequest {
    pub model: String,
    #[serde(default)]
    pub messages: Vec<WireMessage>,
    #[serde(default)]
    pub tools: Option<Vec<WireTool>>,
    #[serde(default)]
    pub max_tokens: Option<u64>,
    #[serde(default)]
    pub max_completion_tokens: Option<u64>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub tool_choice: Option<serde_json::Value>,
    #[serde(default)]
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub reasoning: Option<serde_json::Value>,
    #[serde(default)]
    pub thinking: Option<serde_json::Value>,
    #[serde(default)]
    pub prompt_cache_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "role", rename_all = "snake_case")]
pub enum WireMessage {
    #[serde(alias = "developer")]
    System(WireSystem),
    User(WireUser),
    Assistant(WireAssistant),
    Tool(WireToolResult),
}

#[derive(Deserialize)]
pub struct WireSystem {
    #[serde(default)]
    pub content: WireTextContent,
    #[serde(default)]
    pub tools: Option<Vec<WireTool>>,
}

#[derive(Deserialize, Default)]
#[serde(untagged)]
pub enum WireTextContent {
    #[default]
    Empty,
    Plain(String),
    Parts(Vec<WireTextPart>),
}

#[derive(Deserialize)]
pub struct WireTextPart {
    #[serde(default)]
    pub text: String,
}

#[derive(Deserialize)]
pub struct WireUser {
    #[serde(default)]
    pub content: WireUserContent,
}

#[derive(Deserialize, Default)]
#[serde(untagged)]
pub enum WireUserContent {
    #[default]
    Empty,
    Plain(String),
    Parts(Vec<WireUserPart>),
}

#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum WireUserPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: WireImageUrl },
}

#[derive(Deserialize)]
pub struct WireImageUrl {
    pub url: String,
}

#[derive(Deserialize)]
pub struct WireAssistant {
    #[serde(default)]
    pub content: WireTextContent,
    #[serde(default)]
    pub tool_calls: Option<Vec<WireToolCall>>,
    #[serde(default)]
    pub reasoning: Option<String>,
    #[serde(default)]
    pub reasoning_content: Option<String>,
    #[serde(default)]
    pub reasoning_text: Option<String>,
    #[serde(default)]
    pub reasoning_details: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct WireToolCall {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub function: Option<WireFunctionCall>,
    #[serde(default)]
    pub custom: Option<WireCustomCall>,
}

#[derive(Deserialize)]
pub struct WireFunctionCall {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub arguments: Option<String>,
}

#[derive(Deserialize)]
pub struct WireCustomCall {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub input: String,
}

#[derive(Deserialize)]
pub struct WireToolResult {
    #[serde(default)]
    pub content: WireTextContent,
    #[serde(default)]
    pub tool_call_id: String,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Deserialize)]
pub struct WireTool {
    #[serde(default)]
    pub function: Option<WireFunctionTool>,
    #[serde(default)]
    pub custom: Option<WireCustomTool>,
}

#[derive(Deserialize)]
pub struct WireFunctionTool {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub parameters: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct WireCustomTool {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub format: Option<WireGrammarFormat>,
}

#[derive(Deserialize)]
pub struct WireGrammarFormat {
    #[serde(default)]
    pub grammar: Option<WireGrammar>,
}

#[derive(Deserialize)]
pub struct WireGrammar {
    #[serde(default)]
    pub syntax: Option<String>,
    #[serde(default)]
    pub definition: Option<String>,
}
