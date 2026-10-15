use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::RwLock;

pub use super::config::{MountSpec, SavedMount, Script};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

pub struct Mounted {
    pub script: Script,
    pub listener: Option<JoinHandle<()>>,
}

pub struct MountTable {
    pub(crate) entries: RwLock<BTreeMap<String, Mounted>>,
    file: Option<PathBuf>,
    port_base: Option<u16>,
    server_url: String,
}

pub type MountError = (u16, &'static str, String);

pub fn validate_name(name: &str) -> Result<(), MountError> {
    const RESERVED: &[&str] = &[
        "v1",
        "v1beta",
        "openai",
        "codex",
        "__admin",
        "messages",
        "model",
        "models",
        "chat",
        "responses",
        "projects",
        "publishers",
        "backend-api",
    ];
    if name.is_empty()
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        || RESERVED.contains(&name)
    {
        return Err((
            400,
            "invalid_name",
            "name must be a non-reserved ASCII alphanumeric, '-' or '_' segment".into(),
        ));
    }
    Ok(())
}

impl MountTable {
    pub fn new(file: Option<PathBuf>, port_base: Option<u16>, server_url: String) -> Self {
        Self {
            entries: RwLock::new(BTreeMap::new()),
            file,
            port_base,
            server_url,
        }
    }

    pub fn load(&self) -> Result<BTreeMap<String, SavedMount>, String> {
        super::config::load(self.file.as_deref())
    }

    pub fn spec(&self, name: &str) -> Option<MountSpec> {
        self.entries
            .read()
            .expect("mount lock")
            .get(name)
            .map(|m| m.script.spec.clone())
    }

    pub fn list(&self) -> Vec<Script> {
        self.entries
            .read()
            .expect("mount lock")
            .values()
            .map(|m| m.script.clone())
            .collect()
    }

    pub fn register(
        &self,
        name: String,
        spec: MountSpec,
        port: Option<u16>,
        persist: bool,
        spawn: impl FnOnce(TcpListener) -> JoinHandle<()>,
    ) -> Result<Script, MountError> {
        validate_name(&name)?;
        super::selection::validate_spec(&spec)?;
        if spec.command.trim().is_empty() || port == Some(0) {
            return Err((
                400,
                "invalid_script",
                "command must be nonempty and port must be 1..65535".into(),
            ));
        }
        let mut entries = self.entries.write().expect("mount lock");
        if entries.contains_key(&name) {
            return Err((409, "mount_exists", format!("mount {name} already exists")));
        }
        let listener = self.bind(port)?;
        let port = listener
            .as_ref()
            .map(|l| l.local_addr().expect("bound address").port());
        let script = Script {
            url: format!("{}/{}", self.server_url.trim_end_matches('/'), name),
            port_url: port.map(|p| format!("http://127.0.0.1:{p}")),
            name: name.clone(),
            spec: spec.clone(),
            port,
        };
        if persist {
            let mut commands = commands(&entries);
            commands.insert(name.clone(), saved(spec));
            self.save(&commands)?;
        }
        entries.insert(
            name,
            Mounted {
                script: script.clone(),
                listener: listener.map(spawn),
            },
        );
        Ok(script)
    }

    pub async fn remove(&self, name: &str) -> Result<(), MountError> {
        let removed = {
            let mut entries = self.entries.write().expect("mount lock");
            if !entries.contains_key(name) {
                return Err((404, "mount_not_found", format!("mount {name} not found")));
            }
            let mut commands = commands(&entries);
            commands.remove(name);
            self.save(&commands)?;
            entries.remove(name).expect("existing mount")
        };
        if let Some(task) = removed.listener {
            task.abort();
            let _ = task.await;
        }
        Ok(())
    }

    fn bind(&self, fixed: Option<u16>) -> Result<Option<TcpListener>, MountError> {
        let Some(first) = fixed.or(self.port_base) else {
            return Ok(None);
        };
        if first == 0 {
            return Err((400, "invalid_port", "port-base must be 1..65535".into()));
        }
        for port in first..=fixed.unwrap_or(u16::MAX) {
            match std::net::TcpListener::bind(("127.0.0.1", port)) {
                Ok(listener) => {
                    listener.set_nonblocking(true).map_err(io_error)?;
                    return TcpListener::from_std(listener).map(Some).map_err(io_error);
                }
                Err(e) if fixed.is_none() && e.kind() == std::io::ErrorKind::AddrInUse => continue,
                Err(e) => return Err((409, "port_unavailable", e.to_string())),
            }
        }
        Err((503, "ports_exhausted", "no available dedicated port".into()))
    }

    fn save(&self, commands: &BTreeMap<String, SavedMount>) -> Result<(), MountError> {
        super::config::save(self.file.as_deref(), commands)
    }
}

fn saved(spec: MountSpec) -> SavedMount {
    if spec.protocols.is_empty() && spec.prefer.is_none() {
        SavedMount::Command(spec.command)
    } else {
        SavedMount::Config(spec)
    }
}

fn commands(entries: &BTreeMap<String, Mounted>) -> BTreeMap<String, SavedMount> {
    entries
        .iter()
        .map(|(name, mount)| (name.clone(), saved(mount.script.spec.clone())))
        .collect()
}

fn io_error(e: std::io::Error) -> MountError {
    (500, "mount_io_failed", e.to_string())
}
