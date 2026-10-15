use serde_json::{json, Value};

pub fn restore(
    body: &str,
    previous: Option<&(String, Vec<Value>)>,
) -> Result<Value, (&'static str, &'static str)> {
    let mut request: Value =
        serde_json::from_str(body).map_err(|_| ("invalid_request", "invalid JSON"))?;
    if request["type"] != "response.create" || !request["input"].is_array() {
        return Err((
            "invalid_request",
            "expected response.create with input array",
        ));
    }
    if let Some(id) = request.get("previous_response_id") {
        let Some((_, input)) =
            previous.filter(|(previous_id, _)| id.as_str() == Some(previous_id.as_str()))
        else {
            return Err((
                "previous_response_not_found",
                "unknown previous_response_id for this connection",
            ));
        };
        let mut full = input.clone();
        full.extend(
            request["input"]
                .as_array()
                .expect("validated input")
                .iter()
                .cloned(),
        );
        request["input"] = json!(full);
    }
    request
        .as_object_mut()
        .expect("response.create object")
        .remove("type");
    Ok(request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn continuation_restores_history_and_rejects_unknown_ids() {
        let previous = (
            "r1".into(),
            vec![
                json!({"role":"user","content":"first"}),
                json!({"type":"message","role":"assistant","content":[]}),
            ],
        );
        let restored = restore(r#"{"type":"response.create","previous_response_id":"r1","input":[{"role":"user","content":"next"}]}"#, Some(&previous)).unwrap();
        assert_eq!(restored["input"].as_array().unwrap().len(), 3);
        assert_eq!(restored["input"][2]["content"], "next");
        assert!(restored.get("type").is_none());
        assert_eq!(
            restore(
                r#"{"type":"response.create","previous_response_id":"missing","input":[]}"#,
                Some(&previous)
            )
            .unwrap_err()
            .0,
            "previous_response_not_found"
        );
        assert!(restore(r#"{"type":"other","input":[]}"#, None).is_err());
    }
}
