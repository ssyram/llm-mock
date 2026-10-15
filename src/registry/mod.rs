use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};

use crate::model::{AssistantMessage, MockError, UnifiedRequest};

/// Registry matcher over the decoded request's text content.
/// MVP supports `any` and `textIncludes`; `regex` is deferred until a real
/// mock scenario needs it (adding it pulls the regex crate for no current use).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Matcher {
    Any,
    TextIncludes { value: String },
}

impl Matcher {
    pub fn matches(&self, req: &UnifiedRequest) -> bool {
        match self {
            Matcher::Any => true,
            Matcher::TextIncludes { value } => request_text(req).contains(value),
        }
    }
}

/// Absolutize command tokens that are existing files, resolved against
/// `base` (the add-caller's cwd). Non-file tokens pass through unchanged.
pub fn resolve_command(command: &str, base: Option<&std::path::Path>) -> String {
    command
        .split_whitespace()
        .map(|token| {
            let path = std::path::Path::new(token);
            if path.is_file() {
                let candidate = if path.is_absolute() {
                    path.to_path_buf()
                } else {
                    match base {
                        Some(b) => b.join(path),
                        None => return token.to_string(),
                    }
                };
                if let Ok(abs) = candidate.canonicalize() {
                    return abs.to_string_lossy().into_owned();
                }
            }
            token.to_string()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Directory of the first command token that is an existing file — the
/// script's own directory, used as its process cwd at spawn time.
pub fn script_dir(command: &str) -> Option<PathBuf> {
    command.split_whitespace().find_map(|token| {
        let path = std::path::Path::new(token);
        (path.is_file()).then(|| path.canonicalize().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())))?
    })
}

fn request_text(req: &UnifiedRequest) -> String {
    use crate::model::{Message, SystemContent, UserContent};
    let mut out = String::new();
    for msg in &req.context.messages {
        match msg {
            Message::System(m) => match &m.content {
                SystemContent::Text(t) => out.push_str(t),
                SystemContent::Blocks(blocks) => {
                    for b in blocks {
                        out.push_str(&b.text);
                    }
                }
            },
            Message::User(m) => match &m.content {
                UserContent::Text(t) => out.push_str(t),
                UserContent::Blocks(blocks) => {
                    for b in blocks {
                        if let crate::model::UserBlock::Text(t) = b {
                            out.push_str(&t.text);
                        }
                    }
                }
            },
            _ => {}
        }
    }
    out
}

/// What the matched entry replies with.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Reply {
    /// Degenerate constant script: path to an AssistantMessage JSON file.
    File { path: String },
    /// Real script: shell command receiving {"api","keyId","request"} JSON on
    /// stdin and printing either an AssistantMessage JSON or {"error":MockError}
    /// on stdout. All behavior (multi-turn, state) lives in scripts, not here.
    Script { command: String },
    /// Protocol-visible HTTP error instead of a reply.
    Error { status: u16, code: String, message: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub key_id: String,
    pub matcher: Matcher,
    pub reply: Reply,
}

/// On-disk seed file shape (registry.json), unchanged from mock-1.
#[derive(Deserialize)]
struct RegistryFile {
    entries: Vec<Entry>,
}

/// Runtime-mutable registry: admin endpoints mutate the same instance the
/// protocol handlers read from. std RwLock suffices because no guard is ever
/// held across an await point.
#[derive(Default)]
pub struct Registry {
    entries: RwLock<Vec<Entry>>,
}

#[derive(Debug)]
pub enum MatchOutcome {
    /// Owned snapshot of the matched entry: execute() runs lock-free, so
    /// concurrent admin mutations cannot shift indices between match and
    /// reply execution.
    One(Entry),
    NoMatch,
    /// Number of matching entries (>= 2). Registration deliberately allows
    /// coexisting matchers under one keyId; ambiguity surfaces at request
    /// time as 409, not at registration.
    Ambiguous(usize),
}

impl Registry {
    pub fn load(path: &str) -> Result<Self, String> {
        let raw = std::fs::read_to_string(path).map_err(|e| format!("read registry {path}: {e}"))?;
        let file: RegistryFile = serde_json::from_str(&raw).map_err(|e| format!("parse registry {path}: {e}"))?;
        Ok(Self { entries: RwLock::new(file.entries) })
    }

    pub fn empty() -> Self {
        Self { entries: RwLock::new(Vec::new()) }
    }

    pub fn add(&self, entry: Entry) {
        self.entries.write().expect("registry lock poisoned").push(entry);
    }

    pub fn list(&self) -> Vec<Entry> {
        self.entries.read().expect("registry lock poisoned").clone()
    }

    /// Removes every stored entry equal to `entry`, returning the removed
    /// count. Full-shape identification makes duplicate registrations remove
    /// together and removal idempotent.
    pub fn remove(&self, entry: &Entry) -> usize {
        let mut entries = self.entries.write().expect("registry lock poisoned");
        let before = entries.len();
        entries.retain(|e| e != entry);
        before - entries.len()
    }

    pub fn match_key(&self, key_id: &str, req: &UnifiedRequest) -> MatchOutcome {
        let entries = self.entries.read().expect("registry lock poisoned");
        let mut hits = entries.iter().filter(|e| e.key_id == key_id && e.matcher.matches(req));
        match (hits.next(), hits.next()) {
            (Some(first), None) => MatchOutcome::One(first.clone()),
            (Some(_), Some(_)) => MatchOutcome::Ambiguous(2 + hits.count()),
            (None, _) => MatchOutcome::NoMatch,
        }
    }

    pub fn execute(&self, entry: &Entry, input: &serde_json::Value) -> Result<AssistantMessage, MockError> {
        match &entry.reply {
            Reply::File { path } => {
                let raw = std::fs::read_to_string(path)
                    .map_err(|e| MockError { status: 500, code: "reply_file_unreadable".into(), message: format!("{path}: {e}") })?;
                serde_json::from_str(&raw)
                    .map_err(|e| MockError { status: 500, code: "reply_file_invalid".into(), message: format!("{path}: {e}") })
            }
            Reply::Script { command } => {
                use std::io::Write;
                use std::process::{Command, Stdio};
                let mut child = Command::new("sh")
                    .arg("-c")
                    .arg(command)
                    .current_dir(script_dir(command).unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))))
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .map_err(|e| MockError { status: 500, code: "script_spawn_failed".into(), message: format!("{command}: {e}") })?;
                {
                    let stdin = child.stdin.as_mut().expect("script stdin");
                    stdin
                        .write_all(serde_json::to_string(input).expect("script input").as_bytes())
                        .map_err(|e| MockError { status: 500, code: "script_input_failed".into(), message: e.to_string() })?;
                }
                let output = child
                    .wait_with_output()
                    .map_err(|e| MockError { status: 500, code: "script_failed".into(), message: e.to_string() })?;
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout.is_empty() {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    return Err(MockError { status: 500, code: "script_no_output".into(), message: format!("{command}: {stderr}") });
                }
                let value: serde_json::Value = serde_json::from_str(&stdout)
                    .map_err(|e| MockError { status: 500, code: "script_output_invalid".into(), message: format!("{command}: {e}") })?;
                if let Some(err) = value.get("error") {
                    let error: MockError = serde_json::from_value(err.clone())
                        .map_err(|e| MockError { status: 500, code: "script_error_invalid".into(), message: e.to_string() })?;
                    return Err(error);
                }
                serde_json::from_value(value)
                    .map_err(|e| MockError { status: 500, code: "script_output_invalid".into(), message: format!("{command}: {e}") })
            }
            Reply::Error { status, code, message } => {
                Err(MockError { status: *status, code: code.clone(), message: message.clone() })
            }
        }
    }
}

#[allow(dead_code)]
pub type RegistryMap = BTreeMap<String, Vec<Entry>>;
#[cfg(test)]
mod tests;
