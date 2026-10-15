use std::borrow::Cow;

use serde_json::Value;

use crate::model::{ContentBlock, TextContent};

pub(crate) const REASONING_FIELDS: [&str; 3] = ["reasoning_content", "reasoning", "reasoning_text"];
const DETAIL_TYPES: [&str; 3] = ["reasoning.summary", "reasoning.encrypted", "reasoning.text"];

#[derive(Clone, Copy)]
pub(crate) enum SignatureDomain {
    ReasoningItem,
    CompletionDetails,
    Unsigned,
    Opaque,
}

pub(crate) fn completion_details(signature: &str) -> Option<Value> {
    let value: Value = serde_json::from_str(signature).ok()?;
    let details = value.as_array()?;
    details
        .iter()
        .all(|detail| {
            detail
                .get("type")
                .and_then(Value::as_str)
                .is_some_and(|kind| DETAIL_TYPES.contains(&kind))
        })
        .then_some(value)
}

fn supports(domain: SignatureDomain, signature: &str) -> bool {
    match domain {
        SignatureDomain::ReasoningItem => serde_json::from_str::<Value>(signature)
            .ok()
            .is_some_and(|item| item.get("type").and_then(Value::as_str) == Some("reasoning")),
        SignatureDomain::CompletionDetails => {
            REASONING_FIELDS.contains(&signature) || completion_details(signature).is_some()
        }
        SignatureDomain::Unsigned => false,
        SignatureDomain::Opaque => true,
    }
}

/// Only target signature domains are checked here; source identity conversion belongs to pi's request-side TM.
/// AM, Google, Bedrock and PM accept opaque signatures; they must not lose them through this projection.
pub(crate) fn project_content(
    content: &[ContentBlock],
    domain: SignatureDomain,
) -> Cow<'_, [ContentBlock]> {
    let unsupported = |block: &ContentBlock| match block {
        ContentBlock::Thinking(thinking) => thinking
            .thinking_signature
            .as_deref()
            .is_some_and(|signature| !supports(domain, signature)),
        _ => false,
    };
    if !content.iter().any(unsupported) {
        return Cow::Borrowed(content);
    }
    Cow::Owned(
        content
            .iter()
            .filter_map(|block| {
                if !unsupported(block) {
                    return Some(block.clone());
                }
                let ContentBlock::Thinking(thinking) = block else {
                    unreachable!()
                };
                // Match JavaScript trim: BOM is blank, but NEL is visible.
                let blank = thinking.thinking.chars().all(|ch| {
                    matches!(ch,
                        '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' |
                        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
                        '\u{205f}' | '\u{3000}' | '\u{feff}'
                    )
                });
                if thinking.redacted == Some(true) || blank {
                    None
                } else {
                    Some(ContentBlock::Text(TextContent {
                        text: thinking.thinking.clone(),
                        text_signature: None,
                    }))
                }
            })
            .collect(),
    )
}

#[cfg(test)]
#[path = "encode_thinking_tests.rs"]
mod tests;
