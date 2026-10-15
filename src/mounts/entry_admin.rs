use super::transport::admin_error;
use crate::registry::Entry;
use crate::server::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use std::sync::Arc;

pub async fn add(State(s): State<Arc<AppState>>, body: String) -> Response {
    let entry: Entry = match serde_json::from_str(&body) {
        Ok(e) => e,
        Err(e) => return admin_error(400, "invalid_entry", &e.to_string()),
    };
    s.registry.add(entry.clone());
    match serde_json::to_value(&entry) {
        Ok(v) => (StatusCode::CREATED, axum::Json(v)).into_response(),
        Err(e) => admin_error(500, "entry_serialize_failed", &e.to_string()),
    }
}

pub async fn list(State(s): State<Arc<AppState>>) -> Response {
    (
        StatusCode::OK,
        axum::Json(json!({"entries": s.registry.list()})),
    )
        .into_response()
}

pub async fn remove(State(s): State<Arc<AppState>>, body: String) -> Response {
    let entry: Entry = match serde_json::from_str(&body) {
        Ok(e) => e,
        Err(e) => return admin_error(400, "invalid_entry", &e.to_string()),
    };
    let removed = s.registry.remove(&entry);
    if removed == 0 {
        return admin_error(
            404,
            "entry_not_found",
            "no registered entry equals the request body",
        );
    }
    (StatusCode::OK, axum::Json(json!({"removed": removed}))).into_response()
}
