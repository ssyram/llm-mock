use super::vendor::GenerateContentRequest;
use crate::model::DecodedOptions;
use serde_json::Value;

pub(super) fn decode_options(wire: &GenerateContentRequest) -> DecodedOptions {
    let config = wire.generation_config.clone().unwrap_or_default();
    DecodedOptions {
        cache_retention: None,
        max_tokens: config.max_output_tokens,
        temperature: config.temperature,
        session_id: None,
        tool_choice: wire
            .tool_config
            .as_ref()
            .and_then(|tc| tc.function_calling_config.as_ref())
            .and_then(|c| c.mode.clone())
            .map(|mode| Value::String(mode.to_lowercase())),
        reasoning: config.thinking_config.and_then(|tc| {
            if let Some(level) = tc.thinking_level {
                Some(level.to_lowercase())
            } else if tc.thinking_budget == Some(0) {
                Some("off".into())
            } else {
                tc.thinking_budget.map(|budget| format!("budget:{budget}"))
            }
        }),
    }
}
