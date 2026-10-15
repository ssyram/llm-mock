use serde_json::{Map, Value};

use crate::model::*;

use super::tools::{attach_tools, decode_tools, grammar_input_property};
use super::vendor::*;

pub fn decode(body: &Value, session_header: Option<&str>) -> Result<UnifiedRequest, String> {
    let wire: WireRequest =
        serde_json::from_value(body.clone()).map_err(|e| format!("invalid openai-completions request: {e}"))?;
    let tools = decode_tools(wire.tools.as_deref().unwrap_or_default())?;
    let mut messages = Vec::new();
    for msg in &wire.messages {
        match msg {
            WireMessage::System(m) => messages.push(Message::System(decode_system(m)?)),
            WireMessage::User(m) => {
                if let Some(u) = decode_user(m)? {
                    messages.push(Message::User(u));
                }
            }
            WireMessage::Assistant(m) => {
                if let Some(a) = decode_assistant(m, &wire.model, &tools)? {
                    messages.push(Message::Assistant(a));
                }
            }
            WireMessage::Tool(m) => messages.push(Message::ToolResult(decode_tool_result(m))),
        }
    }
    attach_tools(&mut messages, tools);
    Ok(UnifiedRequest {
        model: wire.model,
        context: TranscriptContext { messages },
        options: DecodedOptions {
            max_tokens: wire.max_completion_tokens.or(wire.max_tokens),
            temperature: wire.temperature,
            session_id: wire.prompt_cache_key.clone().or_else(|| session_header.map(str::to_string)),
            tool_choice: wire.tool_choice,
            reasoning: wire
                .reasoning_effort
                .clone()
                .or_else(|| effort_of(&wire.reasoning))
                .or_else(|| wire.thinking.as_ref().and_then(Value::as_str).map(str::to_string)),
        },
    })
}

fn effort_of(reasoning: &Option<Value>) -> Option<String> {
    reasoning.as_ref()?.get("effort")?.as_str().map(str::to_string)
}

fn join_parts(content: &WireTextContent, sep: &str) -> String {
    match content {
        WireTextContent::Plain(s) => s.clone(),
        WireTextContent::Parts(parts) => parts.iter().map(|p| p.text.as_str()).collect::<Vec<_>>().join(sep),
        WireTextContent::Empty => String::new(),
    }
}

fn text_block(text: String) -> TextContent {
    TextContent { text, text_signature: None }
}

fn decode_system(m: &WireSystem) -> Result<SystemMessage, String> {
    Ok(SystemMessage {
        content: SystemContent::Text(join_parts(&m.content, "")),
        sections: None,
        tools_added: m.tools.as_deref().map(decode_tools).transpose()?,
        tools_removed: None,
        timestamp: 0,
    })
}

fn decode_user(m: &WireUser) -> Result<Option<UserMessage>, String> {
    let content = match &m.content {
        WireUserContent::Plain(s) => UserContent::Text(s.clone()),
        WireUserContent::Empty => return Ok(None),
        WireUserContent::Parts(parts) => {
            let mut blocks = Vec::new();
            for part in parts {
                match part {
                    WireUserPart::Text { text } => blocks.push(UserBlock::Text(text_block(text.clone()))),
                    WireUserPart::ImageUrl { image_url } => blocks.push(UserBlock::Image(decode_image(&image_url.url)?)),
                }
            }
            if blocks.is_empty() {
                return Ok(None);
            }
            UserContent::Blocks(blocks)
        }
    };
    Ok(Some(UserMessage { content, timestamp: 0 }))
}

fn decode_image(url: &str) -> Result<ImageContent, String> {
    let rest = url.strip_prefix("data:").ok_or_else(|| format!("non-data image url: {url}"))?;
    let (mime, data) = rest.split_once(";base64,").ok_or_else(|| format!("malformed data url: {url}"))?;
    Ok(ImageContent { mime_type: mime.to_string(), data: data.to_string() })
}

fn decode_assistant(m: &WireAssistant, model: &str, tools: &[Tool]) -> Result<Option<AssistantMessage>, String> {
    let mut content: Vec<ContentBlock> = Vec::new();
    let reasoning_field = ["reasoning_content", "reasoning", "reasoning_text"]
        .iter()
        .find_map(|field| {
            let value = match *field {
                "reasoning_content" => &m.reasoning_content,
                "reasoning" => &m.reasoning,
                _ => &m.reasoning_text,
            };
            value.as_ref().map(|v| (*field, v.clone()))
        });
    match (m.reasoning_details.as_ref().filter(|v| v.is_array()), reasoning_field) {
        (Some(details), field) => content.push(ContentBlock::Thinking(ThinkingContent {
            thinking: field.map(|(_, v)| v).unwrap_or_default(),
            thinking_signature: Some(details.to_string()),
            redacted: None,
        })),
        (None, Some((field, value))) => content.push(ContentBlock::Thinking(ThinkingContent {
            thinking: value,
            thinking_signature: Some(field.to_string()),
            redacted: None,
        })),
        (None, None) => {}
    }
    let text = join_parts(&m.content, "\n\n");
    if !text.is_empty() {
        content.push(ContentBlock::Text(text_block(text)));
    }
    for call in m.tool_calls.as_deref().unwrap_or_default() {
        if let Some(f) = &call.function {
            let arguments = parse_arguments(f.arguments.as_deref().unwrap_or("{}"))?;
            content.push(ContentBlock::ToolCall(ToolCall {
                id: call.id.clone(),
                name: f.name.clone(),
                arguments,
                thought_signature: None,
                namespace: None,
            }));
        } else if let Some(c) = &call.custom {
            let property = grammar_input_property(tools, &c.name);
            let arguments = Map::from_iter([(property, Value::String(c.input.clone()))]);
            content.push(ContentBlock::ToolCall(ToolCall {
                id: call.id.clone(),
                name: c.name.clone(),
                arguments,
                thought_signature: None,
                namespace: None,
            }));
        }
    }
    if content.is_empty() {
        return Ok(None);
    }
    Ok(Some(AssistantMessage {
        content,
        api: "openai-completions".to_string(),
        provider: String::new(),
        model: model.to_string(),
        usage: Usage::default(),
        stop_reason: StopReason::Stop,
        response_model: None,
        response_id: None,
        provider_thinking_level: None,
        thinking_level: None,
        error_message: None,
        raw_stop_reason: None,
        end_turn: None,
        timestamp: 0,
        duration_ms: None,
    }))
}

fn parse_arguments(raw: &str) -> Result<Map<String, Value>, String> {
    serde_json::from_str(raw).map_err(|e| format!("invalid tool_call arguments: {e}"))
}

fn decode_tool_result(m: &WireToolResult) -> ToolResultMessage {
    ToolResultMessage {
        tool_call_id: m.tool_call_id.clone(),
        tool_name: m.name.clone().unwrap_or_default(),
        content: vec![UserBlock::Text(text_block(join_parts(&m.content, "\n\n")))],
        is_error: false,
        timestamp: 0,
        duration_ms: None,
    }
}
