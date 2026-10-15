use super::*;
use crate::model::ThinkingContent;

fn thinking(text: &str, signature: Option<&str>, redacted: bool) -> ContentBlock {
    ContentBlock::Thinking(ThinkingContent {
        thinking: text.into(),
        thinking_signature: signature.map(str::to_owned),
        redacted: redacted.then_some(true),
    })
}

#[test]
fn unsupported_signatures_become_text_or_disappear_without_mutation() {
    let content = vec![
        thinking(" reason ", Some("reasoning_content"), false),
        thinking(" \n", Some("opaque"), false),
        thinking("\u{feff}", Some("opaque"), false),
        thinking("\u{0085}", Some("opaque"), false),
        thinking("secret", Some("opaque"), true),
        thinking("unsigned", None, false),
    ];
    let original = content.clone();
    let out = project_content(&content, SignatureDomain::ReasoningItem);
    assert_eq!(
        out.as_ref(),
        &[
            ContentBlock::Text(TextContent {
                text: " reason ".into(),
                text_signature: None
            }),
            ContentBlock::Text(TextContent {
                text: "\u{0085}".into(),
                text_signature: None
            }),
            thinking("unsigned", None, false),
        ]
    );
    assert_eq!(content, original);
    assert_eq!(
        project_content(out.as_ref(), SignatureDomain::ReasoningItem).as_ref(),
        out.as_ref()
    );
}

#[test]
fn native_signature_domains_are_preserved() {
    let item = vec![thinking(
        "",
        Some(r#"{"type":"reasoning","encrypted_content":"opaque"}"#),
        false,
    )];
    assert_eq!(
        project_content(&item, SignatureDomain::ReasoningItem).as_ref(),
        item
    );
    let details = vec![thinking(
        "reason",
        Some(r#"[{"type":"reasoning.text","text":"reason"}]"#),
        false,
    )];
    assert_eq!(
        project_content(&details, SignatureDomain::CompletionDetails).as_ref(),
        details
    );
    for field in REASONING_FIELDS {
        let content = vec![thinking("reason", Some(field), false)];
        assert_eq!(
            project_content(&content, SignatureDomain::CompletionDetails).as_ref(),
            content
        );
    }
    let opaque = vec![thinking("", Some("opaque"), true)];
    assert_eq!(
        project_content(&opaque, SignatureDomain::Opaque).as_ref(),
        opaque
    );
}

#[test]
fn invalid_json_domains_and_unsigned_targets_downgrade() {
    for signature in ["opaque", "null", r#"{"type":"message"}"#, ""] {
        let content = vec![thinking("reason", Some(signature), false)];
        for domain in [
            SignatureDomain::ReasoningItem,
            SignatureDomain::CompletionDetails,
            SignatureDomain::Unsigned,
        ] {
            assert_eq!(
                project_content(&content, domain).as_ref(),
                &[ContentBlock::Text(TextContent {
                    text: "reason".into(),
                    text_signature: None,
                })]
            );
        }
    }
}

#[test]
fn responses_family_encoders_share_projection_including_codex_wrapper() {
    use crate::api::{azure_openai_responses, openai_codex_responses, openai_responses};
    use crate::model::{AssistantMessage, Usage};
    let message: AssistantMessage = serde_json::from_value(serde_json::json!({
        "content": [
            {"type":"thinking","thinking":"secret","thinkingSignature":"opaque","redacted":true},
            {"type":"thinking","thinking":"reason","thinkingSignature":"opaque"}
        ],
        "api":"foreign","provider":"foreign","model":"foreign",
        "usage":Usage::default(),"stopReason":"stop","timestamp":0
    }))
    .unwrap();
    let root = openai_responses::encode::encode_response(&message).unwrap();
    assert_eq!(
        azure_openai_responses::encode_response(&message).unwrap(),
        root
    );
    assert_eq!(
        openai_codex_responses::encode_response(&message).unwrap(),
        root
    );
    let events = root.join("");
    assert!(events.contains("output_text"));
    assert!(events.contains("msg_0"));
    assert!(!events.contains("reasoning"));
    assert!(!events.contains("opaque"));
    assert!(!events.contains("secret"));
}
