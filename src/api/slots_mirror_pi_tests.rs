use serde_json::{json, Value};

use crate::model::{Message, Tool, UnifiedRequest};

fn tools(request: &UnifiedRequest) -> &[Tool] {
    let Message::System(system) = &request.context.messages[0] else {
        panic!("system with decoded tools")
    };
    system.tools_added.as_deref().unwrap()
}

#[test]
fn openai_grammar_variants_share_one_decoder() {
    let headers = vec![("Authorization".into(), "Bearer slots".into())];
    for (syntax, variant, definition) in [
        ("lark", "openai_lark", "start: /[a-z]+/"),
        ("regex", "openai_regex", "[a-z]+"),
    ] {
        let format = json!({"type": "grammar", "syntax": syntax, "definition": definition});
        let responses = json!({"model": "m", "input": [], "tools": [{
            "type": "custom", "name": "parse", "description": "Parse text", "format": format
        }]});
        let completions = json!({"model": "m", "messages": [], "tools": [{
            "type": "custom", "custom": {"name": "parse", "description": "Parse text",
                "format": {"type": "grammar", "grammar": {"syntax": syntax, "definition": definition}}}
        }]});
        let occ = super::openai_completions::decode::decode(&completions, None).unwrap();
        let ores = super::openai_responses::decode::decode_request(&responses.to_string(), &headers).unwrap().0;
        assert_eq!(tools(&occ), tools(&ores));
        assert_eq!(tools(&ores)[0].parameters, json!({}));
        assert_eq!(tools(&ores)[0].constrained_sampling, Some(json!({
            "type": "grammar", "variants": {variant: definition}
        })));
        let azure_headers = vec![("api-key".into(), "slots".into())];
        let azure = super::azure_openai_responses::decode::decode_request(&responses.to_string(), &azure_headers).unwrap().0;
        assert_eq!(tools(&ores), tools(&azure));
        let mut codex_body = responses.clone();
        codex_body["instructions"] = json!("");
        let codex = super::openai_codex_responses::decode::decode_request(&codex_body.to_string(), &headers).unwrap().0;
        assert_eq!(tools(&ores), tools(&codex));
    }
}

#[test]
fn openai_object_tool_choice_preserves_json_through_unified_serialization() {
    let headers = vec![("Authorization".into(), "Bearer slots".into())];
    for choice in [json!("none"), json!({"type": "function", "name": "parse"})] {
        let body = json!({"model": "m", "input": [], "tool_choice": choice});
        let (request, info) = super::openai_responses::decode::decode_request(&body.to_string(), &headers).unwrap();
        assert_eq!(request.options.tool_choice.as_ref(), Some(&choice));
        assert_eq!(info.options, request.options);
        let serialized = serde_json::to_value(&request).unwrap();
        assert_eq!(serialized["options"]["toolChoice"], choice);
        let restored: UnifiedRequest = serde_json::from_value(serialized).unwrap();
        assert_eq!(restored, request);
    }
}

#[test]
fn pi_messages_preserves_constrained_sampling_without_inventing_sampling_options() {
    for config in [
        json!({"type": "json_schema", "strict": "prefer"}),
        json!({"type": "json_schema", "strict": "require"}),
        json!({"type": "grammar", "variants": {"openai_lark": "start: /x/", "openai_regex": "x"}}),
        json!(false),
    ] {
        let body = json!({"model": "m", "context": {"messages": [{
            "role": "system", "content": "", "timestamp": 1,
            "toolsAdded": [{"name": "parse", "description": "", "parameters": {}, "constrainedSampling": config}]
        }]}, "options": {"samplingParams": {"top_p": 0.7}}});
        let request = super::pi_messages::decode::decode(&body).unwrap();
        assert_eq!(tools(&request)[0].constrained_sampling.as_ref(), Some(&config));
        let serialized = serde_json::to_value(&request.options).unwrap();
        assert_eq!(serialized.get("samplingParams"), None);
    }
}

#[test]
fn unsupported_grammar_syntax_is_rejected_not_renamed() {
    assert!(super::grammar_tool::decode_grammar_tool("parse", "", "unknown", "x").is_err());
}

#[test]
fn native_named_tool_choices_remain_objects() {
    let choice = json!({"type": "tool", "name": "parse"});
    let anthropic = json!({"model": "m", "max_tokens": 16, "messages": [], "tool_choice": choice});
    let headers = super::anthropic_messages::WireHeaders {
        x_api_key: Some("slots"), authorization: None, x_session_affinity: None, x_session_id: None,
    };
    let request = super::anthropic_messages::decode_request(&anthropic, &headers).unwrap().request;
    assert_eq!(request.options.tool_choice.as_ref(), Some(&choice));
    let body = json!({"model": "m", "messages": [], "tool_choice": {"type": "function", "function": {"name": "parse"}}});
    let request = super::mistral_conversations::decode::decode_request(&body, &[]).unwrap().0;
    assert_eq!(request.options.tool_choice.as_ref(), body.get("tool_choice"));
    let absent = serde_json::to_value(crate::model::DecodedOptions::default()).unwrap();
    assert_eq!(absent.get("toolChoice"), None::<&Value>);
}
