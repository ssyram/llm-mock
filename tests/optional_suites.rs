use mock_llm_server::mounts::{routing, table};
use mock_llm_server::{capture, registry, server};
use std::env;
use std::io;
use std::path::Path;
use std::process::{self, Command};

#[path = "support/python-routing-cases.rs"]
mod python_routing_cases;
#[path = "support/python-suite.rs"]
mod python_suite;
#[path = "../src/mounts/request_fixture.rs"]
mod request_fixture;
#[path = "../src/mounts/script_fixture.rs"]
mod script_fixture;

fn main() {
    let args: Vec<_> = env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--list") {
        println!("optional_suites: python; node (Node unit, duality, transport, fuzz, property, Pi, OpenCode)");
        return;
    }
    let filter = args.iter().find(|arg| !arg.starts_with('-'));
    if filter.is_some_and(|arg| !["python", "node"].contains(&arg.as_str())) {
        println!("SKIP optional suites: filtered Cargo invocation; use cargo test --test optional_suites");
        return;
    }
    let mut code = 0;
    if filter.is_none_or(|arg| arg == "python") && !python_suite::run() {
        code = 1;
    }
    if filter.is_none_or(|arg| arg == "node") {
        code = code.max(node_suites());
    }
    if code != 0 {
        process::exit(code);
    }
}

fn node_suites() -> i32 {
    let output = match Command::new("node").arg("--version").output() {
        Ok(output) => output,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            println!("WARNING: SKIP Node tests, pi-ai duality/transport/fuzz/property, Pi and OpenCode harnesses: Node is not installed; protocol equivalence and harness behavior are NOT VERIFIED");
            return 0;
        }
        Err(error) => panic!("cannot start Node: {error}"),
    };
    assert!(output.status.success(), "node --version failed");
    let version = String::from_utf8(output.stdout).expect("Node version is UTF-8");
    let major: u32 = version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .next()
        .expect("Node major version")
        .parse()
        .expect("numeric Node version");
    if major < 23 {
        println!("WARNING: SKIP optional suites: Node {version}requires Node >=23 (recommended: Node 24 LTS); protocol equivalence and harness behavior are NOT VERIFIED");
        return 0;
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    Command::new("node")
        .arg(root.join("tests/run-suites.mjs"))
        .current_dir(root)
        .env("MOCK_SERVER_BIN", env!("CARGO_BIN_EXE_mock-llm-server"))
        .env(
            "MOCK_OPTIONAL_RUNNER",
            env::current_exe().expect("optional test runner path"),
        )
        .status()
        .expect("start optional test suites")
        .code()
        .unwrap_or(1)
}
