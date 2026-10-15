use super::{
    decode_messages::decode_messages,
    vendor::{model_from_path, API},
};
use crate::model::*;
use serde_json::Value;

pub fn decode_request(path: &str, body: &Value) -> Result<UnifiedRequest, String> {
    let model = model_from_path(path)?;
    let messages = decode_messages(body, &model)?;
    let inference = body.get("inferenceConfig");
    let tool_choice = body
        .get("toolConfig")
        .and_then(|v| v.get("toolChoice"))
        .and_then(|v| {
            if v.get("auto").is_some() {
                Some(Value::String("auto".to_owned()))
            } else if v.get("any").is_some() {
                Some(Value::String("any".to_owned()))
            } else {
                v.get("tool")
                    .and_then(|t| t.get("name"))
                    .and_then(Value::as_str)
                    .map(|name| serde_json::json!({"type": "tool", "name": name}))
            }
        });
    Ok(UnifiedRequest {
        model,
        context: TranscriptContext { messages },
        options: DecodedOptions {
            max_tokens: inference
                .and_then(|v| v.get("maxTokens"))
                .and_then(Value::as_u64),
            temperature: inference
                .and_then(|v| v.get("temperature"))
                .and_then(Value::as_f64),
            session_id: None,
            tool_choice,
            reasoning: body
                .get("additionalModelRequestFields")
                .filter(|v| v.as_object().is_some_and(|fields| !fields.is_empty()))
                .map(Value::to_string),
        },
    })
}

pub fn decode_request_info(
    path: &str,
    headers: &[(String, String)],
    body: &Value,
) -> Result<RequestInfo, String> {
    let request = decode_request(path, body)?;
    let key_id = headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("authorization"))
        .and_then(|(_, value)| {
            value
                .split("Credential=")
                .nth(1)
                .and_then(|tail| tail.split('/').next())
                .or_else(|| crate::bearer::bearer_token(value))
        })
        .unwrap_or_default()
        .to_owned();
    Ok(RequestInfo {
        api: API.into(),
        key_id,
        model: request.model,
        options: request.options,
        session_signal: None,
    })
}
