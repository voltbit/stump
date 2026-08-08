use super::book_club_member::BookClubMember;
use crate::data::{AuthContext, CoreContext};
use crate::object::book_club_book::BookClubBook;
use crate::object::book_club_discussion::BookClubDiscussion;
use crate::object::book_club_invitation::BookClubInvitation;
use crate::object::book_club_schedule::BookClubSchedule;
use crate::pagination::{
	get_paginated_results, PaginatedResponse, Pagination, PaginationValidator,
};
use async_graphql::{ComplexObject, Context, Json, Result, SimpleObject};
use models::entity::user::AuthUser;
use models::entity::{
	book_club, book_club_book, book_club_discussion, book_club_invitation,
	book_club_member, book_club_schedule,
};
use models::shared::book_club::{BookClubMemberRole, BookClubMemberRoleSpec};
use sea_orm::prelude::*;
use sea_orm::sea_query::Query;
use sea_orm::QueryOrder;

#[derive(Debug, SimpleObject)]
#[graphql(complex)]
pub struct BookClub {
	#[graphql(flatten)]
	model: book_club::Model,
}

impl From<book_club::Model> for BookClub {
	fn from(model: book_club::Model) -> Self {
		Self { model }
	}
}

#[ComplexObject]
impl BookClub {
	async fn role_spec(&self) -> Json<BookClubMemberRoleSpec> {
		Json(self.model.member_role_spec.clone().unwrap_or_default())
	}

	async fn creator(&self, ctx: &Context<'_>) -> Result<BookClubMember> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let creator = book_club_member::Entity::find()
			.filter(
				book_club_member::Column::BookClubId
					.eq(self.model.id.clone())
					.and(book_club_member::Column::Role.eq(BookClubMemberRole::Creator)),
			)
			.one(conn)
			.await?
			.ok_or_else(|| async_graphql::Error::new("Book club creator not found"))?;

		Ok(BookClubMember::from(creator))
	}

	/// The current book being read
	async fn current_book(&self, ctx: &Context<'_>) -> Result<Option<BookClubBook>> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let book = book_club_book::Entity::find_current_for_book_club_id(&self.model.id)
			.one(conn)
			.await?;

		Ok(book.map(BookClubBook::from))
	}

	/// The previous book that was read, if it exists
	async fn previous_book(&self, ctx: &Context<'_>) -> Result<Option<BookClubBook>> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let book = book_club_book::Entity::find()
			.filter(book_club_book::Column::BookClubId.eq(&self.model.id))
			.filter(book_club_book::Column::CompletedAt.is_not_null())
			.order_by_desc(book_club_book::Column::CompletedAt)
			.one(conn)
			.await?;

		Ok(book.map(BookClubBook::from))
	}

	// TODO: Pagination
	/// All previous books that were read, ordered by completion date (most recent first)
	async fn previous_books(&self, ctx: &Context<'_>) -> Result<Vec<BookClubBook>> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let books = book_club_book::Entity::find()
			.filter(book_club_book::Column::BookClubId.eq(&self.model.id))
			.filter(book_club_book::Column::CompletedAt.is_not_null())
			.order_by_desc(book_club_book::Column::CompletedAt)
			.all(conn)
			.await?;

		Ok(books.into_iter().map(BookClubBook::from).collect())
	}

	/// All books in the club's queue, ordered by position
	async fn books(
		&self,
		ctx: &Context<'_>,
		#[graphql(default, validator(custom = "PaginationValidator"))]
		pagination: Pagination,
	) -> Result<PaginatedResponse<BookClubBook>> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();
		get_paginated_books_for_club(&self.model.id, conn, pagination).await
	}

	/// All schedules configured for this book club
	//
	// NOTE(guard-asymmetry, intentional): this field is unguarded beyond the club-visibility
	// check already enforced by `bookClubById`, matching the sibling `books`/`members` fields
	// on this object - reachability here follows "can you see the club" convention. The
	// standalone `bookClubSchedules` query in `query/book_club_schedule.rs` additionally
	// applies a `BookClubRoleGuard` (Member role) because it's a direct API entry point with
	// no other access check upstream. Do not "fix" this by adding a role guard here, or by
	// removing the one on the standalone query - the two are deliberately asymmetric.
	async fn schedules(&self, ctx: &Context<'_>) -> Result<Vec<BookClubSchedule>> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let schedules = book_club_schedule::Entity::find_for_book_club_id(&self.model.id)
			.all(conn)
			.await?;

		Ok(schedules.into_iter().map(BookClubSchedule::from).collect())
	}

	async fn invitations(&self, ctx: &Context<'_>) -> Result<Vec<BookClubInvitation>> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();
		let book_club_invitations =
			book_club_invitation::Entity::find_for_book_club_id(&self.model.id.clone())
				.into_model::<book_club_invitation::Model>()
				.all(conn)
				.await?;

		Ok(book_club_invitations
			.into_iter()
			.map(BookClubInvitation::from)
			.collect())
	}

	async fn members(
		&self,
		ctx: &Context<'_>,
		#[graphql(default, validator(custom = "PaginationValidator"))]
		pagination: Pagination,
	) -> Result<PaginatedResponse<BookClubMember>> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();
		get_paginated_members_for_club(user, &self.model.id, conn, pagination).await
	}

	async fn moderators(&self, ctx: &Context<'_>) -> Result<Vec<BookClubMember>> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let book_club_members =
			book_club_member::Entity::find_members_accessible_to_user_for_book_club_id(
				user,
				&self.model.id.clone(),
			)
			.filter(book_club_member::Column::Role.eq(BookClubMemberRole::Moderator))
			.into_model::<book_club_member::Model>()
			.all(conn)
			.await?;

		Ok(book_club_members
			.into_iter()
			.map(BookClubMember::from)
			.collect())
	}

	async fn members_count(&self, ctx: &Context<'_>) -> Result<u64> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();
		let count =
			book_club_member::Entity::find_members_accessible_to_user_for_book_club_id(
				user,
				&self.model.id.clone(),
			)
			.count(conn)
			.await?;

		Ok(count)
	}

	async fn membership(&self, ctx: &Context<'_>) -> Result<Option<BookClubMember>> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let membership = book_club_member::Entity::find()
			.filter(
				book_club_member::Column::BookClubId
					.eq(self.model.id.clone())
					.and(book_club_member::Column::UserId.eq(user.id.clone())),
			)
			.into_model::<book_club_member::Model>()
			.one(conn)
			.await?;

		Ok(membership.map(BookClubMember::from))
	}

	/// Get discussions that are pinned for this book club
	async fn pinned_discussions(
		&self,
		ctx: &Context<'_>,
	) -> Result<Vec<BookClubDiscussion>> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let discussions = book_club_discussion::Entity::find()
			.filter(book_club_discussion::Column::BookClubId.eq(&self.model.id))
			.filter(book_club_discussion::Column::IsPinned.eq(true))
			.order_by_asc(book_club_discussion::Column::CreatedAt)
			.all(conn)
			.await?;

		Ok(discussions
			.into_iter()
			.map(BookClubDiscussion::from)
			.collect())
	}

	async fn previous_discussions_count(&self, ctx: &Context<'_>) -> Result<u64> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let current_book_position =
			match book_club_book::Entity::get_current_or_next_position(
				&self.model.id,
				conn,
			)
			.await?
			{
				Some(pos) => pos,
				// No books exist at all, so there can be no previous discussions
				None => return Ok(0),
			};

		let count = book_club_discussion::Entity::find()
			.filter(book_club_discussion::Column::BookClubId.eq(&self.model.id))
			.filter(book_club_discussion::Column::IsPinned.eq(false))
			// If the discussion is linked to a book, it should only count if it is linked to a book BEFORE
			// the current book.
			.filter(
				book_club_discussion::Column::BookClubBookId
					.is_not_null()
					.and(
						book_club_discussion::Column::BookClubBookId.in_subquery(
							Query::select()
								.column(book_club_book::Column::Id)
								.from(book_club_book::Entity)
								.and_where(
									sea_orm::sea_query::Expr::col(
										book_club_book::Column::BookClubId,
									)
									.eq(self.model.id.clone()),
								)
								.and_where(
									sea_orm::sea_query::Expr::col(
										book_club_book::Column::Position,
									)
									.lt(current_book_position),
								)
								.take(),
						),
					),
			)
			.count(conn)
			.await?;

		Ok(count)
	}
}

/// Fetches a page of the books in a club's queue, ordered by position. The `position`
/// column is used as the cursor column (rather than `id`) so that cursor pagination
/// stays consistent with the queue order even after `reorderBooks` reassigns positions.
async fn get_paginated_books_for_club(
	book_club_id: &str,
	conn: &DatabaseConnection,
	pagination: Pagination,
) -> Result<PaginatedResponse<BookClubBook>> {
	let query = book_club_book::Entity::find_for_book_club_id(book_club_id);

	get_paginated_results(
		query,
		book_club_book::Column::Position,
		conn,
		pagination,
		|model: &book_club_book::Model| model.position.to_string(),
	)
	.await
}

/// Fetches a page of the members accessible to the requesting user for a club, ordered
/// by `id` for stable pagination.
async fn get_paginated_members_for_club(
	user: &AuthUser,
	book_club_id: &str,
	conn: &DatabaseConnection,
	pagination: Pagination,
) -> Result<PaginatedResponse<BookClubMember>> {
	let query =
		book_club_member::Entity::find_members_accessible_to_user_for_book_club_id(
			user,
			book_club_id,
		)
		.order_by_asc(book_club_member::Column::Id);

	get_paginated_results(
		query,
		book_club_member::Column::Id,
		conn,
		pagination,
		|model: &book_club_member::Model| model.id.clone(),
	)
	.await
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::pagination::{CursorPagination, OffsetPagination, PaginationInfo};
	use crate::tests::common::get_default_user;
	use sea_orm::{DatabaseBackend::Sqlite, MockDatabase, Value};

	fn get_test_book(id: &str, position: i32) -> book_club_book::Model {
		book_club_book::Model {
			id: id.to_string(),
			position,
			completed_at: None,
			title: Some("Test Book".to_string()),
			author: Some("Test Author".to_string()),
			url: None,
			image_url: None,
			book_entity_id: None,
			book_club_id: "club-1".to_string(),
			added_at: chrono::Utc::now().into(),
		}
	}

	fn get_test_member(id: &str) -> book_club_member::Model {
		book_club_member::Model {
			id: id.to_string(),
			display_name: Some("Tester".to_string()),
			bio: None,
			hide_progress: false,
			role: BookClubMemberRole::Member,
			joined_at: chrono::Utc::now().into(),
			user_id: format!("user-{id}"),
			book_club_id: "club-1".to_string(),
		}
	}

	mod books {
		use super::*;

		#[tokio::test]
		async fn cursor_pagination_orders_by_position_and_reports_next_cursor() {
			let mock_db = MockDatabase::new(Sqlite)
				// The "find last row for cursor" lookup, matching position=1
				.append_query_results(vec![vec![get_test_book("book-1", 1)]])
				// The actual page of results after the cursor
				.append_query_results(vec![vec![get_test_book("book-2", 2)]])
				.into_connection();

			let pagination = Pagination::Cursor(CursorPagination {
				after: Some("1".to_string()),
				limit: 1,
			});

			let result = get_paginated_books_for_club("club-1", &mock_db, pagination)
				.await
				.unwrap();

			assert_eq!(result.nodes.len(), 1);
			assert_eq!(result.nodes[0].model.id, "book-2");

			match result.page_info {
				PaginationInfo::Cursor(info) => {
					assert_eq!(info.current_cursor, Some("1".to_string()));
					// A full page (== limit) was returned, so another page may exist
					assert_eq!(info.next_cursor, Some("2".to_string()));
				},
				_ => panic!("Expected cursor pagination info"),
			}
		}

		#[tokio::test]
		async fn cursor_pagination_errors_when_cursor_not_found() {
			let mock_db = MockDatabase::new(Sqlite)
				.append_query_results::<book_club_book::Model, _, _>(vec![vec![]])
				.into_connection();

			let pagination = Pagination::Cursor(CursorPagination {
				after: Some("missing".to_string()),
				limit: 1,
			});

			let result =
				get_paginated_books_for_club("club-1", &mock_db, pagination).await;
			assert!(result.is_err());
		}

		#[tokio::test]
		async fn offset_pagination_preserves_position_order() {
			let mock_db = MockDatabase::new(Sqlite)
				.append_query_results(vec![vec![maplit::btreemap! {
					"num_items" => Into::<Value>::into(2),
				}]])
				.append_query_results(vec![vec![
					get_test_book("book-1", 1),
					get_test_book("book-2", 2),
				]])
				.into_connection();

			let pagination = Pagination::Offset(OffsetPagination {
				page: 1,
				page_size: Some(20),
				zero_based: None,
			});

			let result = get_paginated_books_for_club("club-1", &mock_db, pagination)
				.await
				.unwrap();

			assert_eq!(result.nodes.len(), 2);
			assert_eq!(result.nodes[0].model.id, "book-1");
			assert_eq!(result.nodes[1].model.id, "book-2");

			match result.page_info {
				PaginationInfo::Offset(info) => {
					assert_eq!(info.total_items, 2);
					assert_eq!(info.current_page, 1);
				},
				_ => panic!("Expected offset pagination info"),
			}
		}
	}

	mod members {
		use super::*;

		#[tokio::test]
		async fn offset_pagination_returns_accessible_members() {
			let user = get_default_user();
			let mock_db = MockDatabase::new(Sqlite)
				.append_query_results(vec![vec![maplit::btreemap! {
					"num_items" => Into::<Value>::into(1),
				}]])
				.append_query_results(vec![vec![get_test_member("member-1")]])
				.into_connection();

			let pagination = Pagination::Offset(OffsetPagination {
				page: 1,
				page_size: Some(20),
				zero_based: None,
			});

			let result =
				get_paginated_members_for_club(&user, "club-1", &mock_db, pagination)
					.await
					.unwrap();

			assert_eq!(result.nodes.len(), 1);
			assert_eq!(result.nodes[0].model.id, "member-1");
		}

		#[tokio::test]
		async fn cursor_pagination_returns_next_cursor_when_page_is_full() {
			let user = get_default_user();
			let mock_db = MockDatabase::new(Sqlite)
				.append_query_results(vec![vec![get_test_member("member-1")]])
				.into_connection();

			let pagination = Pagination::Cursor(CursorPagination {
				after: None,
				limit: 1,
			});

			let result =
				get_paginated_members_for_club(&user, "club-1", &mock_db, pagination)
					.await
					.unwrap();

			assert_eq!(result.nodes.len(), 1);
			match result.page_info {
				PaginationInfo::Cursor(info) => {
					assert_eq!(info.current_cursor, Some("member-1".to_string()));
					assert_eq!(info.next_cursor, Some("member-1".to_string()));
				},
				_ => panic!("Expected cursor pagination info"),
			}
		}
	}
}
