use super::{Entry, Matcher, Registry, Reply};
use crate::model::{MockError, Usage};
use serde_json::{json, Value};

fn run(stdout: &str, exit: u8) -> Result<crate::model::AssistantMessage, MockError> {
    let quoted = stdout.replace('\'', "'\\''");
    let entry = Entry {
        key_id: "key".into(),
        matcher: Matcher::Any,
        reply: Reply::Script {
            command: format!("cat >/dev/null; printf '%s' '{quoted}'; exit {exit}"),
        },
    };
    Registry::empty().execute(&entry, &json!({"request":{}}))
}
fn success() -> Value {
    json!({"content":[{"type":"text","text":"prepared"}], "api":"pi-messages",
        "provider":"fixture", "model":"test", "usage":Usage::default(), "stopReason":"stop", "timestamp":0})
}

#[test]
fn nonzero_exit_cannot_be_hidden_by_success_json() {
    let stdout = success().to_string();
    assert!(run(&stdout, 0).is_ok());
    let error = run(&stdout, 7).unwrap_err();
    assert_eq!(error.status, 500);
    assert_eq!(error.code, "script_failed");
    assert!(error.message.contains('7'));
}

#[test]
fn valid_simulated_error_keeps_its_contract_for_both_exit_states() {
    let stdout =
        json!({"error":{"status":429,"code":"planned","message":"retry later"}}).to_string();
    for exit in [0, 7] {
        assert_eq!(
            run(&stdout, exit).unwrap_err(),
            MockError {
                status: 429,
                code: "planned".into(),
                message: "retry later".into()
            }
        );
    }
}

#[test]
fn process_failure_precedes_missing_or_invalid_output() {
    for stdout in ["", "not json", "{\"error\":{\"status\":\"wrong\"}}"] {
        assert_eq!(run(stdout, 7).unwrap_err().code, "script_failed");
    }
    assert_eq!(run("", 0).unwrap_err().code, "script_no_output");
    assert_eq!(
        run("not json", 0).unwrap_err().code,
        "script_output_invalid"
    );
}
