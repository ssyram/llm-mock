use super::request_fixture::{call, state};
use super::script_fixture::command;
use axum::http::{HeaderMap, StatusCode};
use mock_llm_server::mounts::admin::{register, AddScript};
use mock_llm_server::mounts::table::MountSpec;
use serde_json::json;

pub async fn protocol_routes() {
    let state = state();
    register(
        &state,
        AddScript {
            name: "test".into(),
            spec: MountSpec {
                command: command(),
                ..Default::default()
            },
            port: None,
            cwd: None,
        },
        false,
    )
    .unwrap();
    let cases = [
        ("/test/v1/chat/completions", "openai-completions", json!({"model":"test", "messages":[{"role":"user","content":"hi"}]})),
        ("/test/v1/responses", "openai-responses", json!({"model":"test", "input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]})),
        ("/test/responses", "openai-responses", json!({"model":"test", "input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]})),
        ("/test/openai/v1/responses", "azure-openai-responses", json!({"model":"test", "input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]})),
        ("/test/codex/responses", "openai-codex-responses", json!({"model":"test", "input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]})),
        ("/test/v1/messages", "anthropic-messages", json!({"model":"test", "max_tokens":32,"messages":[{"role":"user","content":"hi"}]})),
        ("/test/messages", "pi-messages", json!({"model":"test", "context":{"messages":[{"role":"user","content":"hi","timestamp":0}]},"options":{}})),
        ("/test/v1beta/models/test:streamGenerateContent?alt=sse", "google-generative-ai", json!({"contents":[{"role":"user","parts":[{"text":"hi"}]}]})),
        ("/test/v1/projects/p/locations/l/publishers/google/models/test:streamGenerateContent?alt=sse", "google-vertex", json!({"contents":[{"role":"user","parts":[{"text":"hi"}]}]})),
    ];
    for (path, api, body) in cases {
        let (status, text) = call(state.clone(), path, HeaderMap::new(), body).await;
        assert_eq!(status, StatusCode::OK, "{path}: {text}");
        assert!(text.contains(api), "{path}: {text}");
    }
    state.mounts.remove("test").await.unwrap();
    let (status, _) = call(
        state,
        "/test/v1/chat/completions",
        HeaderMap::new(),
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

pub async fn session_key_and_mistral() {
    let state = state();
    register(
        &state,
        AddScript {
            name: "m".into(),
            spec: MountSpec {
                command: command(),
                prefer: Some("mistral-conversations".into()),
                protocols: vec![],
            },
            port: None,
            cwd: None,
        },
        false,
    )
    .unwrap();
    let mut headers = HeaderMap::new();
    headers.insert("authorization", "Bearer test-key".parse().unwrap());
    let (status, text) = call(state, "/m/v1/chat/completions", headers, json!({"model":"test", "messages":[{"role":"user","content":"hi"}],"prompt_cache_key":"session"})).await;
    assert_eq!(status, StatusCode::OK, "{text}");
    assert!(
        text.contains("mistral-conversations|test-key|session"),
        "{text}"
    );
}
