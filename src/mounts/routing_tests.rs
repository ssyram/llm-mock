use super::admin::{register, AddScript};
use super::request_fixture::{call, state};
use super::script_fixture::command;
use super::table::MountSpec;
use crate::registry::{Entry, Matcher, Reply};
use axum::http::{HeaderMap, StatusCode};
use serde_json::json;

#[test]
fn mount_routes_script_protocols_then_remove_returns_404() {
    super::tests::run_script_and_port_test(async {
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
            (
                "/test/v1/chat/completions",
                "openai-completions",
                json!({"model":"test", "messages":[{"role":"user","content":"hi"}]}),
            ),
            (
                "/test/v1/responses",
                "openai-responses",
                json!({"model":"test", "input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]}),
            ),
            (
                "/test/responses",
                "openai-responses",
                json!({"model":"test", "input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]}),
            ),
            (
                "/test/openai/v1/responses",
                "azure-openai-responses",
                json!({"model":"test", "input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]}),
            ),
            (
                "/test/codex/responses",
                "openai-codex-responses",
                json!({"model":"test", "input":[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]}),
            ),
            (
                "/test/v1/messages",
                "anthropic-messages",
                json!({"model":"test", "max_tokens":32,"messages":[{"role":"user","content":"hi"}]}),
            ),
            (
                "/test/messages",
                "pi-messages",
                json!({"model":"test", "context":{"messages":[{"role":"user","content":"hi","timestamp":0}]},"options":{}}),
            ),
            (
                "/test/v1beta/models/test:streamGenerateContent?alt=sse",
                "google-generative-ai",
                json!({"contents":[{"role":"user","parts":[{"text":"hi"}]}]}),
            ),
            (
                "/test/v1/projects/p/locations/l/publishers/google/models/test:streamGenerateContent?alt=sse",
                "google-vertex",
                json!({"contents":[{"role":"user","parts":[{"text":"hi"}]}]}),
            ),
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
    });
}

#[test]
fn mount_preserves_session_key_and_explicit_mistral() {
    super::tests::run_script_and_port_test(async {
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
    });
}

#[tokio::test]
async fn root_registry_compatible_and_unknown_mount_does_not_fall_back() {
    let state = state();
    state.registry.add(Entry {
        key_id: "key".into(),
        matcher: Matcher::Any,
        reply: Reply::Error {
            status: 418,
            code: "root".into(),
            message: "root error".into(),
        },
    });
    let mut headers = HeaderMap::new();
    let body = json!({"model":"test","messages":[{"role":"user","content":"hi"}]});
    for scheme in ["Bearer", "bearer", "BEARER", "bEaReR"] {
        headers.insert("authorization", format!("{scheme} key").parse().unwrap());
        assert_eq!(
            call(state.clone(), "/v1/chat/completions", headers.clone(), body.clone()).await.0,
            StatusCode::IM_A_TEAPOT,
            "{scheme}"
        );
    }
    assert_eq!(
        call(
            state.clone(),
            "/missing/v1/chat/completions",
            headers,
            body.clone()
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call(state, "/v1/chat/completions", HeaderMap::new(), body)
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
}

#[test]
fn script_error_is_protocol_visible() {
    super::tests::run_script_and_port_test(async {
        let state = state();
        register(&state, AddScript { name: "err".into(), spec: MountSpec { command: "cat >/dev/null; printf '%s' '{\"error\":{\"status\":429,\"code\":\"limited\",\"message\":\"slow down\"}}'".into(), ..Default::default() }, port: None, cwd: None }, false).unwrap();
        let (status, text) = call(
            state,
            "/err/v1/chat/completions",
            HeaderMap::new(),
            json!({"model":"test","messages":[]}),
        )
        .await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert!(text.contains("limited"), "{text}");
    });
}
