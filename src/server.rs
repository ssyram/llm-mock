use crate::api::bedrock_converse_stream::{decode, encode, vendor};
use crate::capture::CaptureSink;
use crate::model::UnifiedRequest;
use crate::mounts::protocol::Api;
use crate::mounts::table::{MountSpec, MountTable};
use crate::mounts::transport::http_error;
use crate::mounts::{admin, entry_admin, routing};
use crate::registry::Registry;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, post};
use axum::Router;
use std::sync::Arc;

pub struct AppState {
    pub registry: Registry,
    pub capture: CaptureSink,
    pub mounts: MountTable,
}

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/model/{id}/converse-stream", post(bedrock))
        .route(
            "/__admin/entries",
            post(entry_admin::add)
                .get(entry_admin::list)
                .delete(entry_admin::remove),
        )
        .route("/__admin/scripts", post(admin::add).get(admin::list))
        .route("/__admin/scripts/{name}", delete(admin::remove))
        .fallback(routing::route)
        .with_state(state)
}

pub(crate) async fn bedrock(
    State(state): State<Arc<AppState>>,
    uri: Uri,
    headers: HeaderMap,
    body: String,
) -> Response {
    let body = match serde_json::from_str(&body) {
        Ok(body) => body,
        Err(error) => return bedrock_error(400, "invalid_request", &error.to_string()),
    };
    let req = match decode::decode_request(uri.path(), &body) {
        Ok(req) => req,
        Err(error) => return bedrock_error(400, "invalid_request", &error),
    };
    let info = decode::decode_request_info(
        uri.path(),
        &crate::mounts::transport::pairs(&headers),
        &body,
    )
    .expect("request already decoded");
    if info.key_id.is_empty() {
        return bedrock_error(401, "missing_key", "no Bedrock authorization header");
    }
    let value = serde_json::to_value(&req).expect("request serializes");
    state.capture.record(vendor::API, &info.key_id, &value);
    let input = serde_json::json!({
        "api": vendor::API, "keyId": info.key_id, "model": req.model,
        "sessionSignal": req.options.session_id, "request": value,
    });
    let entry = match routing::entry(&state, &info.key_id, &req, None) {
        Ok(entry) => entry,
        Err((status, code, message)) => return bedrock_error(status, code, &message),
    };
    match state.registry.execute(&entry, &input) {
        Ok(message) => match encode::encode_eventstream(&message) {
            Ok(bytes) => (
                [(
                    axum::http::header::CONTENT_TYPE,
                    "application/vnd.amazon.eventstream",
                )],
                bytes,
            )
                .into_response(),
            Err(error) => bedrock_error(500, "encode_failed", &error),
        },
        Err(error) => bedrock_error(error.status, &error.code, &error.message),
    }
}

fn bedrock_error(status: u16, code: &str, message: &str) -> Response {
    let error = crate::model::MockError {
        status,
        code: code.into(),
        message: message.into(),
    };
    (
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        axum::Json(encode::encode_error(&error)),
    )
        .into_response()
}

pub(crate) fn process(
    state: &AppState,
    api: Api,
    key_id: String,
    req: UnifiedRequest,
    session_signal: Option<String>,
    spec: Option<MountSpec>,
) -> Response {
    if spec.is_none() && key_id.is_empty() {
        return http_error(
            api,
            401,
            "missing_key",
            "no API key header for this protocol",
        );
    }
    let value = serde_json::to_value(&req).unwrap_or(serde_json::Value::Null);
    state.capture.record(api.name(), &key_id, &value);
    let input = serde_json::json!({
        "api": api.name(), "keyId": key_id, "model": req.model,
        "sessionSignal": session_signal, "request": value,
    });
    match routing::entry(state, &key_id, &req, spec) {
        Ok(entry) => routing::execute(state, api, entry, input),
        Err((status, code, message)) => http_error(api, status, code, &message),
    }
}
