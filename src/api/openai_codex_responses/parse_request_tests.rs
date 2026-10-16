use super::parse_request::parse_request;
use serde_json::json;

#[test]
fn instructions_delete_only_unpaired_surrogates() {
    for (raw, expected) in [
        (r#""s\ud800x""#, "sx"),
        (r#""s\udc00x""#, "sx"),
        (r#""\ud800""#, "You are a helpful assistant."),
        (r#""a\uD800\uD83D\uDE00z""#, "a😀z"),
        (r#""s\ud83d\ude00x""#, "s😀x"),
        (r#""s�x""#, "s�x"),
        (r#""s\\ud800x""#, "s\\ud800x"),
        (r#""x\"\ud800\n\t界""#, "x\"\n\t界"),
        (r#""""#, ""),
    ] {
        let body = format!(r#"{{"instructions":{raw},"model":"m","input":[]}}"#);
        let parsed = parse_request(&body).unwrap();
        assert_eq!(parsed["instructions"], expected, "{raw}");
        assert_eq!(parsed["model"], "m");
        assert_eq!(parsed["input"], json!([]));
    }
}

#[test]
fn non_instruction_fields_and_malformed_json_remain_strict() {
    for body in [
        r#"{"instructions":"ok","model":"\ud800","input":[]}"#,
        r#"{"instructions":"ok","input":[{"text":"\udc00"}]}"#,
        r#"{"instructions":"\uZZZZ","input":[]}"#,
        r#"{"instructions":"\ud80","input":[]}"#,
        r#"{"instructions":"\ud800" "input":[]}"#,
        r#"{"instructions":"\ud800","input":[]} trailing"#,
        r#"[]"#,
    ] {
        assert!(parse_request(body).is_err(), "accepted {body}");
    }
    let body = r#"{"instructions":null,"input":[],"metadata":{"text":"literal \\ud800"}}"#;
    assert_eq!(
        parse_request(body).unwrap(),
        serde_json::from_str::<serde_json::Value>(body).unwrap()
    );
}

#[test]
fn direct_decoder_injects_normalized_instructions() {
    let body = r#"{"model":"m","instructions":"s\ud800x","input":[]}"#;
    let (request, _) =
        super::decode::decode_request(body, &[("authorization".into(), "Bearer mock".into())])
            .unwrap();
    let value = serde_json::to_value(request).unwrap();
    assert_eq!(value["context"]["messages"][0]["content"], "sx");
}
