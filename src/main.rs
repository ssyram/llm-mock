use mock_llm_server::capture::CaptureSink;
use mock_llm_server::mounts::table::MountTable;
use mock_llm_server::mounts::{admin, cli};
use mock_llm_server::registry::Registry;
use mock_llm_server::server::{build_router, AppState};
use std::path::PathBuf;
use std::sync::Arc;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = if args
        .first()
        .is_some_and(|s| ["add", "remove", "list"].contains(&s.as_str()))
    {
        cli::run(&args)
    } else {
        serve(args)
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn serve(args: Vec<String>) -> Result<(), String> {
    let mut port: u16 = 18000;
    let mut port_base = None;
    let mut registry_path = None;
    let mut capture_dir = None;
    let mut mounts_file = PathBuf::from("./mounts.json");
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let value = args
            .next()
            .ok_or_else(|| format!("missing value for {arg}"))?;
        match arg.as_str() {
            "--port" => port = value.parse().map_err(|_| "invalid port")?,
            "--port-base" => {
                let base: u16 = value.parse().map_err(|_| "invalid port-base")?;
                if base == 0 {
                    return Err("port-base must be 1..65535".into());
                }
                port_base = Some(base);
            }
            "--registry" => registry_path = Some(value),
            "--capture-dir" => capture_dir = Some(PathBuf::from(value)),
            "--mounts-file" => mounts_file = PathBuf::from(value),
            _ => return Err(format!("unknown argument: {arg}")),
        }
    }
    let registry = match registry_path {
        Some(path) => Registry::load(&path)?,
        None => Registry::empty(),
    };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async move {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
            .await
            .map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let state = Arc::new(AppState {
            registry,
            capture: CaptureSink::new(capture_dir),
            mounts: MountTable::new(
                Some(mounts_file),
                port_base,
                format!("http://127.0.0.1:{port}"),
            ),
        });
        for (name, saved) in state.mounts.load()? {
            admin::register(
                &state,
                admin::AddScript {
                    name,
                    spec: saved.spec(),
                    port: None,
                    cwd: None,
                },
                false,
            )
            .map_err(|(_, code, message)| format!("{code}: {message}"))?;
        }
        println!("mock-llm-server listening on http://127.0.0.1:{port}");
        axum::serve(listener, build_router(state))
            .await
            .map_err(|e| e.to_string())
    })
}
