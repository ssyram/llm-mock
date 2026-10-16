use std::io;
use std::process::Command;

pub fn run() -> bool {
    let probe = match Command::new("python3").arg("--version").output() {
        Ok(probe) => probe,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            println!("WARNING: SKIP Python routing tests: python3 is not installed; script routing and input forwarding are NOT VERIFIED");
            return true;
        }
        Err(error) => {
            eprintln!("FAIL Python routing tests: cannot start python3: {error}");
            return false;
        }
    };
    if !probe.status.success() {
        eprintln!("FAIL Python routing tests: python3 is installed but --version failed");
        return false;
    }
    println!("RUN Python routing tests");
    let routes = std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(super::python_routing_cases::protocol_routes());
    });
    let session = std::panic::catch_unwind(|| {
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(super::python_routing_cases::session_key_and_mistral());
    });
    for (name, passed) in [
        ("protocol routes and remove", routes.is_ok()),
        ("session/key forwarding and Mistral", session.is_ok()),
    ] {
        println!("{} Python/{name}", if passed { "PASS" } else { "FAIL" });
    }
    routes.is_ok() && session.is_ok()
}
