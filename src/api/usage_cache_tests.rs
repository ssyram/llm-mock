use super::*;
use crate::model::{AssistantMessage, Usage};
use serde_json::{json, Value};

fn message() -> AssistantMessage {
    let usage = Usage {
        input: 11,
        output: 5,
        cache_read: 13,
        cache_write: 17,
        cache_write_1h: Some(7),
        reasoning: Some(2),
        total_tokens: 46,
        ..Usage::default()
    };
    serde_json::from_value(json!({
        "content": [], "api": "test", "provider": "test", "model": "test",
        "usage": usage, "stopReason": "stop", "timestamp": 0
    }))
    .unwrap()
}

fn payload(frame: &str) -> Value {
    let data = frame
        .lines()
        .find_map(|line| line.strip_prefix("data: "))
        .unwrap();
    serde_json::from_str(data).unwrap()
}

#[test]
fn openai_completions_usage_preserves_nonzero_cache_read_and_write() {
    let msg = message();
    let frames = openai_completions::encode::encode(&msg).unwrap();
    let chunk = payload(&frames[frames.len() - 2]);
    let usage = &chunk["usage"];
    assert_eq!(usage["prompt_tokens"], 41);
    assert_eq!(usage["completion_tokens"], 5);
    assert_eq!(usage["prompt_tokens_details"]["cached_tokens"], 13);
    assert_eq!(usage["prompt_tokens_details"]["cache_write_tokens"], 17);
    assert_eq!(usage["completion_tokens_details"]["reasoning_tokens"], 2);
    let input = usage["prompt_tokens"].as_u64().unwrap()
        - usage["prompt_tokens_details"]["cached_tokens"]
            .as_u64()
            .unwrap()
        - usage["prompt_tokens_details"]["cache_write_tokens"]
            .as_u64()
            .unwrap();
    assert_eq!(input, msg.usage.input);
}

#[test]
fn responses_variants_usage_preserves_nonzero_cache_read_and_write() {
    for stop in [
        crate::model::StopReason::Stop,
        crate::model::StopReason::Length,
    ] {
        let mut msg = message();
        msg.stop_reason = stop;
        for frames in [
            openai_responses::encode::encode_response(&msg).unwrap(),
            azure_openai_responses::encode_response(&msg).unwrap(),
            openai_codex_responses::encode_response(&msg).unwrap(),
        ] {
            let event = payload(frames.last().unwrap());
            let usage = &event["response"]["usage"];
            assert_eq!(usage["input_tokens"], 41);
            assert_eq!(usage["input_tokens_details"]["cached_tokens"], 13);
            assert_eq!(usage["input_tokens_details"]["cache_write_tokens"], 17);
            assert_eq!(usage["output_tokens"], 5);
            assert_eq!(usage["total_tokens"], 46);
            let input = usage["input_tokens"].as_u64().unwrap()
                - usage["input_tokens_details"]["cached_tokens"]
                    .as_u64()
                    .unwrap()
                - usage["input_tokens_details"]["cache_write_tokens"]
                    .as_u64()
                    .unwrap();
            assert_eq!(input, msg.usage.input);
        }
    }
}

#[test]
fn anthropic_usage_preserves_cache_read_write_and_one_hour_write() {
    let msg = message();
    let frames = anthropic_messages::encode_message(&msg).unwrap();
    let start = payload(&frames[0]);
    let delta = payload(&frames[frames.len() - 2]);
    for usage in [&start["message"]["usage"], &delta["usage"]] {
        assert_eq!(usage["input_tokens"], 11);
        assert_eq!(usage["output_tokens"], 5);
        assert_eq!(usage["cache_read_input_tokens"], 13);
        assert_eq!(usage["cache_creation_input_tokens"], 17);
        assert_eq!(usage["cache_creation"]["ephemeral_1h_input_tokens"], 7);
    }
}

#[test]
fn google_variants_usage_preserves_cache_read_without_fabricated_write_field() {
    let msg = message();
    for frames in [
        google_generative_ai::encode_sse(&msg).unwrap(),
        google_vertex::encode_sse(&msg).unwrap(),
    ] {
        let event = payload(frames.last().unwrap());
        let usage = &event["usageMetadata"];
        assert_eq!(usage["promptTokenCount"], 24);
        assert_eq!(usage["cachedContentTokenCount"], 13);
        assert_eq!(usage["candidatesTokenCount"], 3);
        assert_eq!(usage["thoughtsTokenCount"], 2);
        assert_eq!(usage["totalTokenCount"], 46);
        assert_eq!(usage.as_object().unwrap().len(), 5);
        let input = usage["promptTokenCount"].as_u64().unwrap()
            - usage["cachedContentTokenCount"].as_u64().unwrap();
        assert_eq!(input, msg.usage.input);
    }
}

#[test]
fn mistral_usage_preserves_cache_read_without_fabricated_write_field() {
    let msg = message();
    let frames = mistral_conversations::encode::encode_sse(&msg).unwrap();
    let event = payload(&frames[frames.len() - 2]);
    let usage = &event["usage"];
    assert_eq!(usage["prompt_tokens"], 24);
    assert_eq!(usage["completion_tokens"], 5);
    assert_eq!(usage["total_tokens"], 46);
    assert_eq!(usage["prompt_tokens_details"], json!({"cached_tokens": 13}));
    let input = usage["prompt_tokens"].as_u64().unwrap()
        - usage["prompt_tokens_details"]["cached_tokens"]
            .as_u64()
            .unwrap();
    assert_eq!(input, msg.usage.input);
}

#[test]
fn bedrock_logical_usage_preserves_input_output_and_cache_read_write() {
    let msg = message();
    let frames = bedrock_converse_stream::encode::encode_sse(&msg).unwrap();
    let event = payload(frames.last().unwrap());
    assert_eq!(
        event["metadata"]["usage"],
        json!({
            "inputTokens": 11, "outputTokens": 5, "totalTokens": 46,
            "cacheReadInputTokens": 13, "cacheWriteInputTokens": 17,
            "cacheDetails": [{"ttl": "1h", "inputTokens": 7}]
        })
    );
    // pi-ai api/bedrock-converse-stream.ts:715-718 sums only the 1h cache details.
    let cache_write_1h: u64 = event["metadata"]["usage"]["cacheDetails"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|detail| detail["ttl"] == "1h")
        .map(|detail| detail["inputTokens"].as_u64().unwrap_or(0))
        .sum();
    assert_eq!(Some(cache_write_1h), msg.usage.cache_write_1h);
}

#[test]
fn pi_messages_usage_preserves_cache_fields_verbatim() {
    let msg = message();
    let frames = pi_messages::encode::encode(&msg).unwrap();
    let event = payload(frames.last().unwrap());
    assert_eq!(event["usage"], serde_json::to_value(msg.usage).unwrap());
}
