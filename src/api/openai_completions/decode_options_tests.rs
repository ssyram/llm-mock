use serde_json::json;
use super::decode::decode;

#[test]
fn decodes_options_variants_and_session_header() {
    let body = json!({
        "model": "m", "messages": [],
        "max_tokens": 64, "reasoning_effort": "high",
        "tool_choice": {"type": "function", "function": {"name": "read"}}
    });
    let decoded = decode(&body, Some("session-hdr")).expect("decode ok");
    assert_eq!(decoded.options.max_tokens, Some(64));
    assert_eq!(decoded.options.reasoning.as_deref(), Some("high"));
    assert_eq!(decoded.options.tool_choice.as_ref(), Some(&body["tool_choice"]));
    assert_eq!(decoded.options.session_id.as_deref(), Some("session-hdr"));
    let openrouter = decode(&json!({"model": "m", "messages": [], "reasoning": {"effort": "low"}}), None).unwrap();
    assert_eq!(openrouter.options.reasoning.as_deref(), Some("low"));
    let string_thinking = decode(&json!({"model": "m", "messages": [], "thinking": "medium"}), None).unwrap();
    assert_eq!(string_thinking.options.reasoning.as_deref(), Some("medium"));
}

