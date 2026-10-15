use super::table::MountError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum SavedMount {
    Command(String),
    Config(MountSpec),
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct MountSpec {
    pub command: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub protocols: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefer: Option<String>,
}

impl SavedMount {
    pub fn spec(self) -> MountSpec {
        match self {
            Self::Command(command) => MountSpec {
                command,
                ..Default::default()
            },
            Self::Config(s) => s,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Script {
    pub name: String,
    #[serde(flatten)]
    pub spec: MountSpec,
    pub port: Option<u16>,
    pub url: String,
    pub port_url: Option<String>,
}

pub fn load(file: Option<&Path>) -> Result<BTreeMap<String, SavedMount>, String> {
    let Some(file) = file else {
        return Ok(BTreeMap::new());
    };
    match std::fs::read_to_string(file) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", file.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(format!("{}: {e}", file.display())),
    }
}

pub fn save(
    file: Option<&Path>,
    commands: &BTreeMap<String, SavedMount>,
) -> Result<(), MountError> {
    let Some(file) = file else {
        return Ok(());
    };
    let temporary = file.with_extension(format!("json.{}.tmp", std::process::id()));
    let result = (|| {
        let raw = serde_json::to_vec_pretty(commands).expect("command map JSON");
        use std::io::Write;
        let mut output = std::fs::File::create(&temporary)?;
        output.write_all(&raw)?;
        output.sync_all()?;
        std::fs::rename(&temporary, file)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|e: std::io::Error| (500, "mount_io_failed", e.to_string()))
}
