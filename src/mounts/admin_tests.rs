use super::admin;
use super::table::MountTable;
use crate::capture::CaptureSink;
use crate::registry::Registry;
use crate::server::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde_json::{json, Value};
use std::sync::Arc;

async fn json_body(response: axum::response::Response) -> Value {
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn admin_script_crud_and_invalid_requests() {
    let state = Arc::new(AppState {
        registry: Registry::empty(),
        capture: CaptureSink::new(None),
        mounts: MountTable::new(None, None, "http://127.0.0.1:18000".into()),
    });
    let input = json!({"name":"test","command":"cat","prefer":"mistral-conversations"}).to_string();
    let response = admin::add(State(state.clone()), input.clone()).await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let result = json_body(response).await;
    assert_eq!(result["url"], "http://127.0.0.1:18000/test");
    assert_eq!(result["command"], "cat");
    assert_eq!(result["prefer"], "mistral-conversations");
    assert_eq!(
        admin::add(State(state.clone()), input).await.status(),
        StatusCode::CONFLICT
    );
    let listed = json_body(admin::list(State(state.clone())).await).await;
    assert_eq!(listed["scripts"].as_array().unwrap().len(), 1);
    for invalid in [
        "{",
        r#"{"name":"v1","command":"cat"}"#,
        r#"{"name":"empty","command":""}"#,
        r#"{"name":"bad","command":"cat","port":0}"#,
    ] {
        assert_eq!(
            admin::add(State(state.clone()), invalid.into())
                .await
                .status(),
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(
        admin::remove(State(state.clone()), Path("test".into()))
            .await
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        admin::remove(State(state.clone()), Path("test".into()))
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert!(state.mounts.list().is_empty());
}
