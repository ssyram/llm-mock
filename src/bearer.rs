pub(crate) fn bearer_token(authorization: &str) -> Option<&str> {
    let (scheme, token) = authorization.split_once(' ')?;
    scheme.eq_ignore_ascii_case("Bearer").then_some(token)
}

#[cfg(test)]
mod tests {
    use super::bearer_token;
    use crate::api::{
        anthropic_messages, azure_openai_responses, bedrock_converse_stream, mistral_conversations,
        openai_codex_responses, openai_responses, pi_messages,
    };
    use serde_json::json;

    #[test]
    fn bearer_token_ignores_scheme_case_but_preserves_token() {
        for scheme in ["Bearer", "bearer", "BEARER", "bEaReR"] {
            assert_eq!(
                bearer_token(&format!("{scheme} MiXeD-key")),
                Some("MiXeD-key")
            );
        }
        for value in [
            "Basic key",
            "Bearer",
            "Bearerkey",
            " Bearer key",
            "Béarer key",
        ] {
            assert_eq!(bearer_token(value), None, "{value}");
        }
        assert_eq!(bearer_token("Bearer "), Some(""));
    }

    #[test]
    fn bearer_decoders_accept_all_scheme_cases() {
        let responses = json!({"model":"m", "input":[{"role":"user", "content":"hi"}]}).to_string();
        let messages =
            json!({"model":"m", "max_tokens":16, "messages":[{"role":"user", "content":"hi"}]});
        let pi = json!({"model":"m", "context":{"messages":[]}, "options":{}});
        let bedrock = json!({"messages":[{"role":"user", "content":[{"text":"hi"}]}]});
        for scheme in ["Bearer", "bearer", "BEARER", "bEaReR"] {
            let authorization = format!("{scheme} MiXeD-key");
            let headers = vec![("aUtHoRiZaTiOn".to_owned(), authorization.clone())];
            assert_eq!(
                openai_responses::decode::decode_request(&responses, &headers)
                    .unwrap()
                    .1
                    .key_id,
                "MiXeD-key"
            );
            assert_eq!(
                openai_codex_responses::decode::decode_request(&responses, &headers)
                    .unwrap()
                    .1
                    .key_id,
                "MiXeD-key"
            );
            let mut azure_headers = headers.clone();
            azure_headers.push(("api-key".into(), "MiXeD-key".into()));
            assert_eq!(
                azure_openai_responses::decode::decode_request(&responses, &azure_headers)
                    .unwrap()
                    .1
                    .key_id,
                "MiXeD-key"
            );
            assert_eq!(
                mistral_conversations::decode::decode_request(&messages, &headers)
                    .unwrap()
                    .1
                    .key_id,
                "MiXeD-key"
            );
            let anthropic_headers = anthropic_messages::WireHeaders {
                x_api_key: None,
                authorization: Some(&authorization),
                x_session_affinity: None,
                x_session_id: None,
            };
            assert_eq!(
                anthropic_messages::decode_request(&messages, &anthropic_headers)
                    .unwrap()
                    .info
                    .key_id,
                "MiXeD-key"
            );
            assert_eq!(
                pi_messages::decode_request(
                    &pi,
                    &pi_messages::WireHeaders {
                        authorization: Some(&authorization)
                    }
                )
                .unwrap()
                .info
                .key_id,
                "MiXeD-key"
            );
            assert_eq!(
                bedrock_converse_stream::decode::decode_request_info(
                    "/model/m/converse-stream",
                    &headers,
                    &bedrock
                )
                .unwrap()
                .key_id,
                "MiXeD-key"
            );
        }
    }
}
