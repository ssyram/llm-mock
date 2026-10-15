use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};

/// Writes one JSON file per decoded request so the duality harness can
/// compare the server-side decode against its own canonical form.
pub struct CaptureSink {
    dir: Option<PathBuf>,
    seq: AtomicU64,
}

impl CaptureSink {
    pub fn new(dir: Option<PathBuf>) -> Self {
        if let Some(d) = &dir {
            let _ = std::fs::create_dir_all(d);
        }
        Self { dir, seq: AtomicU64::new(0) }
    }

    pub fn record(&self, api: &str, key_id: &str, request: &Value) {
        let Some(dir) = &self.dir else { return };
        let seq = self.seq.fetch_add(1, Ordering::SeqCst) + 1;
        let record = json!({
            "seq": seq,
            "api": api,
            "keyId": key_id,
            "receivedAt": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            "request": request,
        });
        let path = dir.join(format!("req-{seq:06}-{api}.json"));
        if let Err(e) = std::fs::write(&path, serde_json::to_vec(&record).unwrap_or_default()) {
            eprintln!("capture write failed for {path:?}: {e}");
        }
    }
}
