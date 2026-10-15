const fn crc32_table() -> [u32; 256] {
    let mut table = [0; 256];
    let mut index = 0;
    while index < table.len() {
        let mut value = index as u32;
        let mut bit = 0;
        while bit < 8 {
            value = if value & 1 == 1 {
                (value >> 1) ^ 0xedb8_8320
            } else {
                value >> 1
            };
            bit += 1;
        }
        table[index] = value;
        index += 1;
    }
    table
}

const CRC32_TABLE: [u32; 256] = crc32_table();

pub(super) fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = u32::MAX;
    for byte in bytes {
        crc = CRC32_TABLE[((crc ^ u32::from(*byte)) & 0xff) as usize] ^ (crc >> 8);
    }
    !crc
}

pub(super) fn encode_frame(event_type: &str, payload: &[u8]) -> Result<Vec<u8>, String> {
    let mut headers = Vec::new();
    for (name, value) in [
        (":message-type", "event"),
        (":event-type", event_type),
        (":content-type", "application/json"),
    ] {
        headers.push(name.len() as u8);
        headers.extend_from_slice(name.as_bytes());
        headers.push(7);
        let length = u16::try_from(value.len()).map_err(|_| "EventStream header too long")?;
        headers.extend_from_slice(&length.to_be_bytes());
        headers.extend_from_slice(value.as_bytes());
    }
    let total_length = u32::try_from(16 + headers.len() + payload.len())
        .map_err(|_| "EventStream frame too long")?;
    let mut frame = Vec::with_capacity(total_length as usize);
    frame.extend_from_slice(&total_length.to_be_bytes());
    frame.extend_from_slice(&(headers.len() as u32).to_be_bytes());
    frame.extend_from_slice(&crc32(&frame).to_be_bytes());
    frame.extend_from_slice(&headers);
    frame.extend_from_slice(payload);
    frame.extend_from_slice(&crc32(&frame).to_be_bytes());
    Ok(frame)
}
