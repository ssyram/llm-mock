use crate::model::ImageContent;
use serde_json::Value;

pub(super) fn decode_image(image: &Value) -> Result<ImageContent, String> {
    let format = image.get("format").and_then(Value::as_str).unwrap_or("png");
    let data = image
        .get("source")
        .and_then(|s| s.get("bytes"))
        .and_then(Value::as_str)
        .ok_or("Bedrock image source.bytes must be base64 text")?;
    Ok(ImageContent {
        data: data.into(),
        mime_type: format!("image/{format}"),
    })
}
