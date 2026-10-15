pub mod decode;

#[cfg(test)]
mod tests;

pub use crate::api::google_generative_ai::encode::{encode_error, encode_sse};
