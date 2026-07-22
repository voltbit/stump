use async_graphql::{ComplexObject, Json, Result, SimpleObject};
use models::entity::book_club_schedule;

#[derive(Debug, Clone, SimpleObject)]
#[graphql(complex)]
pub struct BookClubSchedule {
	#[graphql(flatten)]
	model: book_club_schedule::Model,
}

impl From<book_club_schedule::Model> for BookClubSchedule {
	fn from(model: book_club_schedule::Model) -> Self {
		Self { model }
	}
}

#[ComplexObject]
impl BookClubSchedule {
	/// The kind-specific config payload for this schedule
	async fn config(&self) -> Result<Json<serde_json::Value>> {
		let value: serde_json::Value = serde_json::from_str(&self.model.config)?;
		Ok(Json(value))
	}
}
