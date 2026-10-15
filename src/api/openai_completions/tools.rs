use serde_json::{Map, Value};

use crate::api::grammar_tool::decode_grammar_tool;

use crate::model::*;

use super::vendor::*;

pub fn decode_tools(wire: &[WireTool]) -> Result<Vec<Tool>, String> {
    let mut tools = Vec::new();
    for tool in wire {
        if let Some(f) = &tool.function {
            tools.push(Tool {
                name: f.name.clone(),
                description: f.description.clone(),
                parameters: f.parameters.clone().unwrap_or(Value::Object(Map::new())),
                constrained_sampling: None,
            });
        } else if let Some(c) = &tool.custom {
            if let Some(g) = c.format.as_ref().and_then(|f| f.grammar.as_ref()) {
                if let (Some(syntax), Some(definition)) = (g.syntax.clone(), g.definition.clone()) {
                    tools.push(decode_grammar_tool(&c.name, &c.description, &syntax, &definition)?);
                }
            }
        }
    }
    Ok(tools)
}

pub fn grammar_input_property(tools: &[Tool], name: &str) -> String {
    let Some(tool) = tools.iter().find(|t| t.name == name) else { return "input".into() };
    let Some(required) = tool.parameters.get("required").and_then(Value::as_array) else {
        return "input".into();
    };
    let property = required.first().and_then(Value::as_str);
    let is_string = property
        .and_then(|p| tool.parameters.pointer(&format!("/properties/{p}")))
        .and_then(|p| p.get("type"))
        .and_then(Value::as_str)
        == Some("string");
    match (property, required.len() == 1 && is_string) {
        (Some(p), true) => p.to_string(),
        _ => "input".into(),
    }
}

pub fn attach_tools(messages: &mut Vec<Message>, tools: Vec<Tool>) {
    if tools.is_empty() {
        return;
    }
    for msg in messages.iter_mut() {
        if let Message::System(system) = msg {
            let existing = system.tools_added.take().unwrap_or_default();
            system.tools_added = Some([existing, tools].concat());
            return;
        }
    }
    messages.insert(
        0,
        Message::System(SystemMessage {
            content: SystemContent::Text(String::new()),
            sections: None,
            tools_added: Some(tools),
            tools_removed: None,
            timestamp: 0,
        }),
    );
}
