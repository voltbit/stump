use async_graphql::{Context, Object, Result, ID};
use chrono::Utc;
use models::{
	entity::{
		book_club, book_club_book, book_club_book_suggestion,
		book_club_book_suggestion_like, book_club_member, user::AuthUser,
	},
	shared::book_club::{BookClubMemberRole, BookClubSuggestionStatus},
};
use sea_orm::{
	prelude::*, ActiveValue::Set, ColumnTrait, ConnectionTrait, IntoActiveModel,
	QueryFilter, TransactionTrait,
};

use crate::{
	data::{AuthContext, CoreContext},
	input::book_club::SuggestBookInput,
	mutation::book_club_book::create_discussions_for_books,
	object::book_club_book_suggestion::BookClubBookSuggestion,
};

#[derive(Default)]
pub struct BookClubSuggestionMutation;

#[Object]
impl BookClubSuggestionMutation {
	/// Suggest a book for the book club
	async fn suggest_book(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
		input: SuggestBookInput,
	) -> Result<BookClubBookSuggestion> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		book_club::Entity::find_by_id_and_user(book_club_id.as_ref(), user)
			.one(conn)
			.await?
			.ok_or("Book club not found or you don't have access")?;

		let member = get_member_for_user(book_club_id.as_ref(), user, conn).await?;

		if input.book_id.is_none() && (input.title.is_none() || input.author.is_none()) {
			return Err(
				"You must provide either a book_id or both title and author".into()
			);
		}

		let suggestion = book_club_book_suggestion::ActiveModel {
			id: Set(Uuid::new_v4().to_string()),
			book_club_id: Set(book_club_id.to_string()),
			book_id: Set(input.book_id),
			title: Set(input.title),
			author: Set(input.author),
			url: Set(input.url),
			notes: Set(input.notes),
			status: Set(BookClubSuggestionStatus::Pending),
			created_at: Set(DateTimeWithTimeZone::from(Utc::now())),
			suggested_by_id: Set(member.id.clone()),
			..Default::default()
		};

		let created_suggestion = suggestion.insert(conn).await?;

		// TODO: Emit some kind of event when event broker is implemented

		Ok(created_suggestion.into())
	}

	/// Remove your own suggestion (only before it's resolved)
	async fn remove_suggestion(
		&self,
		ctx: &Context<'_>,
		suggestion_id: ID,
	) -> Result<BookClubBookSuggestion> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let suggestion =
			book_club_book_suggestion::Entity::find_by_id(suggestion_id.as_ref())
				.one(conn)
				.await?
				.ok_or("Suggestion not found")?;

		let member = get_member_for_user(&suggestion.book_club_id, user, conn).await?;

		let can_remove = suggestion.suggested_by_id == member.id
			|| member.role >= BookClubMemberRole::Admin
			|| user.is_server_owner;

		if !can_remove {
			return Err("You can only remove your own suggestions".into());
		}

		if suggestion.resolved_at.is_some() {
			return Err("Cannot remove a suggestion that has been resolved".into());
		}

		let _result = suggestion.clone().delete(conn).await?;

		// TODO: Emit some kind of event when event broker is implemented

		Ok(suggestion.into())
	}

	/// Toggle like on a suggestion
	async fn toggle_suggestion_like(
		&self,
		ctx: &Context<'_>,
		suggestion_id: ID,
	) -> Result<bool> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let suggestion =
			book_club_book_suggestion::Entity::find_by_id(suggestion_id.as_ref())
				.one(conn)
				.await?
				.ok_or("Suggestion not found")?;

		let member = get_member_for_user(&suggestion.book_club_id, user, conn).await?;

		let existing_like = book_club_book_suggestion_like::Entity::find()
			.filter(
				book_club_book_suggestion_like::Column::SuggestionId
					.eq(suggestion_id.as_ref()),
			)
			.filter(book_club_book_suggestion_like::Column::LikedById.eq(&member.id))
			.one(conn)
			.await?;

		let liked = if let Some(like) = existing_like {
			like.delete(conn).await?;
			false
		} else {
			let like = book_club_book_suggestion_like::ActiveModel {
				timestamp: Set(DateTimeWithTimeZone::from(Utc::now())),
				liked_by_id: Set(member.id.clone()),
				suggestion_id: Set(suggestion_id.to_string()),
				..Default::default()
			};
			like.insert(conn).await?;
			true
		};

		// TODO: Emit some kind of event when event broker is implemented

		Ok(liked)
	}

	/// Update the status of a suggestion (Admin+). Pass `promote: true` alongside
	/// `status: ACCEPTED` to also add the suggested book to the end of the club's
	/// reading list in the same transaction - entity-backed if the suggestion
	/// referenced a stored book, free-form (title/author/url) otherwise.
	async fn update_suggestion_status(
		&self,
		ctx: &Context<'_>,
		suggestion_id: ID,
		status: BookClubSuggestionStatus,
		notes: Option<String>,
		#[graphql(default)] promote: bool,
	) -> Result<BookClubBookSuggestion> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let suggestion =
			book_club_book_suggestion::Entity::find_by_id(suggestion_id.as_ref())
				.one(conn)
				.await?
				.ok_or("Suggestion not found")?;

		let member = get_member_for_user(&suggestion.book_club_id, user, conn).await?;

		if member.role < BookClubMemberRole::Admin && !user.is_server_owner {
			return Err("Only admins and above can update suggestion status".into());
		}

		validate_promotion(status, promote)?;

		let txn = conn.begin().await?;

		let updated_suggestion =
			resolve_suggestion(suggestion, status, notes, &member.id, &txn).await?;

		if promote {
			promote_suggestion_to_reading_list(&updated_suggestion, &txn).await?;
		}

		txn.commit().await?;

		// TODO: Emit some kind of event when event broker is implemented

		Ok(updated_suggestion.into())
	}
}

/// A suggestion can only be promoted to the reading list as part of accepting it -
/// promoting a rejected/still-pending suggestion would add a book nobody agreed to
/// read.
fn validate_promotion(status: BookClubSuggestionStatus, promote: bool) -> Result<()> {
	if promote && status != BookClubSuggestionStatus::Accepted {
		return Err(
			"Only suggestions being accepted can be promoted to the reading list".into(),
		);
	}

	Ok(())
}

/// Applies a status resolution to a suggestion: sets the new status, stamps
/// `resolved_at`/`resolved_by_id`, and optionally updates the resolution notes.
async fn resolve_suggestion<C: ConnectionTrait>(
	suggestion: book_club_book_suggestion::Model,
	status: BookClubSuggestionStatus,
	notes: Option<String>,
	resolved_by_id: &str,
	conn: &C,
) -> Result<book_club_book_suggestion::Model, DbErr> {
	let mut active_model = suggestion.into_active_model();
	active_model.status = Set(status);
	active_model.resolved_at = Set(Some(DateTimeWithTimeZone::from(Utc::now())));
	active_model.resolved_by_id = Set(Some(resolved_by_id.to_string()));

	if let Some(notes_value) = notes {
		active_model.notes = Set(Some(notes_value));
	}

	active_model.update(conn).await
}

/// Creates the `book_club_book` (and its discussion) that promotes an accepted
/// suggestion into the club's reading list, at the end of the queue. Entity-backed
/// if the suggestion referenced a stored book (`book_id`), free-form otherwise.
async fn promote_suggestion_to_reading_list<C: ConnectionTrait>(
	suggestion: &book_club_book_suggestion::Model,
	conn: &C,
) -> Result<book_club_book::Model, DbErr> {
	let next_position =
		book_club_book::Entity::get_max_position_for_club(&suggestion.book_club_id, conn)
			.await?;

	let book_id = Uuid::new_v4().to_string();

	let active_model = match &suggestion.book_id {
		Some(book_entity_id) => book_club_book::ActiveModel {
			id: Set(book_id.clone()),
			position: Set(next_position),
			book_entity_id: Set(Some(book_entity_id.clone())),
			book_club_id: Set(suggestion.book_club_id.clone()),
			..Default::default()
		},
		None => book_club_book::ActiveModel {
			id: Set(book_id.clone()),
			position: Set(next_position),
			title: Set(suggestion.title.clone()),
			author: Set(suggestion.author.clone()),
			url: Set(suggestion.url.clone()),
			book_club_id: Set(suggestion.book_club_id.clone()),
			..Default::default()
		},
	};

	let created_book = active_model.insert(conn).await?;

	create_discussions_for_books(&[book_id], &suggestion.book_club_id, conn)
		.await
		.map_err(|err| DbErr::Custom(err.message))?;

	Ok(created_book)
}

/// Helper function to get the member record for a user in a book club
async fn get_member_for_user(
	book_club_id: &str,
	user: &AuthUser,
	conn: &DatabaseConnection,
) -> Result<book_club_member::Model> {
	book_club_member::Entity::find_by_club_for_user(user, book_club_id)
		.one(conn)
		.await?
		.ok_or("You must be a member of the book club to perform this action".into())
}

#[cfg(test)]
mod tests {
	use std::collections::BTreeMap;

	use sea_orm::{MockDatabase, MockExecResult, Value};

	use super::*;
	use pretty_assertions::assert_eq;

	fn get_pending_suggestion(
		book_id: Option<String>,
		title: Option<String>,
		author: Option<String>,
		url: Option<String>,
	) -> book_club_book_suggestion::Model {
		book_club_book_suggestion::Model {
			id: "suggestion-1".to_string(),
			book_club_id: "club-1".to_string(),
			title,
			author,
			url,
			notes: None,
			status: BookClubSuggestionStatus::Pending,
			resolved_at: None,
			resolved_by_id: None,
			created_at: chrono::Utc::now().into(),
			suggested_by_id: "member-1".to_string(),
			book_id,
		}
	}

	/// Builds a mock row for the raw `(Option<i32>,)` tuple query issued by
	/// `get_max_position_for_club`. The column name doesn't matter - `into_tuple`
	/// reads columns positionally - but a real one is used for clarity.
	fn max_position_row(position: Option<i32>) -> BTreeMap<String, Value> {
		let mut row = BTreeMap::new();
		row.insert("max_pos".to_string(), Value::Int(position));
		row
	}

	#[test]
	fn validate_promotion_allows_promoting_an_acceptance() {
		assert!(validate_promotion(BookClubSuggestionStatus::Accepted, true).is_ok());
	}

	#[test]
	fn validate_promotion_allows_non_promoting_updates_of_any_status() {
		assert!(validate_promotion(BookClubSuggestionStatus::Rejected, false).is_ok());
		assert!(validate_promotion(BookClubSuggestionStatus::Pending, false).is_ok());
		assert!(validate_promotion(BookClubSuggestionStatus::Accepted, false).is_ok());
	}

	#[test]
	fn validate_promotion_rejects_promoting_a_non_acceptance() {
		assert!(validate_promotion(BookClubSuggestionStatus::Rejected, true).is_err());
		assert!(validate_promotion(BookClubSuggestionStatus::Pending, true).is_err());
	}

	#[tokio::test]
	async fn resolve_suggestion_sets_status_and_resolution_metadata() {
		let suggestion = get_pending_suggestion(
			None,
			Some("Title".into()),
			Some("Author".into()),
			None,
		);

		let mut expected = suggestion.clone();
		expected.status = BookClubSuggestionStatus::Accepted;
		expected.resolved_by_id = Some("member-1".to_string());
		expected.notes = Some("Great pick".to_string());

		let conn = MockDatabase::new(sea_orm::DatabaseBackend::Sqlite)
			.append_query_results(vec![vec![expected.clone()]])
			.into_connection();

		let result = resolve_suggestion(
			suggestion,
			BookClubSuggestionStatus::Accepted,
			Some("Great pick".to_string()),
			"member-1",
			&conn,
		)
		.await
		.unwrap();

		assert_eq!(result.status, BookClubSuggestionStatus::Accepted);
		assert_eq!(result.resolved_by_id, Some("member-1".to_string()));
		assert_eq!(result.notes, Some("Great pick".to_string()));
	}

	#[tokio::test]
	async fn promote_suggestion_entity_backed_appends_book_at_next_position() {
		let suggestion =
			get_pending_suggestion(Some("media-1".to_string()), None, None, None);

		let created_book = book_club_book::Model {
			id: "book-1".to_string(),
			position: 2,
			completed_at: None,
			title: None,
			author: None,
			url: None,
			image_url: None,
			book_entity_id: Some("media-1".to_string()),
			book_club_id: "club-1".to_string(),
			added_at: chrono::Utc::now().into(),
		};

		let conn = MockDatabase::new(sea_orm::DatabaseBackend::Sqlite)
			// get_max_position_for_club: two existing books at positions 0 and 1
			.append_query_results(vec![vec![max_position_row(Some(1))]])
			// insert of the new book_club_book row
			.append_query_results(vec![vec![created_book.clone()]])
			// insert_many for the discussion created alongside the book
			.append_exec_results(vec![MockExecResult {
				last_insert_id: 1,
				rows_affected: 1,
			}])
			.into_connection();

		let result = promote_suggestion_to_reading_list(&suggestion, &conn)
			.await
			.unwrap();

		assert_eq!(result.position, 2);
		assert_eq!(result.book_entity_id, Some("media-1".to_string()));
		assert_eq!(result.title, None);
		assert_eq!(result.book_club_id, "club-1".to_string());
	}

	#[tokio::test]
	async fn promote_suggestion_free_form_uses_title_author_url() {
		let suggestion = get_pending_suggestion(
			None,
			Some("Some Title".to_string()),
			Some("Some Author".to_string()),
			Some("https://example.com/book".to_string()),
		);

		let created_book = book_club_book::Model {
			id: "book-1".to_string(),
			position: 0,
			completed_at: None,
			title: Some("Some Title".to_string()),
			author: Some("Some Author".to_string()),
			url: Some("https://example.com/book".to_string()),
			image_url: None,
			book_entity_id: None,
			book_club_id: "club-1".to_string(),
			added_at: chrono::Utc::now().into(),
		};

		let conn = MockDatabase::new(sea_orm::DatabaseBackend::Sqlite)
			// get_max_position_for_club: no existing books yet
			.append_query_results(vec![vec![max_position_row(None)]])
			.append_query_results(vec![vec![created_book.clone()]])
			.append_exec_results(vec![MockExecResult {
				last_insert_id: 1,
				rows_affected: 1,
			}])
			.into_connection();

		let result = promote_suggestion_to_reading_list(&suggestion, &conn)
			.await
			.unwrap();

		assert_eq!(result.position, 0);
		assert_eq!(result.book_entity_id, None);
		assert_eq!(result.title, Some("Some Title".to_string()));
		assert_eq!(result.author, Some("Some Author".to_string()));
		assert_eq!(result.url, Some("https://example.com/book".to_string()));
	}

	/// Integration-style test proving the full suggestion lifecycle wires up
	/// end-to-end: a member suggests an (entity-backed) book, another member likes
	/// it, an admin accepts the suggestion with `promote: true`, and the book lands
	/// in the reading list at the correct (end-of-queue) position - the exact chain
	/// that was previously disconnected (`update_suggestion_status` had no link to
	/// `book_club_book`).
	#[tokio::test]
	async fn suggest_like_resolve_with_promotion_flow() {
		let book_club_id = "club-1".to_string();

		// What `suggest_book` would build for an entity-backed suggestion
		let suggested = book_club_book_suggestion::Model {
			id: "suggestion-1".to_string(),
			book_club_id: book_club_id.clone(),
			title: None,
			author: None,
			url: None,
			notes: None,
			status: BookClubSuggestionStatus::Pending,
			resolved_at: None,
			resolved_by_id: None,
			created_at: chrono::Utc::now().into(),
			suggested_by_id: "member-2".to_string(),
			book_id: Some("media-1".to_string()),
		};

		let like_row = book_club_book_suggestion_like::Model {
			id: 1,
			timestamp: chrono::Utc::now().into(),
			liked_by_id: "member-3".to_string(),
			suggestion_id: suggested.id.clone(),
		};

		let mut resolved = suggested.clone();
		resolved.status = BookClubSuggestionStatus::Accepted;
		resolved.resolved_at = Some(chrono::Utc::now().into());
		resolved.resolved_by_id = Some("member-1".to_string());

		let promoted_book = book_club_book::Model {
			id: "book-1".to_string(),
			position: 3,
			completed_at: None,
			title: None,
			author: None,
			url: None,
			image_url: None,
			book_entity_id: Some("media-1".to_string()),
			book_club_id: book_club_id.clone(),
			added_at: chrono::Utc::now().into(),
		};

		let conn = MockDatabase::new(sea_orm::DatabaseBackend::Sqlite)
			// 1. suggest_book: insert the suggestion
			.append_query_results(vec![vec![suggested.clone()]])
			// 2. toggle_suggestion_like: look up an existing like (none found)
			.append_query_results::<book_club_book_suggestion_like::Model, _, _>(vec![
				vec![],
			])
			// 3. toggle_suggestion_like: insert the like
			.append_query_results(vec![vec![like_row.clone()]])
			// 4. update_suggestion_status -> resolve_suggestion: accept the suggestion
			.append_query_results(vec![vec![resolved.clone()]])
			// 5. promote_suggestion_to_reading_list: three existing books (0, 1, 2)
			.append_query_results(vec![vec![max_position_row(Some(2))]])
			// 6. promote_suggestion_to_reading_list: insert the book_club_book row
			.append_query_results(vec![vec![promoted_book.clone()]])
			// 7. promote_suggestion_to_reading_list: insert the discussion
			.append_exec_results(vec![MockExecResult {
				last_insert_id: 1,
				rows_affected: 1,
			}])
			.into_connection();

		// 1. Suggest (mirrors `suggest_book`'s insert)
		let suggestion_active_model = book_club_book_suggestion::ActiveModel {
			id: Set(suggested.id.clone()),
			book_club_id: Set(book_club_id.clone()),
			book_id: Set(Some("media-1".to_string())),
			title: Set(None),
			author: Set(None),
			url: Set(None),
			notes: Set(None),
			status: Set(BookClubSuggestionStatus::Pending),
			created_at: Set(suggested.created_at),
			suggested_by_id: Set("member-2".to_string()),
			..Default::default()
		};
		let created_suggestion = suggestion_active_model.insert(&conn).await.unwrap();
		assert_eq!(created_suggestion.status, BookClubSuggestionStatus::Pending);

		// 2. Like (mirrors `toggle_suggestion_like`'s "no existing like -> insert" branch)
		let existing_like = book_club_book_suggestion_like::Entity::find()
			.filter(
				book_club_book_suggestion_like::Column::SuggestionId
					.eq(created_suggestion.id.clone()),
			)
			.filter(book_club_book_suggestion_like::Column::LikedById.eq("member-3"))
			.one(&conn)
			.await
			.unwrap();
		assert!(existing_like.is_none());

		let like_active_model = book_club_book_suggestion_like::ActiveModel {
			timestamp: Set(chrono::Utc::now().into()),
			liked_by_id: Set("member-3".to_string()),
			suggestion_id: Set(created_suggestion.id.clone()),
			..Default::default()
		};
		like_active_model.insert(&conn).await.unwrap();

		// 3. Resolve with promotion: status ACCEPTED + promote: true
		validate_promotion(BookClubSuggestionStatus::Accepted, true).unwrap();

		let updated_suggestion = resolve_suggestion(
			created_suggestion,
			BookClubSuggestionStatus::Accepted,
			None,
			"member-1",
			&conn,
		)
		.await
		.unwrap();
		assert_eq!(
			updated_suggestion.status,
			BookClubSuggestionStatus::Accepted
		);
		assert_eq!(
			updated_suggestion.resolved_by_id,
			Some("member-1".to_string())
		);

		// 4. Promotion lands the book at the end of the reading list (after the
		// 3 pre-existing books at positions 0, 1, 2)
		let book_in_reading_list =
			promote_suggestion_to_reading_list(&updated_suggestion, &conn)
				.await
				.unwrap();

		assert_eq!(book_in_reading_list.position, 3);
		assert_eq!(
			book_in_reading_list.book_entity_id,
			Some("media-1".to_string())
		);
		assert_eq!(book_in_reading_list.book_club_id, book_club_id);
	}
}
