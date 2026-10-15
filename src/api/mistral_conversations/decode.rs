use super::{
    decode_messages::decode_messages,
    vendor::{model_from_body, API},
};
use crate::model::*;
use serde_json::Value;

pub fn decode_request(
    body: &Value,
    headers: &[(String, String)],
) -> Result<(UnifiedRequest, RequestInfo), String> {
    let model = model_from_body(body)?;
    let messages = decode_messages(body, &model)?;
    let options = DecodedOptions {
        max_tokens: body.get("max_tokens").and_then(Value::as_u64),
        temperature: body.get("temperature").and_then(Value::as_f64),
        session_id: body
            .get("prompt_cache_key")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or_else(|| header(headers, "x-affinity")),
        tool_choice: body.get("tool_choice").filter(|v| !v.is_null()).cloned(),
        reasoning: body
            .get("reasoning_effort")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or_else(|| {
                body.get("prompt_mode")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            }),
    };
    let key_id = header(headers, "authorization")
        .and_then(|v| crate::bearer::bearer_token(&v).map(str::to_owned))
        .unwrap_or_default();
    let info = RequestInfo {
        api: API.into(),
        key_id,
        model: model.clone(),
        options: options.clone(),
        session_signal: options.session_id.clone(),
    };
    Ok((
        UnifiedRequest {
            model,
            context: TranscriptContext { messages },
            options,
        },
        info,
    ))
}

fn header(headers: &[(String, String)], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.clone())
}
