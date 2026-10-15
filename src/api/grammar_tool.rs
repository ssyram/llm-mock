use serde::Deserialize;
use serde_json::json;

use crate::model::Tool;

#[derive(Deserialize)]
pub struct WireGrammar {
    pub syntax: String,
    pub definition: String,
}

pub fn decode_grammar_tool(
    name: &str,
    description: &str,
    syntax: &str,
    definition: &str,
) -> Result<Tool, String> {
    let variant = match syntax {
        "lark" => "openai_lark",
        "regex" => "openai_regex",
        _ => return Err(format!("unsupported grammar syntax: {syntax}")),
    };
    Ok(Tool {
        name: name.to_owned(),
        description: description.to_owned(),
        parameters: json!({}),
        constrained_sampling: Some(json!({
            "type": "grammar", "variants": {variant: definition}
        })),
    })
}
