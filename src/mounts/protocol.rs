use super::transport::{bearer, header, pairs};
use crate::api::{
    anthropic_messages, azure_openai_responses, google_generative_ai, google_vertex,
    mistral_conversations, openai_codex_responses, openai_completions, openai_responses,
    pi_messages,
};
use crate::model::{AssistantMessage, UnifiedRequest};
use axum::http::HeaderMap;
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Api {
    Completions,
    Responses,
    Anthropic,
    Google,
    Vertex,
    Mistral,
    Azure,
    Codex,
    Pi,
}

impl Api {
    pub fn name(self) -> &'static str {
        match self {
            Self::Completions => "openai-completions",
            Self::Responses => "openai-responses",
            Self::Anthropic => "anthropic-messages",
            Self::Google => "google-generative-ai",
            Self::Vertex => "google-vertex",
            Self::Mistral => "mistral-conversations",
            Self::Azure => "azure-openai-responses",
            Self::Codex => "openai-codex-responses",
            Self::Pi => "pi-messages",
        }
    }

    pub fn decode(
        self,
        path: &str,
        body: &str,
        headers: &HeaderMap,
    ) -> Result<(UnifiedRequest, Option<String>), String> {
        let hdrs = pairs(headers);
        match self {
            Self::Responses => {
                return openai_responses::decode::decode_request(body, &hdrs)
                    .map(|(r, info)| (r, info.session_signal))
            }
            Self::Codex => {
                return openai_codex_responses::decode::decode_request(body, &hdrs)
                    .map(|(r, info)| (r, info.session_signal))
            }
            Self::Azure => {
                return azure_openai_responses::decode::decode_request(body, &hdrs)
                    .map(|(r, info)| (r, info.session_signal))
            }
            _ => {}
        }
        let value: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
        let request = match self {
            Self::Completions => openai_completions::decode::decode(
                &value,
                header(headers, "x-session-id")
                    .or_else(|| header(headers, "x-session-affinity"))
                    .or_else(|| header(headers, "x-client-request-id")),
            ),
            Self::Anthropic => {
                return anthropic_messages::decode_request(
                    &value,
                    &anthropic_messages::WireHeaders {
                        x_api_key: header(headers, "x-api-key"),
                        authorization: header(headers, "authorization"),
                        x_session_affinity: header(headers, "x-session-affinity"),
                        x_session_id: header(headers, "x-session-id"),
                    },
                )
                .map(|decoded| (decoded.request, decoded.info.session_signal))
            }
            Self::Google => google_generative_ai::decode::decode_request(path, &value),
            Self::Vertex => google_vertex::decode::decode_request(path, &value),
            Self::Mistral => {
                return mistral_conversations::decode::decode_request(&value, &hdrs)
                    .map(|(r, info)| (r, info.session_signal))
            }
            Self::Pi => pi_messages::decode(&value),
            _ => unreachable!(),
        }?;
        let signal = request.options.session_id.clone();
        Ok((request, signal))
    }

    pub fn encode(self, message: &AssistantMessage) -> Result<Vec<String>, String> {
        match self {
            Self::Completions => openai_completions::encode::encode(message),
            Self::Responses | Self::Azure => openai_responses::encode::encode_response(message),
            Self::Codex => openai_codex_responses::encode::encode_response(message),
            Self::Anthropic => anthropic_messages::encode_message(message),
            Self::Google | Self::Vertex => google_generative_ai::encode::encode_sse(message),
            Self::Mistral => mistral_conversations::encode::encode_sse(message),
            Self::Pi => pi_messages::encode(message),
        }
    }

    pub fn key(self, headers: &HeaderMap) -> String {
        let specific = match self {
            Self::Anthropic => header(headers, "x-api-key"),
            Self::Google | Self::Vertex => header(headers, "x-goog-api-key"),
            Self::Azure => header(headers, "api-key"),
            _ => None,
        };
        if self == Self::Google {
            return specific.unwrap_or_default().to_owned();
        }
        specific
            .map(str::to_owned)
            .or_else(|| bearer(headers))
            .unwrap_or_default()
    }
}

pub fn path_api(path: &str) -> Option<Api> {
    match path {
        "/v1/chat/completions" | "/chat/completions" => Some(Api::Completions),
        "/v1/responses" | "/responses" => Some(Api::Responses),
        "/v1/messages" => Some(Api::Anthropic),
        "/messages" => Some(Api::Pi),
        "/openai/v1/responses" => Some(Api::Azure),
        "/codex/responses" | "/backend-api/codex/responses" => Some(Api::Codex),
        _ if (path.starts_with("/v1/") || path.starts_with("/v1beta/"))
            && path.contains("/publishers/")
            && path.contains("/models/") =>
        {
            Some(Api::Vertex)
        }
        _ if path.starts_with("/v1beta/") => Some(Api::Google),
        _ => None,
    }
}
