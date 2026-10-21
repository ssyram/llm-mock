use serde::{Deserialize, Serialize};

use super::message::TranscriptContext;

/// Decoder output: what a vendor wire request decodes into.
/// Vendor history timestamps default to 0; pi-messages preserves them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedRequest {
    pub model: String,
    pub context: TranscriptContext,
    pub options: DecodedOptions,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_retention: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestInfo {
    pub api: String,
    pub key_id: String,
    pub model: String,
    pub options: DecodedOptions,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_signal: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockError {
    /// HTTP status the encoder maps into a protocol-visible error.
    pub status: u16,
    pub code: String,
    pub message: String,
}
