use super::routing::route;
use super::table::MountTable;
use crate::capture::CaptureSink;
use crate::registry::Registry;
use crate::server::AppState;
use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use serde_json::Value;
use std::sync::Arc;

pub fn state() -> Arc<AppState> {
    Arc::new(AppState {
        registry: Registry::empty(),
        capture: CaptureSink::new(None),
        mounts: MountTable::new(None, None, "http://127.0.0.1:18000".into()),
    })
}

pub async fn call(
    state: Arc<AppState>,
    path: &str,
    headers: HeaderMap,
    body: Value,
) -> (StatusCode, String) {
    let response = route(
        State(state),
        None,
        Method::POST,
        path.parse::<Uri>().unwrap(),
        headers,
        Err(axum::extract::ws::rejection::ConnectionNotUpgradable::default().into()),
        body.to_string().into(),
    )
    .await;
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}
