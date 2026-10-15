fn header<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

pub(super) fn bearer(headers: &[(String, String)]) -> Result<String, String> {
    let auth = header(headers, "authorization").ok_or("missing Authorization header")?;
    crate::bearer::bearer_token(auth)
        .map(str::to_string)
        .ok_or("Authorization header is not Bearer".to_string())
}

pub(super) fn session_signal(
    headers: &[(String, String)],
    prompt_cache_key: Option<&str>,
) -> Option<String> {
    header(headers, "session_id")
        .or_else(|| header(headers, "x-client-request-id"))
        .or_else(|| header(headers, "x-session-id"))
        .map(str::to_string)
        .or_else(|| prompt_cache_key.map(str::to_string))
}
