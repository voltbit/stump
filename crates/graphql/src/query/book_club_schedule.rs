use async_graphql::{Context, Object, Result, ID};
use models::{entity::book_club_schedule, shared::book_club::BookClubMemberRole};
use sea_orm::prelude::*;

use crate::{
	data::CoreContext, guard::BookClubRoleGuard,
	object::book_club_schedule::BookClubSchedule,
};

#[derive(Default)]
pub struct BookClubScheduleQuery;

#[Object]
impl BookClubScheduleQuery {
	/// Get all schedules configured for a book club
	#[graphql(
		guard = "BookClubRoleGuard::new(book_club_id.as_ref(), BookClubMemberRole::Member)"
	)]
	async fn book_club_schedules(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
	) -> Result<Vec<BookClubSchedule>> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let schedules = find_schedules_for_club(book_club_id.as_ref(), conn).await?;

		Ok(schedules.into_iter().map(BookClubSchedule::from).collect())
	}
}

async fn find_schedules_for_club(
	book_club_id: &str,
	conn: &DatabaseConnection,
) -> Result<Vec<book_club_schedule::Model>> {
	Ok(
		book_club_schedule::Entity::find_for_book_club_id(book_club_id)
			.all(conn)
			.await?,
	)
}

#[cfg(test)]
mod tests {
	use super::*;
	use models::shared::book_club::BookClubScheduleKind;
	use pretty_assertions::assert_eq;
	use sea_orm::{DatabaseBackend::Sqlite, MockDatabase};

	fn get_default_schedule() -> book_club_schedule::Model {
		book_club_schedule::Model {
			id: "sched-1".to_string(),
			book_club_id: "club-1".to_string(),
			name: "Upcoming book discussion".to_string(),
			kind: BookClubScheduleKind::UpcomingDiscussion,
			config: serde_json::json!({
				"startsAt": "2026-08-01T18:00:00+00:00",
				"recurrence": null,
			})
			.to_string(),
			created_at: chrono::Utc::now().into(),
		}
	}

	#[tokio::test]
	async fn returns_created_schedules() {
		let schedule = get_default_schedule();
		let mock_db = MockDatabase::new(Sqlite)
			.append_query_results(vec![vec![schedule.clone()]])
			.into_connection();

		let schedules = find_schedules_for_club("club-1", &mock_db).await.unwrap();

		assert_eq!(schedules, vec![schedule]);
	}

	#[tokio::test]
	async fn returns_empty_when_no_schedules() {
		let mock_db = MockDatabase::new(Sqlite)
			.append_query_results::<book_club_schedule::Model, _, _>(vec![vec![]])
			.into_connection();

		let schedules = find_schedules_for_club("club-1", &mock_db).await.unwrap();

		assert!(schedules.is_empty());
	}
}
