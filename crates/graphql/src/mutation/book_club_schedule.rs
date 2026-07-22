use async_graphql::{Context, Object, Result, ID};
use models::{entity::book_club_schedule, shared::book_club::BookClubMemberRole};
use sea_orm::prelude::*;

use crate::{
	data::CoreContext,
	guard::BookClubRoleGuard,
	input::book_club::{CreateBookClubScheduleInput, UpdateBookClubScheduleInput},
	object::book_club_schedule::BookClubSchedule,
};

#[derive(Default)]
pub struct BookClubScheduleMutation;

#[Object]
impl BookClubScheduleMutation {
	/// Create a new schedule for the book club (Admin+)
	#[graphql(
		guard = "BookClubRoleGuard::new(book_club_id.as_ref(), BookClubMemberRole::Admin)"
	)]
	async fn create_book_club_schedule(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
		input: CreateBookClubScheduleInput,
	) -> Result<BookClubSchedule> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let created_schedule =
			create_schedule(book_club_id.as_ref(), input, conn).await?;

		Ok(created_schedule.into())
	}

	/// Update an existing schedule for the book club (Admin+)
	#[graphql(
		guard = "BookClubRoleGuard::new(book_club_id.as_ref(), BookClubMemberRole::Admin)"
	)]
	async fn update_book_club_schedule(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
		id: ID,
		input: UpdateBookClubScheduleInput,
	) -> Result<BookClubSchedule> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let updated_schedule =
			update_schedule(book_club_id.as_ref(), id.as_ref(), input, conn).await?;

		Ok(updated_schedule.into())
	}

	/// Delete a schedule from the book club (Admin+)
	#[graphql(
		guard = "BookClubRoleGuard::new(book_club_id.as_ref(), BookClubMemberRole::Admin)"
	)]
	async fn delete_book_club_schedule(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
		id: ID,
	) -> Result<BookClubSchedule> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let deleted_schedule =
			delete_schedule(book_club_id.as_ref(), id.as_ref(), conn).await?;

		Ok(deleted_schedule.into())
	}
}

async fn find_schedule_for_club(
	book_club_id: &str,
	id: &str,
	conn: &DatabaseConnection,
) -> Result<book_club_schedule::Model> {
	let schedule = book_club_schedule::Entity::find_by_id(id)
		.filter(book_club_schedule::Column::BookClubId.eq(book_club_id))
		.one(conn)
		.await?
		.ok_or("Schedule not found")?;

	Ok(schedule)
}

async fn create_schedule(
	book_club_id: &str,
	input: CreateBookClubScheduleInput,
	conn: &DatabaseConnection,
) -> Result<book_club_schedule::Model> {
	let active_model = input.into_active_model(book_club_id)?;
	Ok(active_model.insert(conn).await?)
}

async fn update_schedule(
	book_club_id: &str,
	id: &str,
	input: UpdateBookClubScheduleInput,
	conn: &DatabaseConnection,
) -> Result<book_club_schedule::Model> {
	let schedule = find_schedule_for_club(book_club_id, id, conn).await?;
	let active_model = input.apply(schedule)?;
	Ok(active_model.update(conn).await?)
}

async fn delete_schedule(
	book_club_id: &str,
	id: &str,
	conn: &DatabaseConnection,
) -> Result<book_club_schedule::Model> {
	let schedule = find_schedule_for_club(book_club_id, id, conn).await?;
	schedule.clone().delete(conn).await?;
	Ok(schedule)
}

#[cfg(test)]
mod tests {
	use crate::tests::common::*;

	use super::*;
	use models::shared::book_club::BookClubScheduleKind;
	use pretty_assertions::assert_eq;

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
	async fn create_schedule_valid_upcoming_discussion() {
		let input = CreateBookClubScheduleInput {
			name: "Upcoming book discussion".to_string(),
			kind: BookClubScheduleKind::UpcomingDiscussion,
			config: async_graphql::Json(serde_json::json!({
				"startsAt": "2026-08-01T18:00:00+00:00",
				"recurrence": null,
			})),
		};

		let mock_db = get_mock_db_for_model(vec![get_default_schedule()])
			.append_exec_results(vec![sea_orm::MockExecResult {
				last_insert_id: 1,
				rows_affected: 1,
			}])
			.into_connection();

		let result = create_schedule("club-1", input, &mock_db).await;
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn create_schedule_valid_interval_books() {
		let mut schedule = get_default_schedule();
		schedule.kind = BookClubScheduleKind::IntervalBooks;
		schedule.config = serde_json::json!({
			"interval": { "every": 2, "unit": "WEEK", "anchor": "2026-08-01" },
			"assignments": [],
		})
		.to_string();

		let input = CreateBookClubScheduleInput {
			name: "Reading rotation".to_string(),
			kind: BookClubScheduleKind::IntervalBooks,
			config: async_graphql::Json(serde_json::json!({
				"interval": { "every": 2, "unit": "WEEK", "anchor": "2026-08-01" },
				"assignments": [],
			})),
		};

		let mock_db = get_mock_db_for_model(vec![schedule])
			.append_exec_results(vec![sea_orm::MockExecResult {
				last_insert_id: 1,
				rows_affected: 1,
			}])
			.into_connection();

		let result = create_schedule("club-1", input, &mock_db).await;
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn create_schedule_rejects_invalid_config() {
		let input = CreateBookClubScheduleInput {
			name: "Reading rotation".to_string(),
			kind: BookClubScheduleKind::IntervalBooks,
			config: async_graphql::Json(serde_json::json!({ "foo": "bar" })),
		};

		let mock_db =
			get_mock_db_for_model::<book_club_schedule::Model>(vec![]).into_connection();

		let result = create_schedule("club-1", input, &mock_db).await;
		assert!(result.is_err());
	}

	#[tokio::test]
	async fn create_schedule_rejects_empty_name() {
		let input = CreateBookClubScheduleInput {
			name: "".to_string(),
			kind: BookClubScheduleKind::UpcomingDiscussion,
			config: async_graphql::Json(serde_json::json!({
				"startsAt": "2026-08-01T18:00:00+00:00",
				"recurrence": null,
			})),
		};

		let mock_db =
			get_mock_db_for_model::<book_club_schedule::Model>(vec![]).into_connection();

		let result = create_schedule("club-1", input, &mock_db).await;
		assert!(result.is_err());
	}

	#[tokio::test]
	async fn update_schedule_not_found() {
		let input = UpdateBookClubScheduleInput {
			name: Some("Renamed".to_string()),
			kind: None,
			config: None,
		};

		let mock_db =
			get_mock_db_for_model::<book_club_schedule::Model>(vec![]).into_connection();

		let result = update_schedule("club-1", "sched-1", input, &mock_db).await;
		assert!(result.is_err());
	}

	#[tokio::test]
	async fn update_schedule_rejects_kind_mismatch() {
		let input = UpdateBookClubScheduleInput {
			name: None,
			kind: Some(BookClubScheduleKind::IntervalBooks),
			config: None,
		};

		let mock_db =
			get_mock_db_for_model(vec![get_default_schedule()]).into_connection();

		let result = update_schedule("club-1", "sched-1", input, &mock_db).await;
		assert!(result.is_err());
	}

	#[tokio::test]
	async fn update_schedule_valid_rename() {
		let input = UpdateBookClubScheduleInput {
			name: Some("Renamed discussion".to_string()),
			kind: None,
			config: None,
		};

		let mut renamed = get_default_schedule();
		renamed.name = "Renamed discussion".to_string();

		let mock_db = get_mock_db_for_model(vec![get_default_schedule()])
			.append_query_results(vec![vec![renamed]])
			.append_exec_results(vec![sea_orm::MockExecResult {
				last_insert_id: 0,
				rows_affected: 1,
			}])
			.into_connection();

		let result = update_schedule("club-1", "sched-1", input, &mock_db).await;
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn delete_schedule_not_found() {
		let mock_db =
			get_mock_db_for_model::<book_club_schedule::Model>(vec![]).into_connection();

		let result = delete_schedule("club-1", "sched-1", &mock_db).await;
		assert!(result.is_err());
	}

	#[tokio::test]
	async fn delete_schedule_valid() {
		let mock_db = get_mock_db_for_model(vec![get_default_schedule()])
			.append_exec_results(vec![sea_orm::MockExecResult {
				last_insert_id: 0,
				rows_affected: 1,
			}])
			.into_connection();

		let result = delete_schedule("club-1", "sched-1", &mock_db).await;
		assert!(result.is_ok());
		assert_eq!(result.unwrap().id, "sched-1".to_string());
	}
}
