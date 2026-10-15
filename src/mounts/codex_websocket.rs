use super::codex_continuation::restore;
use super::protocol::Api;
use super::table::MountSpec;
use crate::server::AppState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::HeaderMap;
use axum::response::Response;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn upgrade(
    upgrade: WebSocketUpgrade,
    state: Arc<AppState>,
    path: String,
    headers: HeaderMap,
    spec: Option<MountSpec>,
) -> Response {
    upgrade
        .max_message_size(2 * 1024 * 1024)
        .on_upgrade(move |socket| serve(socket, state, path, headers, spec))
}

async fn serve(
    mut socket: WebSocket,
    state: Arc<AppState>,
    path: String,
    headers: HeaderMap,
    spec: Option<MountSpec>,
) {
    let mut decode_headers = headers.clone();
    if spec.is_some() && Api::Codex.key(&headers).is_empty() {
        decode_headers.insert(
            "authorization",
            axum::http::HeaderValue::from_static("Bearer "),
        );
    }
    let mut previous: Option<(String, Vec<Value>)> = None;
    while let Some(Ok(message)) = socket.recv().await {
        let body = match message {
            Message::Text(body) => body,
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) => continue,
            _ => {
                if !send_error(&mut socket, "invalid_request", "expected JSON text frame").await {
                    break;
                }
                continue;
            }
        };
        let mut request = match restore(&body, previous.as_ref()) {
            Ok(request) => request,
            Err((code, message)) => {
                if !send_error(&mut socket, code, message).await {
                    break;
                }
                continue;
            }
        };
        let req = match Api::Codex.decode(&path, &request.to_string(), &decode_headers) {
            Ok(req) => req,
            Err(error) => {
                if !send_error(&mut socket, "invalid_request", &error).await {
                    break;
                }
                continue;
            }
        };
        if spec.as_ref().is_some_and(|s| {
            !s.protocols.is_empty() && !s.protocols.iter().any(|p| p == Api::Codex.name())
        }) {
            if !send_error(
                &mut socket,
                "protocol_not_mounted",
                "protocol not enabled for this mount",
            )
            .await
            {
                break;
            }
            continue;
        }
        let response = crate::server::process(
            &state,
            Api::Codex,
            Api::Codex.key(&headers),
            req,
            spec.clone(),
        );
        let success = response.status().is_success();
        let Ok(bytes) = axum::body::to_bytes(response.into_body(), usize::MAX).await else {
            break;
        };
        if !success {
            let error: Value = serde_json::from_slice(&bytes).unwrap_or_default();
            if socket
                .send(Message::Text(
                    json!({"type":"error", "error":error["error"]})
                        .to_string()
                        .into(),
                ))
                .await
                .is_err()
            {
                break;
            }
            continue;
        }
        let mut history = request["input"]
            .as_array_mut()
            .expect("validated input")
            .clone();
        let mut continuation = None;
        for frame in String::from_utf8_lossy(&bytes).split("\n\n") {
            let Some(data) = frame.strip_prefix("data: ") else {
                continue;
            };
            let Ok(event) = serde_json::from_str::<Value>(data) else {
                continue;
            };
            if event["type"] == "response.output_item.done" {
                history.push(event["item"].clone());
            }
            if event["type"] == "response.completed" || event["type"] == "response.incomplete" {
                continuation = event["response"]["id"]
                    .as_str()
                    .map(|id| (id.to_owned(), history.clone()));
            }
            if socket
                .send(Message::Text(data.to_owned().into()))
                .await
                .is_err()
            {
                return;
            }
        }
        previous = continuation;
    }
}

async fn send_error(socket: &mut WebSocket, code: &str, message: &str) -> bool {
    socket
        .send(Message::Text(
            json!({"type":"error", "error":{"code":code,"message":message}})
                .to_string()
                .into(),
        ))
        .await
        .is_ok()
}
