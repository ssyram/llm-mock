use super::*;

use crate::model::{Message, StopReason, TranscriptContext, UserContent, UserMessage, Usage};

fn req_with_text(text: &str) -> UnifiedRequest {
    UnifiedRequest {
        model: "test-model".into(),
        context: TranscriptContext {
            messages: vec![Message::User(UserMessage { content: UserContent::Text(text.into()), timestamp: 0 })],
        },
        options: Default::default(),
    }
}

fn error_entry(key_id: &str, matcher: Matcher, status: u16) -> Entry {
    Entry {
        key_id: key_id.into(),
        matcher,
        reply: Reply::Error { status, code: "mock".into(), message: "scripted error".into() },
    }
}

fn temp_path(name: &str) -> String {
    std::env::temp_dir().join(format!("mock-registry-{name}-{}.json", std::process::id())).to_string_lossy().into()
}

#[test]
fn entry_json_roundtrip_keeps_admin_shape() {
    let entry = error_entry("k1", Matcher::TextIncludes { value: "deploy".into() }, 429);
    let json = serde_json::to_string(&entry).unwrap();
    assert!(json.contains("\"keyId\"") && json.contains("\"textIncludes\"") && json.contains("\"error\""));
    assert_eq!(serde_json::from_str::<Entry>(&json).unwrap(), entry);
}

#[test]
fn add_then_match_executes_error_reply() {
    let registry = Registry::default();
    registry.add(error_entry("k1", Matcher::TextIncludes { value: "deploy".into() }, 429));
    let MatchOutcome::One(entry) = registry.match_key("k1", &req_with_text("please deploy now")) else {
        panic!("expected exactly one match");
    };
    let err = registry.execute(&entry, &serde_json::json!({})).unwrap_err();
    assert_eq!((err.status, err.code.as_str()), (429, "mock"));
}

#[test]
fn coexisting_matchers_same_keyid_yield_ambiguous() {
    let registry = Registry::default();
    registry.add(error_entry("k1", Matcher::Any, 400));
    registry.add(error_entry("k1", Matcher::TextIncludes { value: "deploy".into() }, 418));
    assert_eq!(registry.list().len(), 2);
    let MatchOutcome::Ambiguous(count) = registry.match_key("k1", &req_with_text("deploy now")) else {
        panic!("expected ambiguous match for overlapping matchers");
    };
    assert_eq!(count, 2);
    let MatchOutcome::One(_) = registry.match_key("k1", &req_with_text("hello")) else {
        panic!("expected unique match for non-overlapping text");
    };
}

#[test]
fn remove_restores_uniqueness_and_is_idempotent() {
    let registry = Registry::default();
    let any = error_entry("k1", Matcher::Any, 400);
    registry.add(any.clone());
    registry.add(error_entry("k1", Matcher::TextIncludes { value: "deploy".into() }, 418));
    assert!(matches!(registry.match_key("k1", &req_with_text("deploy")), MatchOutcome::Ambiguous(_)));
    assert_eq!(registry.remove(&any), 1);
    assert!(matches!(registry.match_key("k1", &req_with_text("deploy")), MatchOutcome::One(_)));
    assert_eq!(registry.remove(&any), 0);
}

#[test]
fn remove_requires_full_entry_shape() {
    let registry = Registry::default();
    registry.add(error_entry("k1", Matcher::Any, 400));
    assert_eq!(registry.remove(&error_entry("k1", Matcher::Any, 401)), 0);
    assert_eq!(registry.list().len(), 1);
}

#[test]
fn keyid_groups_are_independent() {
    let registry = Registry::default();
    registry.add(error_entry("k1", Matcher::Any, 400));
    registry.add(error_entry("k2", Matcher::Any, 418));
    let MatchOutcome::One(entry) = registry.match_key("k2", &req_with_text("anything")) else {
        panic!("expected one match under k2");
    };
    assert_eq!(registry.execute(&entry, &serde_json::json!({})).unwrap_err().status, 418);
    assert!(matches!(registry.match_key("k3", &req_with_text("anything")), MatchOutcome::NoMatch));
}

#[test]
fn seed_file_load_then_runtime_add() {
    let path = temp_path("seed");
    std::fs::write(
        &path,
        r#"{"entries":[{"keyId":"seed","matcher":{"type":"any"},"reply":{"type":"error","status":401,"code":"c","message":"m"}}]}"#,
    )
    .unwrap();
    let registry = Registry::load(&path).unwrap();
    assert_eq!(registry.list().len(), 1);
    registry.add(error_entry("runtime", Matcher::Any, 500));
    assert_eq!(registry.list().len(), 2);
    assert!(matches!(registry.match_key("seed", &req_with_text("x")), MatchOutcome::One(_)));
    std::fs::remove_file(&path).ok();
}

#[test]
fn load_failure_is_error() {
    assert!(Registry::load("/nonexistent/mock-registry.json").is_err());
}

#[test]
fn execute_script_error_preserves_status_code_and_message() {
    let entry = Entry {
        key_id: "k1".into(),
        matcher: Matcher::Any,
        reply: Reply::Script {
            command: r#"cat >/dev/null
printf '%s' '{"error":{"status":429,"code":"mock_failure","message":"retry later"}}'"#.into(),
        },
    };
    let error = Registry::empty().execute(&entry, &serde_json::json!({"request": {}})).unwrap_err();
    assert_eq!(error.status, 429);
    assert_eq!(error.code, "mock_failure");
    assert_eq!(error.message, "retry later");
}

#[test]
fn execute_script_invalid_error_keeps_validation_failure() {
    let entry = Entry {
        key_id: "k1".into(),
        matcher: Matcher::Any,
        reply: Reply::Script {
            command: r#"cat >/dev/null
printf '%s' '{"error":{"status":"invalid","code":"bad","message":"invalid"}}'"#.into(),
        },
    };
    let error = Registry::empty().execute(&entry, &serde_json::json!({})).unwrap_err();
    assert_eq!(error.status, 500);
    assert_eq!(error.code, "script_error_invalid");
    assert!(error.message.contains("invalid type"));
}

#[test]
fn execute_file_reply_roundtrip() {
    let msg = AssistantMessage {
        content: vec![],
        api: "openai-completions".into(),
        provider: "openai".into(),
        model: "gpt-test".into(),
        response_model: None,
        response_id: None,
        provider_thinking_level: None,
        thinking_level: None,
        usage: Usage::default(),
        stop_reason: StopReason::Stop,
        error_message: None,
        raw_stop_reason: None,
        end_turn: None,
        timestamp: 0,
        duration_ms: None,
    };
    let path = temp_path("reply");
    std::fs::write(&path, serde_json::to_string(&msg).unwrap()).unwrap();
    let registry = Registry::default();
    registry.add(Entry { key_id: "k1".into(), matcher: Matcher::Any, reply: Reply::File { path: path.clone() } });
    let MatchOutcome::One(entry) = registry.match_key("k1", &req_with_text("x")) else {
        panic!("expected one match");
    };
    assert_eq!(registry.execute(&entry, &serde_json::json!({})).unwrap(), msg);
    std::fs::remove_file(&path).ok();
}
