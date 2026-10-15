use super::protocol::Api;
use super::table::{MountError, MountSpec};
use super::transport::header;
use axum::http::HeaderMap;
use serde_json::Value;

pub fn select_api(api: Api, headers: &HeaderMap, body: &str, spec: Option<&MountSpec>) -> Api {
    if api != Api::Completions {
        return api;
    }
    if let Some(spec) = spec {
        if let Some(prefer) = &spec.prefer {
            return if prefer == "mistral-conversations" {
                Api::Mistral
            } else {
                Api::Completions
            };
        }
        let mistral = spec.protocols.iter().any(|p| p == "mistral-conversations");
        let openai = spec.protocols.iter().any(|p| p == "openai-completions");
        if mistral != openai {
            return if mistral {
                Api::Mistral
            } else {
                Api::Completions
            };
        }
    }
    if header(headers, "x-affinity").is_some() {
        return Api::Mistral;
    }
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        let thinking = value
            .get("messages")
            .and_then(Value::as_array)
            .is_some_and(|messages| {
                messages.iter().any(|m| {
                    m.get("content")
                        .and_then(Value::as_array)
                        .is_some_and(|blocks| {
                            blocks
                                .iter()
                                .any(|b| b.get("type").and_then(Value::as_str) == Some("thinking"))
                        })
                })
            });
        if value.get("prompt_mode").is_some() || thinking {
            return Api::Mistral;
        }
    }
    api
}

pub fn validate_spec(spec: &MountSpec) -> Result<(), MountError> {
    let known = [
        Api::Completions,
        Api::Responses,
        Api::Anthropic,
        Api::Google,
        Api::Vertex,
        Api::Mistral,
        Api::Azure,
        Api::Codex,
        Api::Pi,
    ];
    if spec
        .protocols
        .iter()
        .any(|p| !known.iter().any(|a| a.name() == p))
    {
        return Err((
            400,
            "invalid_protocols",
            "protocols contains an unsupported API".into(),
        ));
    }
    if let Some(prefer) = &spec.prefer {
        if !["openai-completions", "mistral-conversations"].contains(&prefer.as_str())
            || (!spec.protocols.is_empty() && !spec.protocols.contains(prefer))
        {
            return Err((
                400,
                "invalid_prefer",
                "prefer must select an allowed completions API".into(),
            ));
        }
    }
    Ok(())
}
