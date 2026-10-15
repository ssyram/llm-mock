use super::table::validate_name;
use serde_json::json;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

pub fn run(args: &[String]) -> Result<(), String> {
    let verb = args.first().ok_or("missing subcommand")?;
    let mut server = "http://127.0.0.1:18000".to_owned();
    let mut name = None;
    let mut port = None;
    let mut prefer = None;
    let mut protocols = Vec::new();
    let mut positional = Vec::new();
    let mut i = 1;
    while i < args.len() {
        let arg = &args[i];
        if arg.starts_with("--") {
            i += 1;
            let value = args
                .get(i)
                .ok_or_else(|| format!("missing value for {arg}"))?;
            match arg.as_str() {
                "--server-url" => server = value.clone(),
                "--name" if verb == "add" => name = Some(value.clone()),
                "--port" if verb == "add" => {
                    port = Some(value.parse::<u16>().map_err(|_| "invalid port")?)
                }
                "--prefer" if verb == "add" => prefer = Some(value.clone()),
                "--protocols" if verb == "add" => {
                    protocols = value.split(',').map(str::to_owned).collect()
                }
                _ => return Err(format!("unknown argument: {arg}")),
            }
        } else {
            positional.push(arg.clone());
        }
        i += 1;
    }
    let (method, path, body) = match verb.as_str() {
        "add" if positional.len() == 1 => {
            let name = name.ok_or("add requires --name")?;
            validate_name(&name).map_err(|(_, _, e)| e)?;
            let command = crate::registry::resolve_command(&positional[0], Some(std::path::Path::new(".")));
            ("POST", "/__admin/scripts".into(), json!({
                "name": name, "command": command, "port": port,
                "protocols": protocols, "prefer": prefer,
            }).to_string())
        }
        "remove" if positional.len() == 1 => {
            validate_name(&positional[0]).map_err(|(_, _, e)| e)?;
            ("DELETE", format!("/__admin/scripts/{}", positional[0]), String::new())
        }
        "list" if positional.is_empty() => ("GET", "/__admin/scripts".into(), String::new()),
        _ => return Err("usage: add <command> --name N [--port P] [--protocols a,b] [--prefer API] | remove N | list [--server-url URL]".into()),
    };
    let response = request(&server, method, &path, &body)?;
    println!("{response}");
    Ok(())
}

pub fn request(server: &str, method: &str, path: &str, body: &str) -> Result<String, String> {
    let authority = server
        .strip_prefix("http://")
        .unwrap_or(server)
        .trim_end_matches('/');
    if authority.contains('/') || authority.contains(['\r', '\n']) || authority.is_empty() {
        return Err("server-url must be an HTTP host:port without a path".into());
    }
    let address = if authority.contains(':') {
        authority.to_owned()
    } else {
        format!("{authority}:80")
    };
    let mut stream = TcpStream::connect(&address).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| e.to_string())?;
    write!(stream, "{method} {path} HTTP/1.1\r\nHost: {authority}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).map_err(|e| e.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|e| e.to_string())?;
    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or("invalid HTTP response")?;
    let status = headers
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .ok_or("invalid HTTP status")?;
    if !(200..300).contains(&status) {
        return Err(format!("HTTP {status}: {body}"));
    }
    Ok(body.to_owned())
}
