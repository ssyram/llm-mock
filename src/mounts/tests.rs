use super::protocol::{path_api, Api};
use super::selection::select_api;
use super::table::{validate_name, MountSpec, MountTable};
use axum::http::HeaderMap;

pub(crate) static PORT_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub(crate) fn run_script_and_port_test(test: impl std::future::Future<Output = ()>) {
    let _guard = PORT_TEST_LOCK.lock().unwrap();
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(test);
}

fn spec(command: &str) -> MountSpec {
    MountSpec {
        command: command.into(),
        ..Default::default()
    }
}
fn spawn(listener: tokio::net::TcpListener) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let _listener = listener;
        std::future::pending::<()>().await
    })
}

#[test]
fn mount_names_reject_reserved_and_unsafe_segments() {
    for name in [
        "", "v1", "v1beta", "openai", "codex", "__admin", "messages", "model", "a/b", "a?b", "..",
        "a b",
    ] {
        assert!(validate_name(name).is_err(), "{name}");
    }
    assert!(validate_name("scenario_1-x").is_ok());
}

#[tokio::test]
async fn mount_persistence_duplicate_delete_and_reload() {
    let file = std::env::temp_dir().join(format!("mount-table-{}.json", std::process::id()));
    let table = MountTable::new(Some(file.clone()), None, "http://127.0.0.1:18000".into());
    assert!(table.load().unwrap().is_empty());
    let script = table
        .register("test".into(), spec("cat"), None, true, spawn)
        .unwrap();
    assert_eq!(script.url, "http://127.0.0.1:18000/test");
    assert_eq!(
        std::fs::read_to_string(&file).unwrap(),
        "{\n  \"test\": \"cat\"\n}"
    );
    assert_eq!(
        table
            .register("test".into(), spec("echo"), None, true, spawn)
            .unwrap_err()
            .0,
        409
    );
    let configured = MountSpec {
        command: "cat".into(),
        protocols: vec!["mistral-conversations".into()],
        prefer: Some("mistral-conversations".into()),
    };
    table
        .register("mistral".into(), configured, None, true, spawn)
        .unwrap();
    let loaded = table.load().unwrap();
    assert_eq!(
        loaded["mistral"].clone().spec().prefer.as_deref(),
        Some("mistral-conversations")
    );
    table.remove("test").await.unwrap();
    assert!(!table.load().unwrap().contains_key("test"));
    assert_eq!(table.remove("test").await.unwrap_err().0, 404);
    table.remove("mistral").await.unwrap();
    std::fs::remove_file(file).unwrap();
}

#[test]
fn dedicated_port_conflict_and_release() {
    super::tests::run_script_and_port_test(async {
        let occupied = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = occupied.local_addr().unwrap().port();
        let table = MountTable::new(None, None, "http://127.0.0.1:18000".into());
        assert_eq!(
            table
                .register("fixed".into(), spec("cat"), Some(port), false, spawn)
                .unwrap_err()
                .0,
            409
        );
        drop(occupied);
        let result = table
            .register("fixed".into(), spec("cat"), Some(port), false, spawn)
            .unwrap();
        assert_eq!(result.port, Some(port));
        table.remove("fixed").await.unwrap();
        let _released = std::net::TcpListener::bind(("127.0.0.1", port)).unwrap();
    });
}

#[test]
fn port_base_skips_occupied_port_and_reuses_removed_port() {
    super::tests::run_script_and_port_test(async {
        let occupied = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let base = occupied.local_addr().unwrap().port();
        let table = MountTable::new(None, Some(base), "http://127.0.0.1:18000".into());
        let first = table
            .register("first".into(), spec("cat"), None, false, spawn)
            .unwrap();
        assert!(first.port.unwrap() > base);
        table.remove("first").await.unwrap();
        let second = table
            .register("second".into(), spec("cat"), None, false, spawn)
            .unwrap();
        assert_eq!(first.port, second.port);
        table.remove("second").await.unwrap();
    });
}

#[test]
fn completions_discrimination_is_path_local_and_explicit_first() {
    let headers = HeaderMap::new();
    let marker = r#"{"prompt_mode":"reasoning"}"#;
    assert_eq!(
        select_api(Api::Completions, &headers, marker, None),
        Api::Mistral
    );
    assert_eq!(
        select_api(Api::Responses, &headers, marker, None),
        Api::Responses
    );
    assert_eq!(
        select_api(Api::Completions, &headers, "{}", None),
        Api::Completions
    );
    let pinned = MountSpec {
        prefer: Some("openai-completions".into()),
        ..spec("cat")
    };
    assert_eq!(
        select_api(Api::Completions, &headers, marker, Some(&pinned)),
        Api::Completions
    );
    let pinned = MountSpec {
        protocols: vec!["mistral-conversations".into()],
        ..spec("cat")
    };
    assert_eq!(
        select_api(Api::Completions, &headers, "{}", Some(&pinned)),
        Api::Mistral
    );
    assert_eq!(path_api("/messages"), Some(Api::Pi));
    assert_eq!(path_api("/v1/messages"), Some(Api::Anthropic));
}

#[tokio::test]
async fn invalid_preference_and_persistence_failure_do_not_register() {
    let table = MountTable::new(
        Some(std::env::temp_dir()),
        None,
        "http://127.0.0.1:18000".into(),
    );
    assert_eq!(
        table
            .register("test".into(), spec("cat"), None, true, spawn)
            .unwrap_err()
            .0,
        500
    );
    assert!(table.list().is_empty());
    let bad = MountSpec {
        prefer: Some("unknown".into()),
        ..spec("cat")
    };
    assert_eq!(
        table
            .register("test".into(), bad, None, false, spawn)
            .unwrap_err()
            .0,
        400
    );
}
