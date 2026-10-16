use super::protocol::{path_api, Api};
use axum::http::HeaderMap;

#[test]
fn vertex_routes_accept_publisher_resource_paths() {
    for publisher in ["google", "anthropic", "custom"] {
        for prefix in ["/v1", "/v1beta/projects/p/locations/l"] {
            let path = format!("{prefix}/publishers/{publisher}/models/m:streamGenerateContent");
            assert_eq!(path_api(&path), Some(Api::Vertex));
        }
    }
    assert_eq!(
        path_api("/v1beta/models/m:streamGenerateContent"),
        Some(Api::Google)
    );
}

#[test]
fn anthropic_metadata_fallback_does_not_change_decoded_options() {
    let mut headers = HeaderMap::new();
    headers.insert("x-api-key", "mock".parse().unwrap());
    let body = r#"{"model":"m","max_tokens":10,"metadata":{"user_id":"fallback"},"messages":[{"role":"user","content":"hi"}]}"#;
    let (request, signal) = Api::Anthropic
        .decode("/v1/messages", body, &headers)
        .unwrap();
    assert_eq!(signal.as_deref(), Some("fallback"));
    assert_eq!(request.options.session_id, None);
    headers.insert("x-session-affinity", "header".parse().unwrap());
    let (request, signal) = Api::Anthropic
        .decode("/v1/messages", body, &headers)
        .unwrap();
    assert_eq!(signal.as_deref(), Some("header"));
    assert_eq!(request.options.session_id.as_deref(), Some("header"));
}
