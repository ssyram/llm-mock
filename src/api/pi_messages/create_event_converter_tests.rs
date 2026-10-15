use serde_json::{json, Value};

use super::encode::encode;
use super::test_fixture::{assistant, event};
use crate::model::{ContentBlock, StopReason};

#[test]
fn pi_event_converter_replay_preserves_supported_content() {
    let message = assistant(StopReason::Stop);
    let events: Vec<Value> = encode(&message)
        .unwrap()
        .iter()
        .map(|frame| event(frame))
        .collect();
    let mut content: Vec<Value> = Vec::new();
    let mut tool_json = String::new();
    for event in events {
        let index = event["contentIndex"].as_u64().unwrap_or(0) as usize;
        match event["type"].as_str().unwrap() {
            "text_start" => content.push(json!({"type":"text","text":""})),
            "text_delta" => {
                let text = format!(
                    "{}{}",
                    content[index]["text"].as_str().unwrap(),
                    event["delta"].as_str().unwrap()
                );
                content[index]["text"] = json!(text);
            }
            "text_end" => {
                assert_eq!(content[index]["text"], event["content"]);
                content[index]["textSignature"] = event["contentSignature"].clone();
            }
            "thinking_start" => content.push(json!({"type":"thinking","thinking":""})),
            "thinking_delta" => content[index]["thinking"] = event["delta"].clone(),
            "thinking_end" => {
                assert_eq!(content[index]["thinking"], event["content"]);
                content[index]["thinkingSignature"] = event["contentSignature"].clone();
                content[index]["redacted"] = event["redacted"].clone();
            }
            "toolcall_start" => {
                tool_json.clear();
                content.push(json!({"type":"toolCall","id":event["id"],"name":event["toolName"],"arguments":{}}));
            }
            "toolcall_delta" => {
                tool_json.push_str(event["delta"].as_str().unwrap());
                content[index]["arguments"] = serde_json::from_str(&tool_json).unwrap();
            }
            "toolcall_end" => {
                assert_eq!(content[index]["arguments"], event["toolCall"]["arguments"]);
                content[index] = event["toolCall"].clone();
            }
            "done" => {
                assert_eq!(event["usage"], serde_json::to_value(message.usage).unwrap());
                assert_eq!(event["reason"], "stop");
            }
            "start" => {}
            other => panic!("unexpected event {other}"),
        }
    }
    let replayed: Vec<ContentBlock> = serde_json::from_value(json!(content)).unwrap();
    assert_eq!(replayed, message.content);
}
