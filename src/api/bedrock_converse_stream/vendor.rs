use serde_json::Value;

pub const API: &str = "bedrock-converse-stream";
pub const PROVIDER: &str = "amazon-bedrock";

pub fn model_from_path(path: &str) -> Result<String, String> {
    let path = path.split('?').next().unwrap_or(path);
    let marker = "/model/";
    let model = path
        .strip_prefix(marker)
        .or_else(|| path.split_once(marker).map(|(_, rest)| rest))
        .ok_or_else(|| format!("not a Bedrock ConverseStream path: {path}"))?;
    let model = model
        .strip_suffix("/converse-stream")
        .ok_or_else(|| format!("not a Bedrock ConverseStream path: {path}"))?;
    let model = percent_decode(model)?;
    if model.is_empty() {
        return Err("empty Bedrock model id".into());
    }
    Ok(model)
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err("invalid percent escape in model path".into());
            }
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|e| e.to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

pub fn sse_event(value: &Value) -> String {
    format!(
        "data: {}\n\n",
        serde_json::to_string(value).expect("JSON value serializes")
    )
}
