pub mod decode;

#[cfg(test)]
mod tests;

pub use crate::api::openai_responses::encode::{encode_error, encode_response};
