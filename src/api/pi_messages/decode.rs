use serde_json::Value;

use super::vendor::WireRequest;
use crate::model::{DecodedOptions, RequestInfo, UnifiedRequest};

pub struct WireHeaders<'a> {
    pub authorization: Option<&'a str>,
}

#[derive(Debug)]
pub struct Decoded {
    pub request: UnifiedRequest,
    pub info: RequestInfo,
}

pub fn decode(body: &Value) -> Result<UnifiedRequest, String> {
    let wire: WireRequest = serde_json::from_value(body.clone())
        .map_err(|error| format!("invalid pi-messages request: {error}"))?;
    Ok(UnifiedRequest {
        model: wire.model,
        context: wire.context,
        options: DecodedOptions {
            max_tokens: wire.options.max_tokens,
            temperature: wire.options.temperature,
            session_id: wire.options.session_id,
            tool_choice: wire.options.tool_choice,
            reasoning: wire.options.reasoning,
        },
    })
}

pub fn decode_request(body: &Value, headers: &WireHeaders<'_>) -> Result<Decoded, String> {
    let key_id = headers
        .authorization
        .and_then(crate::bearer::bearer_token)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing Authorization Bearer key".to_owned())?;
    let request = decode(body)?;
    let info = RequestInfo {
        api: "pi-messages".to_owned(),
        key_id: key_id.to_owned(),
        model: request.model.clone(),
        options: request.options.clone(),
        session_signal: request.options.session_id.clone(),
    };
    Ok(Decoded { request, info })
}
