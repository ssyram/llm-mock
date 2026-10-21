use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

use crate::model::{AssistantMessage, MockError};
use serde_json::Value;

fn failed(code: &str, message: impl Into<String>) -> MockError {
    MockError {
        status: 500,
        code: code.into(),
        message: message.into(),
    }
}

pub(super) fn execute_script(command: &str, input: &Value) -> Result<AssistantMessage, MockError> {
    let directory = super::script_dir(command)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")));
    let mut child = Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| failed("script_spawn_failed", format!("{command}: {error}")))?;
    child
        .stdin
        .as_mut()
        .expect("script stdin")
        .write_all(
            serde_json::to_string(input)
                .expect("script input")
                .as_bytes(),
        )
        .map_err(|error| failed("script_input_failed", error.to_string()))?;
    let output = child
        .wait_with_output()
        .map_err(|error| failed("script_failed", error.to_string()))?;
    decode_output(command, output)
}

fn decode_output(command: &str, output: Output) -> Result<AssistantMessage, MockError> {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout = stdout.trim();
    let value = serde_json::from_str::<Value>(stdout);
    let simulated_error = value
        .as_ref()
        .ok()
        .and_then(|value| value.get("error"))
        .map(|error| serde_json::from_value::<MockError>(error.clone()));
    match simulated_error {
        Some(Ok(error)) => return Err(error),
        Some(Err(error)) if output.status.success() => {
            return Err(failed("script_error_invalid", error.to_string()))
        }
        _ => {}
    }
    if !output.status.success() {
        return Err(failed(
            "script_failed",
            format!("script exited unsuccessfully: {}", output.status),
        ));
    }
    if stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(failed(
            "script_no_output",
            format!("{command}: {}", stderr.trim()),
        ));
    }
    let value =
        value.map_err(|error| failed("script_output_invalid", format!("{command}: {error}")))?;
    serde_json::from_value(value)
        .map_err(|error| failed("script_output_invalid", format!("{command}: {error}")))
}
