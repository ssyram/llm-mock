use super::decode::decode_request;
use crate::model::{Message, SystemContent, UserBlock};
use serde_json::json;

#[test]
fn tool_results_preserve_data_url_images_and_text_without_guessing_error() {
    for content in [
        json!([{"type":"text","text":"[tool error] before"},{"type":"image_url","image_url":"data:image/png;base64,AQID"},{"type":"text","text":"after"}]),
        json!([{"type":"image_url","image_url":{"url":"data:image/png;base64,AQID"}}]),
        json!("text only"),
    ] {
        let (request, _) = decode_request(
            &json!({"model":"m","messages":[{
                "role":"tool","tool_call_id":"call","name":"lookup","content":content
            }]}),
            &[],
        )
        .unwrap();
        let Message::ToolResult(result) = &request.context.messages[0] else {
            panic!("tool result")
        };
        assert_eq!(result.tool_call_id, "call");
        assert_eq!(result.tool_name, "lookup");
        assert!(!result.is_error);
        if content.is_string() {
            assert!(
                matches!(result.content.as_slice(), [UserBlock::Text(t)] if t.text == "text only")
            );
        } else {
            assert_eq!(result.content.len(), content.as_array().unwrap().len());
            let image = result
                .content
                .iter()
                .find_map(|b| match b {
                    UserBlock::Image(i) => Some(i),
                    _ => None,
                })
                .unwrap();
            assert_eq!(image.data, "AQID");
            assert_eq!(image.mime_type, "image/png");
            if result.content.len() == 3 {
                assert!(
                    matches!(&result.content[0], UserBlock::Text(t) if t.text == "[tool error] before")
                );
                assert!(matches!(&result.content[2], UserBlock::Text(t) if t.text == "after"));
            }
        }
    }
}

#[test]
fn tools_attach_to_existing_or_synthesized_leading_system_in_order() {
    let tools = json!([
        {"type":"function","function":{"name":"z","description":"first","parameters":{"type":"object","properties":{"x":{"type":"string"}}}}},
        {"type":"function","function":{"name":"a","description":"second","parameters":{"type":"object"}}}
    ]);
    for messages in [
        json!([]),
        json!([{"role":"user","content":"hello"}]),
        json!([{"role":"system","content":"guide"},{"role":"user","content":"hello"}]),
    ] {
        let (request, _) =
            decode_request(&json!({"model":"m","messages":messages,"tools":tools}), &[]).unwrap();
        let Message::System(system) = &request.context.messages[0] else {
            panic!("system")
        };
        let recovered = system.tools_added.as_ref().unwrap();
        assert_eq!(
            recovered
                .iter()
                .map(|t| t.name.as_str())
                .collect::<Vec<_>>(),
            ["z", "a"]
        );
        assert_eq!(recovered[0].parameters, tools[0]["function"]["parameters"]);
        assert_eq!(recovered[0].description, "first");
        let had_system = messages[0]["role"] == "system";
        assert_eq!(
            system.content,
            SystemContent::Text(if had_system { "guide" } else { "" }.into())
        );
        assert_eq!(
            request.context.messages.len(),
            messages.as_array().unwrap().len() + usize::from(!had_system)
        );
    }
    let (request, _) = decode_request(&json!({"model":"m","messages":[],"tools":[]}), &[]).unwrap();
    assert!(request.context.messages.is_empty());
}

#[test]
fn tool_result_rejects_non_data_url_image() {
    assert!(decode_request(&json!({"model":"m","messages":[{
        "role":"tool","content":[{"type":"image_url","image_url":"https://invalid.example/image.png"}]
    }]}), &[]).is_err());
}

#[test]
fn assistant_preserves_sent_empty_text_and_thinking_chunks_in_order() {
    let (request, _) = decode_request(&json!({"model":"m","messages":[{
        "role":"assistant","content":[
            {"type":"text","text":""},
            {"type":"thinking","thinking":[{"type":"text","text":""}]},
            {"type":"text","text":"ax"}
        ]
    }]}), &[]).unwrap();
    let Message::Assistant(message) = &request.context.messages[0] else { panic!("assistant") };
    assert_eq!(serde_json::to_value(&message.content).unwrap(), json!([
        {"type":"text","text":""}, {"type":"thinking","thinking":""}, {"type":"text","text":"ax"}
    ]));
}
