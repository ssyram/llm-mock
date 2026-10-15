use serde_json::json;

use crate::model::{
    ContentBlock, ImageContent, Message, SystemContent, TextContent, UserBlock, UserContent,
};

use super::decode::{decode_request, decode_request_info};

const PATH: &str = "/v1beta/models/gemini-3-pro-preview:streamGenerateContent?alt=sse";

// wire shapes follow the SDK mldev split (systemInstruction/tools/toolConfig at
// the root, sampling under generationConfig); content from
// pi-mono/packages/ai/test/google-thinking-level-map.test.ts,
// google-shared-convert-tools.test.ts, google-raw-stop-reason.test.ts.
#[test]
fn decodes_system_tools_user_and_options() {
    let body = json!({
        "contents": [{"role": "user", "parts": [{"text": "hello"}]}],
        "systemInstruction": {"role": "user", "parts": [{"text": "You are helpful"}]},
        "tools": [{"functionDeclarations": [{
            "name": "test_tool",
            "description": "A test tool",
            "parametersJsonSchema": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            },
        }]}],
        "generationConfig": {
            "temperature": 0.5,
            "maxOutputTokens": 320,
            "thinkingConfig": {"includeThoughts": true, "thinkingLevel": "HIGH"},
        },
        "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
    });
    let request = decode_request(PATH, &body).unwrap();
    assert_eq!(request.model, "gemini-3-pro-preview");
    let Message::System(system) = &request.context.messages[0] else { panic!("system") };
    assert_eq!(system.content, SystemContent::Text("You are helpful".into()));
    let tools = system.tools_added.as_ref().unwrap();
    assert_eq!(tools.len(), 1);
    assert_eq!((tools[0].name.as_str(), tools[0].description.as_str()), ("test_tool", "A test tool"));
    assert_eq!(
        tools[0].parameters,
        json!({"type":"object","properties":{"command":{"type":"string"}},"required":["command"]})
    );
    let Message::User(user) = &request.context.messages[1] else { panic!("user") };
    assert_eq!(user.content, UserContent::Text("hello".into()));
    let options = &request.options;
    assert_eq!(options.temperature, Some(0.5));
    assert_eq!(options.max_tokens, Some(320));
    assert_eq!(options.tool_choice.as_ref().and_then(serde_json::Value::as_str), Some("auto"));
    assert_eq!(options.reasoning.as_deref(), Some("high"));
    assert_eq!(options.session_id, None);
}

#[test]
fn decodes_thinking_budget_variants() {
    let body = json!({
        "contents": [{"role": "user", "parts": [{"text": "hi"}]}],
        "generationConfig": {"thinkingConfig": {"thinkingBudget": 0}},
    });
    assert_eq!(decode_request(PATH, &body).unwrap().options.reasoning.as_deref(), Some("off"));
    let body = json!({
        "contents": [{"role": "user", "parts": [{"text": "hi"}]}],
        "generationConfig": {"thinkingConfig": {"includeThoughts": true, "thinkingBudget": 1234}},
    });
    assert_eq!(
        decode_request(PATH, &body).unwrap().options.reasoning.as_deref(),
        Some("budget:1234"),
    );
}

// contents from google-shared-gemini3-unsigned-tool-call.test.ts makeContext
#[test]
fn decodes_gemini3_tool_round_trip_with_ids() {
    let body = json!({
        "contents": [
            {"role": "user", "parts": [{"text": "Hi"}]},
            {"role": "model", "parts": [
                {"functionCall": {"id": "call_1", "name": "bash", "args": {"command": "echo hi"}}},
                {"functionCall": {"id": "call_2", "name": "bash", "args": {"command": "ls -la"}}},
            ]},
            {"role": "user", "parts": [
                {"functionResponse": {"id": "call_1", "name": "bash", "response": {"output": "hi"}}},
                {"functionResponse": {"id": "call_2", "name": "bash", "response": {"output": "files"}}},
            ]},
        ],
    });
    let messages = &decode_request(PATH, &body).unwrap().context.messages;
    assert_eq!(messages.len(), 4);
    let Message::Assistant(assistant) = &messages[1] else { panic!("assistant") };
    let [ContentBlock::ToolCall(a), ContentBlock::ToolCall(b)] = &assistant.content[..] else {
        panic!("two tool calls");
    };
    assert_eq!((a.id.as_str(), a.name.as_str()), ("call_1", "bash"));
    assert_eq!(a.arguments.get("command"), Some(&json!("echo hi")));
    assert_eq!((b.id.as_str(), b.name.as_str()), ("call_2", "bash"));
    let Message::ToolResult(first) = &messages[2] else { panic!("tool result") };
    assert_eq!(
        (first.tool_call_id.as_str(), first.tool_name.as_str(), first.content.len(), first.is_error),
        ("call_1", "bash", 1, false)
    );
    let Message::ToolResult(second) = &messages[3] else { panic!("tool result") };
    assert_eq!(second.tool_call_id, "call_2");
    assert_eq!(
        second.content,
        vec![UserBlock::Text(TextContent { text: "files".into(), text_signature: None })]
    );
}

// same fixture minus ids (gemini-2.5 models, requiresToolCallId = false)
#[test]
fn decodes_id_less_tool_calls_by_name() {
    let body = json!({
        "contents": [
            {"role": "model", "parts": [{"functionCall": {"name": "bash", "args": {"command": "ls"}}}]},
            {"role": "user", "parts": [{"functionResponse": {"name": "bash", "response": {"error": "boom"}}}]},
        ],
    });
    let messages = &decode_request(PATH, &body).unwrap().context.messages;
    let Message::Assistant(assistant) = &messages[0] else { panic!("assistant") };
    let ContentBlock::ToolCall(call) = &assistant.content[0] else { panic!("tool call") };
    assert_eq!(call.id, "bash");
    let Message::ToolResult(result) = &messages[1] else { panic!("tool result") };
    assert_eq!((result.tool_call_id.as_str(), result.is_error), ("bash", true));
    assert_eq!(
        result.content,
        vec![UserBlock::Text(TextContent { text: "boom".into(), text_signature: None })]
    );
}

// contents from google-shared-image-tool-result-routing.test.ts
#[test]
fn decodes_image_tool_results_both_routings() {
    let nested = json!({
        "contents": [
            {"role": "user", "parts": [{"functionResponse": {
                "name": "read", "id": "call_img",
                "response": {"output": "(see attached image)"},
                "parts": [{"inlineData": {"mimeType": "image/png", "data": "abc"}}],
            }}]},
        ],
    });
    let messages = &decode_request(PATH, &nested).unwrap().context.messages;
    let Message::ToolResult(result) = &messages[0] else { panic!("tool result") };
    assert_eq!(
        result.content,
        vec![
            UserBlock::Text(TextContent { text: "(see attached image)".into(), text_signature: None }),
            UserBlock::Image(ImageContent { data: "abc".into(), mime_type: "image/png".into() }),
        ]
    );
    let synthetic = json!({
        "contents": [{"role": "user", "parts": [
            {"text": "Tool result image:"},
            {"inlineData": {"mimeType": "image/png", "data": "abc"}},
        ]}],
    });
    let messages = &decode_request(PATH, &synthetic).unwrap().context.messages;
    let Message::User(user) = &messages[0] else { panic!("user") };
    assert_eq!(
        user.content,
        UserContent::Blocks(vec![
            UserBlock::Text(TextContent { text: "Tool result image:".into(), text_signature: None }),
            UserBlock::Image(ImageContent { data: "abc".into(), mime_type: "image/png".into() }),
        ])
    );
}

// parts from google-shared-signed-empty-blocks.test.ts
#[test]
fn decodes_signed_empty_model_parts() {
    let sig = "AAAAAAAAAAAAAAAAAAAAAA==";
    let body = json!({
        "contents": [{"role": "model", "parts": [
            {"thought": true, "text": "", "thoughtSignature": sig},
            {"text": "", "thoughtSignature": sig},
            {"functionCall": {"id": "call_1", "name": "bash", "args": {"command": "ls"}}},
        ]}],
    });
    let messages = &decode_request(PATH, &body).unwrap().context.messages;
    let Message::Assistant(assistant) = &messages[0] else { panic!("assistant") };
    let [ContentBlock::Thinking(t), ContentBlock::Text(x), ContentBlock::ToolCall(_)] =
        &assistant.content[..]
    else {
        panic!("three blocks");
    };
    assert_eq!(
        (t.thinking.as_str(), t.thinking_signature.as_deref()),
        ("", Some("AAAAAAAAAAAAAAAAAAAAAA=="))
    );
    assert_eq!(
        (x.text.as_str(), x.text_signature.as_deref()),
        ("", Some("AAAAAAAAAAAAAAAAAAAAAA=="))
    );
}

#[test]
fn decodes_model_from_path_and_request_info() {
    let body = json!({"contents": [{"role": "user", "parts": [{"text": "hello"}]}]});
    let request = decode_request("models/gemini-2.5-flash:generateContent", &body).unwrap();
    assert_eq!(request.model, "gemini-2.5-flash");
    assert!(decode_request("/v1beta/models/:streamGenerateContent", &body).is_err());
    let info = decode_request_info(PATH, Some("test-api-key"), &body).unwrap();
    assert_eq!((info.api.as_str(), info.key_id.as_str(), info.session_signal.as_deref()), ("google-generative-ai", "test-api-key", None));
}
