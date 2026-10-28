use super::{eventstream_tests::decode_frames, tests::sample_message};
use crate::{
    capture::CaptureSink,
    mounts::table::MountTable,
    registry::{Entry, Matcher, Registry, Reply},
    server::{bedrock, AppState},
};
use axum::{
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, Uri},
};
use std::sync::Arc;

fn state() -> Arc<AppState> {
    let registry = Registry::empty();
    registry.add(Entry {
        key_id: "local".into(),
        matcher: Matcher::Any,
        reply: Reply::Script {
            command: format!(
                "printf '%s' '{}'",
                serde_json::to_string(&sample_message()).unwrap()
            ),
        },
    });
    Arc::new(AppState {
        registry,
        capture: CaptureSink::new(None),
        mounts: MountTable::new(None, None, "http://127.0.0.1".into()),
    })
}

#[tokio::test]
async fn bedrock_http_returns_binary_eventstream_for_bearer_and_sigv4() {
    for auth in ["Bearer local", "AWS4-HMAC-SHA256 Credential=local/20260101/us-east-1/bedrock/aws4_request, SignedHeaders=host, Signature=fake"] {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", HeaderValue::from_str(auth).unwrap());
        let response = bedrock(State(state()), Uri::from_static("/model/anthropic.claude-mock/converse-stream"), headers, r#"{"messages":[{"role":"user","content":[{"text":"hello"}]}]}"#.into()).await;
        if response.status() != StatusCode::OK {
            let status = response.status();
            let body = String::from_utf8_lossy(&axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap()).to_string();
            panic!("auth={auth:?} status={status} body={body}");
        }
        assert_eq!(response.headers()["content-type"], "application/vnd.amazon.eventstream");
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let events = decode_frames(&bytes);
        assert_eq!(events[1]["contentBlockDelta"]["delta"]["text"], "hello");
    }
}

#[tokio::test]
async fn bedrock_http_errors_keep_status_and_aws_json_shape() {
    let valid_body = r#"{"messages":[{"role":"user","content":[{"text":"hello"}]}]}"#;
    for (auth, body, status, code) in [
        (None, valid_body, 401, "missing_key"),
        (Some("Bearer unknown"), valid_body, 404, "no_mock_match"),
        (Some("Bearer local"), "not json", 400, "invalid_request"),
    ] {
        let mut headers = HeaderMap::new();
        if let Some(auth) = auth {
            headers.insert("authorization", HeaderValue::from_static(auth));
        }
        let response = bedrock(
            State(state()),
            Uri::from_static("/model/m/converse-stream"),
            headers,
            body.into(),
        )
        .await;
        assert_eq!(response.status().as_u16(), status);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(error["__type"], code);
        assert!(error["message"].as_str().is_some());
    }
}

