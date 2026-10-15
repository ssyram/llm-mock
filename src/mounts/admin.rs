use super::routing::{route, DedicatedMount};
use super::table::{MountError, MountSpec, Script};
use super::transport::admin_error;
use crate::server::AppState;
use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct AddScript {
    pub name: String,
    #[serde(flatten)]
    pub spec: MountSpec,
    pub port: Option<u16>,
    /// Caller's working directory: relative command tokens that are files
    /// there get absolutized before the mount is stored.
    pub cwd: Option<String>,
}

pub fn register(
    state: &Arc<AppState>,
    input: AddScript,
    persist: bool,
) -> Result<Script, MountError> {
    let dedicated = DedicatedMount(input.name.clone());
    let listener_state = state.clone();
    let mut input = input;
    if let Some(cwd) = &input.cwd {
        input.spec.command = crate::registry::resolve_command(&input.spec.command, Some(std::path::Path::new(cwd)));
    }
    input.spec.command = crate::registry::resolve_command(&input.spec.command, None);
    state.mounts.register(
        input.name,
        input.spec,
        input.port,
        persist,
        move |listener| {
            let app = axum::Router::new()
                .fallback(route)
                .layer(axum::Extension(dedicated))
                .with_state(listener_state);
            tokio::spawn(async move {
                if let Err(error) = axum::serve(listener, app).await {
                    eprintln!("dedicated listener failed: {error}");
                }
            })
        },
    )
}

pub async fn add(State(state): State<Arc<AppState>>, body: String) -> Response {
    let input = match serde_json::from_str::<AddScript>(&body) {
        Ok(input) => input,
        Err(e) => return admin_error(400, "invalid_script", &e.to_string()),
    };
    match register(&state, input, true) {
        Ok(script) => (axum::http::StatusCode::CREATED, axum::Json(script)).into_response(),
        Err((status, code, message)) => admin_error(status, code, &message),
    }
}

pub async fn list(State(state): State<Arc<AppState>>) -> Response {
    axum::Json(json!({"scripts": state.mounts.list()})).into_response()
}

pub async fn remove(State(state): State<Arc<AppState>>, Path(name): Path<String>) -> Response {
    match state.mounts.remove(&name).await {
        Ok(()) => axum::Json(json!({"removed": name})).into_response(),
        Err((status, code, message)) => admin_error(status, code, &message),
    }
}
