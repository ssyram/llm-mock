use serde_json::Value;

pub const API: &str = "mistral-conversations";
pub const PROVIDER: &str = "mistral";

pub fn model_from_body(body: &Value) -> Result<String, String> {
    body.get("model")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "missing Mistral model".into())
}

pub fn sse_data(value: &Value) -> String {
    format!(
        "data: {}\n\n",
        serde_json::to_string(value).expect("JSON value serializes")
    )
}
