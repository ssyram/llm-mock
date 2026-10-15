use axum::body::Bytes;
use axum::http::HeaderMap;
use std::io::{Read, Write};
use std::process::{Command, Stdio};

const MAX_BODY: u64 = 2 * 1024 * 1024;
const INSTALL: &str = "zstd CLI is required for Content-Encoding: zstd; install from https://facebook.github.io/zstd/";

pub fn decode(headers: &HeaderMap, body: Bytes) -> Result<String, String> {
    let bytes = match super::transport::header(headers, "content-encoding") {
        None | Some("identity") => body.to_vec(),
        Some(value) if value.eq_ignore_ascii_case("zstd") => decompress(&body)?,
        Some(_) => return Err("unsupported Content-Encoding".into()),
    };
    String::from_utf8(bytes).map_err(|_| "request body is not valid UTF-8".into())
}

fn decompress(body: &[u8]) -> Result<Vec<u8>, String> {
    let found = Command::new("which")
        .arg("zstd")
        .output()
        .map_err(|_| INSTALL.to_string())?;
    if !found.status.success() {
        return Err(INSTALL.into());
    }
    let program = String::from_utf8(found.stdout).map_err(|_| INSTALL.to_string())?;
    let mut child = Command::new(program.trim())
        .args(["-d", "-q", "-c"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| INSTALL.to_string())?;
    let mut stdin = child.stdin.take().expect("piped stdin");
    let stdout = child.stdout.take().expect("piped stdout");
    let input = body.to_vec();
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let mut bytes = Vec::new();
    let read = stdout.take(MAX_BODY + 1).read_to_end(&mut bytes);
    if read.is_err() || bytes.len() as u64 > MAX_BODY {
        let _ = child.kill();
    }
    let status = child.wait().map_err(|e| e.to_string());
    let written = writer
        .join()
        .map_err(|_| "zstd input pipe failed".to_string())?;
    if bytes.len() as u64 > MAX_BODY {
        return Err("decompressed request exceeds 2 MiB".into());
    }
    read.map_err(|e| e.to_string())?;
    if !status?.success() || written.is_err() {
        return Err("invalid zstd request body".into());
    }
    Ok(bytes)
}
