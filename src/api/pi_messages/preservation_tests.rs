use serde_json::json;

use super::decode::decode;
use super::test_fixture::request;

#[test]
fn preserves_section_order_and_record_values_without_model_filtered_expectations() {
    let mut body = request();
    body["context"]["messages"][0]["sections"] = json!({"z":"FIRST", "a":"SECOND", "removed":null});
    body["context"]["messages"][4]["details"] = json!(null);
    let decoded = decode(&body).unwrap();
    let encoded = serde_json::to_value(decoded).unwrap();
    let sections = encoded["context"]["messages"][0]["sections"]
        .as_object()
        .unwrap();
    assert_eq!(
        sections.keys().map(String::as_str).collect::<Vec<_>>(),
        ["z", "a", "removed"]
    );
    assert_eq!(
        sections
            .values()
            .filter_map(|value| value.as_str())
            .collect::<Vec<_>>(),
        ["FIRST", "SECOND"]
    );
    assert_eq!(encoded["options"]["cacheRetention"], "long");
    for (index, fields) in [
        (3, vec!["diagnostics", "deferred"]),
        (4, vec!["details", "usage", "nestedCalls"]),
    ] {
        for field in fields {
            let actual = &encoded["context"]["messages"][index];
            assert!(actual.get(field).is_some());
            assert_eq!(actual[field], body["context"]["messages"][index][field]);
        }
    }
}
