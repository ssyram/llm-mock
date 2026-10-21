use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::model::{StopReason, ToolCall, TranscriptContext, Usage};

#[derive(Deserialize)]
pub struct WireRequest {
    pub model: String,
    pub context: TranscriptContext,
    #[serde(default)]
    pub options: WireOptions,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireOptions {
    pub max_tokens: Option<u64>,
    pub temperature: Option<f64>,
    pub session_id: Option<String>,
    pub tool_choice: Option<Value>,
    pub reasoning: Option<String>,
    pub cache_retention: Option<String>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
pub enum WireToolCall<'a> {
    #[serde(rename = "toolCall")]
    ToolCall(&'a ToolCall),
}

#[derive(Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum PiMessagesEvent<'a> {
    Start,
    TextStart {
        content_index: usize,
    },
    TextDelta {
        content_index: usize,
        delta: &'a str,
    },
    TextEnd {
        content_index: usize,
        content: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        content_signature: Option<&'a str>,
    },
    ThinkingStart {
        content_index: usize,
    },
    ThinkingDelta {
        content_index: usize,
        delta: &'a str,
    },
    ThinkingEnd {
        content_index: usize,
        content: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        content_signature: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        redacted: Option<bool>,
    },
    ToolcallStart {
        content_index: usize,
        id: &'a str,
        tool_name: &'a str,
    },
    ToolcallDelta {
        content_index: usize,
        delta: &'a str,
    },
    ToolcallEnd {
        content_index: usize,
        tool_call: WireToolCall<'a>,
    },
    Done {
        reason: StopReason,
        usage: &'a Usage,
        #[serde(skip_serializing_if = "Option::is_none")]
        response_id: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        provider_thinking_level: Option<&'a str>,
    },
    Error {
        reason: StopReason,
        usage: &'a Usage,
        #[serde(skip_serializing_if = "Option::is_none")]
        error_message: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        response_id: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        provider_thinking_level: Option<&'a str>,
    },
}
