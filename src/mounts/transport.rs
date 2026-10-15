use super::protocol::Api;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::json;

pub fn admin_error(status: u16, code: &str, message: &str) -> Response {
    let status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    (
        status,
        axum::Json(json!({"error": {"code": code, "message": message}})),
    )
        .into_response()
}

pub fn sse(frames: Vec<String>) -> Response {
    (
        [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
        frames.concat(),
    )
        .into_response()
}

pub fn http_error(api: Api, status: u16, code: &str, message: &str) -> Response {
    let body = match api {
        Api::Anthropic => json!({"type": "error", "error": {"type": code, "message": message}}),
        Api::Google | Api::Vertex => {
            json!({"error": {"code": status, "message": message, "status": code}})
        }
        _ => json!({"error": {"message": message, "type": "invalid_request_error", "code": code}}),
    };
    let status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    (status, axum::Json(body)).into_response()
}

pub fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

pub fn bearer(headers: &HeaderMap) -> Option<String> {
    header(headers, "authorization")
        .and_then(crate::bearer::bearer_token)
        .map(str::to_string)
}

pub fn pairs(headers: &HeaderMap) -> Vec<(String, String)> {
    headers
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or_default().to_string()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bearer_preserves_key_for_every_scheme_case() {
        for scheme in ["Bearer", "bearer", "BEARER", "bEaReR"] {
            let mut headers = HeaderMap::new();
            headers.insert(
                "authorization",
                format!("{scheme} MiXeD-key").parse().unwrap(),
            );
            assert_eq!(bearer(&headers).as_deref(), Some("MiXeD-key"));
        }
    }
}
