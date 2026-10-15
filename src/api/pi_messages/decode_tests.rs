use serde_json::json;

use super::decode::{decode, decode_request, WireHeaders};
use super::test_fixture::{assistant, request};
use crate::model::*;

#[test]
fn preserves_unified_context_including_timestamps_and_metadata() {
    let body = request();
    let decoded = decode(&body).unwrap();
    let expected: TranscriptContext = serde_json::from_value(body["context"].clone()).unwrap();
    assert_eq!(decoded.context, expected);
    assert_eq!(decoded.model, "test-model");
    assert_eq!(
        decoded.options,
        DecodedOptions {
            max_tokens: Some(128),
            temperature: Some(0.25),
            session_id: Some("session-1".into()),
            tool_choice: Some("auto".into()),
            reasoning: Some("high".into()),
        }
    );
    assert_eq!(decoded.context.messages.len(), 5);
    let Message::System(system) = &decoded.context.messages[0] else {
        panic!("system")
    };
    assert_eq!(system.timestamp, 101);
    assert_eq!(system.sections.as_ref().unwrap()["remove"], None);
    assert_eq!(
        system.tools_added.as_ref().unwrap()[0].constrained_sampling,
        Some(json!(false))
    );
    let Message::User(user) = &decoded.context.messages[1] else {
        panic!("user")
    };
    assert_eq!(user.timestamp, 102);
    assert!(
        matches!(&user.content, UserContent::Blocks(blocks) if matches!(&blocks[1], UserBlock::Image(_)))
    );
    let Message::Assistant(history) = &decoded.context.messages[3] else {
        panic!("assistant")
    };
    assert_eq!(history, &assistant(StopReason::ToolUse));
    let Message::ToolResult(tool) = &decoded.context.messages[4] else {
        panic!("toolResult")
    };
    assert_eq!(tool.timestamp, 105);
    assert_eq!(tool.duration_ms, Some(12));
    assert_eq!(tool.content.len(), 2);
}

#[test]
fn ignores_extra_ts_assistant_fields_and_role_on_struct() {
    let body = request();
    let history = &body["context"]["messages"][3];
    let direct: AssistantMessage = serde_json::from_value(history.clone()).unwrap();
    assert_eq!(direct, assistant(StopReason::ToolUse));
    let decoded = decode(&body).unwrap();
    let encoded = serde_json::to_value(&decoded.context.messages[3]).unwrap();
    assert_eq!(encoded["role"], "assistant");
    assert!(encoded.get("diagnostics").is_none());
    assert!(encoded.get("deferred").is_none());
}

#[test]
fn preserves_function_tool_choice_as_json_object() {
    let mut body = request();
    body["options"]["toolChoice"] = json!({"type":"function","function":{"name":"read"}});
    let decoded = decode(&body).unwrap();
    assert_eq!(decoded.options.tool_choice.as_ref(), Some(&body["options"]["toolChoice"]));
    let roundtrip = serde_json::to_value(&decoded).unwrap();
    assert_eq!(roundtrip["options"]["toolChoice"], body["options"]["toolChoice"]);
    let restored: UnifiedRequest = serde_json::from_value(roundtrip).unwrap();
    assert_eq!(restored, decoded);
    for choice in ["auto", "none", "required"] {
        body["options"]["toolChoice"] = json!(choice);
        assert_eq!(
            decode(&body).unwrap().options.tool_choice.as_ref().and_then(serde_json::Value::as_str),
            Some(choice)
        );
    }
}

#[test]
fn absent_options_and_null_optional_fields_use_defaults() {
    let minimal = json!({"model":"test-model","context":{"messages":[]}});
    assert_eq!(decode(&minimal).unwrap().options, DecodedOptions::default());
    let mut body = minimal;
    body["options"] = json!({"maxTokens":null,"temperature":null,"reasoning":null,"sessionId":null,"toolChoice":null});
    assert_eq!(decode(&body).unwrap().options, DecodedOptions::default());
}

#[test]
fn extracts_bearer_key_and_body_session_for_request_info() {
    let decoded = decode_request(
        &request(),
        &WireHeaders {
            authorization: Some("Bearer mock-key"),
        },
    )
    .unwrap();
    assert_eq!(decoded.info.key_id, "mock-key");
    assert_eq!(decoded.info.api, "pi-messages");
    assert_eq!(decoded.info.model, decoded.request.model);
    assert_eq!(decoded.info.options, decoded.request.options);
    assert_eq!(decoded.info.session_signal.as_deref(), Some("session-1"));
    let mut body = request();
    body["options"].as_object_mut().unwrap().remove("sessionId");
    assert_eq!(
        decode_request(
            &body,
            &WireHeaders {
                authorization: Some("Bearer mock-key")
            }
        )
        .unwrap()
        .info
        .session_signal,
        None
    );
}

#[test]
fn rejects_missing_bearer_and_invalid_unified_messages() {
    for authorization in [
        None,
        Some("Basic mock-key"),
        Some("Bearer "),
        Some("mock-key"),
    ] {
        assert!(decode_request(&request(), &WireHeaders { authorization }).is_err());
    }
    for body in [
        json!({}),
        json!({"model":"x","context":{}}),
        json!({"model":"x","context":{"messages":[{"role":"user","content":"no timestamp"}]}}),
        json!({"model":"x","context":{"messages":[{"role":"unknown","timestamp":1}]}}),
    ] {
        assert!(decode(&body).is_err());
    }
}
