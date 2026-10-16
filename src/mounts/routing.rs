use super::protocol::{path_api, Api};
use super::selection::select_api;
use super::table::MountSpec;
use super::transport::{admin_error, http_error, sse};
use crate::registry::{Entry, MatchOutcome, Matcher, Reply};
use crate::server::AppState;
use axum::body::Bytes;
use axum::extract::{State, WebSocketUpgrade};
use axum::http::{HeaderMap, Method, Uri};
use axum::response::Response;
use axum::Extension;
use std::sync::Arc;

#[derive(Clone)]
pub struct DedicatedMount(pub String);

pub async fn route(
    State(state): State<Arc<AppState>>,
    dedicated: Option<Extension<DedicatedMount>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    websocket: Result<WebSocketUpgrade, axum::extract::ws::rejection::WebSocketUpgradeRejection>,
    body: Bytes,
) -> Response {
    let (path, spec) = if let Some(Extension(DedicatedMount(name))) = dedicated {
        let Some(spec) = state.mounts.spec(&name) else {
            return admin_error(404, "mount_not_found", "mount no longer exists");
        };
        (uri.path().to_owned(), Some(spec))
    } else if path_api(uri.path()).is_some() {
        (uri.path().to_owned(), None)
    } else {
        let Some((name, rest)) = uri.path().trim_start_matches('/').split_once('/') else {
            return admin_error(404, "route_not_found", "unknown route");
        };
        let Some(spec) = state.mounts.spec(name) else {
            return admin_error(404, "mount_not_found", "unknown mount");
        };
        (format!("/{rest}"), Some(spec))
    };
    let Some(api) = path_api(&path) else {
        return admin_error(404, "route_not_found", "unknown protocol path");
    };
    if api == Api::Codex && method == Method::GET {
        return match websocket {
            Ok(upgrade) => super::codex_websocket::upgrade(upgrade, state, path, headers, spec),
            Err(_) => http_error(api, 400, "invalid_request", "WebSocket upgrade required"),
        };
    }
    if method != Method::POST {
        return admin_error(405, "method_not_allowed", "protocol routes require POST");
    }
    let body = match tokio::task::spawn_blocking({
        let headers = headers.clone();
        move || super::request_body::decode(&headers, body)
    })
    .await
    {
        Ok(Ok(body)) => body,
        Ok(Err(error)) => return http_error(api, 400, "invalid_request", &error),
        Err(error) => return http_error(api, 500, "decode_failed", &error.to_string()),
    };
    let mut api = select_api(api, &headers, &body, spec.as_ref());
    if api == Api::Responses && headers.contains_key("api-key") {
        api = Api::Azure;
    }
    if spec
        .as_ref()
        .is_some_and(|s| !s.protocols.is_empty() && !s.protocols.iter().any(|p| p == api.name()))
    {
        return http_error(
            api,
            404,
            "protocol_not_mounted",
            "protocol not enabled for this mount",
        );
    }
    let path = match uri.query() {
        Some(q) => format!("{path}?{q}"),
        None => path,
    };
    let mut decode_headers = headers.clone();
    if spec.is_some() && api.key(&headers).is_empty() {
        let auth = match api {
            Api::Anthropic => "x-api-key",
            Api::Azure => "api-key",
            _ => "authorization",
        };
        let value = if auth == "authorization" {
            "Bearer "
        } else {
            ""
        };
        decode_headers.insert(auth, axum::http::HeaderValue::from_static(value));
    }
    match api.decode(&path, &body, &decode_headers) {
        Ok((req, signal)) => {
            crate::server::process(&state, api, api.key(&headers), req, signal, spec)
        }
        Err(error) => http_error(api, 400, "invalid_request", &error),
    }
}

pub fn entry(
    state: &AppState,
    key: &str,
    req: &crate::model::UnifiedRequest,
    spec: Option<MountSpec>,
) -> Result<Entry, (u16, &'static str, String)> {
    if let Some(spec) = spec {
        return Ok(Entry {
            key_id: key.into(),
            matcher: Matcher::Any,
            reply: Reply::Script {
                command: spec.command,
            },
        });
    }
    match state.registry.match_key(key, req) {
        MatchOutcome::One(entry) => Ok(entry),
        MatchOutcome::NoMatch => Err((
            404,
            "no_mock_match",
            format!("no registered script for keyId {key}"),
        )),
        MatchOutcome::Ambiguous(_) => Err((
            409,
            "ambiguous_match",
            format!("multiple scripts match for keyId {key}"),
        )),
    }
}

pub fn execute(state: &AppState, api: Api, entry: Entry, input: serde_json::Value) -> Response {
    match state.registry.execute(&entry, &input) {
        Ok(msg) => match api.encode(&msg) {
            Ok(frames) => sse(frames),
            Err(e) => http_error(api, 500, "encode_failed", &e),
        },
        Err(e) => http_error(api, e.status, &e.code, &e.message),
    }
}
