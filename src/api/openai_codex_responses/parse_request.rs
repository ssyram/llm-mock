use serde_json::{value::RawValue, Map, Value};
use std::collections::BTreeMap;

pub fn parse_request(body: &str) -> Result<Value, String> {
    let fields: BTreeMap<String, &RawValue> =
        serde_json::from_str(body).map_err(|error| format!("invalid JSON body: {error}"))?;
    let mut request = Map::new();
    for (name, raw) in fields {
        let value = if name == "instructions" && raw.get().starts_with('"') {
            decode_instructions(raw)
        } else {
            serde_json::from_str(raw.get())
        }
        .map_err(|error| format!("invalid JSON body: {error}"))?;
        request.insert(name, value);
    }
    Ok(Value::Object(request))
}

fn decode_instructions(raw: &RawValue) -> serde_json::Result<Value> {
    let bytes = raw.get().as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    let mut removed = false;
    while index < bytes.len() {
        if let Some(unit) = unicode_escape(bytes, index) {
            let width = if (0xd800..=0xdbff).contains(&unit) {
                if unicode_escape(bytes, index + 6)
                    .is_some_and(|next| (0xdc00..=0xdfff).contains(&next))
                {
                    12
                } else {
                    removed = true;
                    index += 6;
                    continue;
                }
            } else if (0xdc00..=0xdfff).contains(&unit) {
                removed = true;
                index += 6;
                continue;
            } else {
                6
            };
            output.extend_from_slice(&bytes[index..index + width]);
            index += width;
        } else {
            let width = if bytes[index] == b'\\' { 2 } else { 1 };
            output.extend_from_slice(&bytes[index..index + width]);
            index += width;
        }
    }
    let value: Value = serde_json::from_slice(&output)?;
    if removed && value.as_str() == Some("") {
        Ok(Value::String("You are a helpful assistant.".into()))
    } else {
        Ok(value)
    }
}

fn unicode_escape(bytes: &[u8], index: usize) -> Option<u16> {
    let escape = bytes.get(index..index + 6)?;
    if !escape.starts_with(b"\\u") {
        return None;
    }
    u16::from_str_radix(std::str::from_utf8(&escape[2..]).ok()?, 16).ok()
}
