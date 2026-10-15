use super::encode::encode_response;
use crate::{
    api::openai_responses,
    model::{AssistantMessage, Usage},
};
use serde_json::{json, Value};

#[test]
fn end_turn_is_codex_only_optional_boolean_on_completed_and_incomplete() {
    for stop in ["stop", "toolUse", "length", "error"] {
        for end_turn in [Some(true), Some(false), None] {
            let mut message: AssistantMessage = serde_json::from_value(json!({
                "content":[{"type":"text","text":"answer"}],
                "api":"openai-codex-responses","provider":"openai-codex","model":"m",
                "usage":Usage::default(),"stopReason":stop,"timestamp":0
            }))
            .unwrap();
            message.end_turn = end_turn;
            let codex = encode_response(&message).unwrap();
            let root = openai_responses::encode::encode_response(&message).unwrap();
            assert_eq!(&codex[..codex.len() - 1], &root[..root.len() - 1]);
            let event = parse(codex.last().unwrap());
            let root_event = parse(root.last().unwrap());
            assert!(root_event["response"].get("end_turn").is_none());
            let recovered = event["response"].get("end_turn").and_then(Value::as_bool);
            assert_eq!(recovered, if stop == "error" { None } else { end_turn });
            let mut expected = root_event;
            if stop != "error" {
                if let Some(value) = end_turn {
                    expected["response"]["end_turn"] = json!(value);
                }
            }
            assert_eq!(event, expected);
        }
    }
}

fn parse(frame: &str) -> Value {
    serde_json::from_str(frame.trim().strip_prefix("data: ").unwrap()).unwrap()
}
