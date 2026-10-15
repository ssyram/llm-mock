use crate::{
    api::openai_responses::encode::encode_response_with_end_turn, model::AssistantMessage,
};

pub fn encode_response(msg: &AssistantMessage) -> Result<Vec<String>, String> {
    encode_response_with_end_turn(msg, msg.end_turn)
}
