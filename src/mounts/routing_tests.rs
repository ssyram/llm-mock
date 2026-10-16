use super::admin::{register, AddScript};
use super::request_fixture::{call, state};
use super::table::MountSpec;
use crate::registry::{Entry, Matcher, Reply};
use axum::http::{HeaderMap, StatusCode};
use serde_json::json;

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
            call(
                state.clone(),
                "/v1/chat/completions",
                headers.clone(),
                body.clone()
            )
            .await
            .0,
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
