use async_graphql::{Context, Object, Result, ID};
use models::{
	entity::{book_club_member, book_club_member_favorite_book},
	shared::book_club::BookClubMemberRole,
};
use sea_orm::{prelude::*, sea_query::OnConflict, IntoActiveModel, Set};

use crate::{
	data::{AuthContext, CoreContext},
	guard::BookClubRoleGuard,
	input::book_club::{
		CreateBookClubMemberInput, SetBookClubMemberFavoriteBookInput,
		UpdateMemberProfileInput,
	},
	object::{
		book_club_member::BookClubMember,
		book_club_member_favorite_book::BookClubMemberFavoriteBook,
	},
};

#[derive(Default)]
pub struct BookClubMemberMutation;

#[Object]
impl BookClubMemberMutation {
	/// Creates a new member in the book club
	#[graphql(
		guard = "BookClubRoleGuard::new(book_club_id.as_ref(), BookClubMemberRole::Admin)"
	)]
	async fn create_book_club_member(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
		input: CreateBookClubMemberInput,
	) -> Result<BookClubMember> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		ensure_not_already_a_member(book_club_id.as_ref(), &input.user_id, conn).await?;

		let created_member = input
			.into_active_model(book_club_id.as_ref())
			.insert(conn)
			.await?;

		Ok(BookClubMember::from(created_member))
	}

	/// Removes a member from the book club
	#[graphql(
		guard = "BookClubRoleGuard::new(book_club_id.as_ref(), BookClubMemberRole::Admin)"
	)]
	async fn remove_book_club_member(
		&self,
		ctx: &Context<'_>,
		// Note: This is a false positive since we use it for the guard
		#[allow(unused_variables)] book_club_id: ID,
		member_id: ID,
	) -> Result<BookClubMember> {
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();
		let member = book_club_member::Entity::find_by_id(member_id.as_ref())
			.one(conn)
			.await?
			.ok_or("Member not found")?;

		if member.role == BookClubMemberRole::Creator {
			return Err("Cannot remove the creator of the book club".into());
		}

		member.clone().delete(conn).await?;

		Ok(BookClubMember::from(member))
	}

	/// Deletes the membership of the caller to the target book club
	async fn leave_book_club(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
	) -> Result<BookClubMember> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let member =
			book_club_member::Entity::find_by_club_for_user(user, book_club_id.as_ref())
				.one(conn)
				.await?
				.ok_or("You are not a member of this club or it does not exist")?;

		ensure_can_leave_book_club(member.role)?;

		member.clone().delete(conn).await?;

		Ok(BookClubMember::from(member))
	}

	/// Updates the caller's own member profile (display name, bio, hide progress) within
	/// a book club. A member may only ever update their own profile.
	async fn update_book_club_member_profile(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
		input: UpdateMemberProfileInput,
	) -> Result<BookClubMember> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let member =
			book_club_member::Entity::find_by_club_for_user(user, book_club_id.as_ref())
				.one(conn)
				.await?
				.ok_or("You are not a member of this club or it does not exist")?;

		let updated_member = input.apply(member.into_active_model()).update(conn).await?;

		Ok(BookClubMember::from(updated_member))
	}

	/// Sets (or replaces) the caller's own favorite book within a book club. Each member
	/// may have at most one favorite book; calling this again overwrites the previous one.
	async fn set_book_club_member_favorite_book(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
		input: SetBookClubMemberFavoriteBookInput,
	) -> Result<BookClubMemberFavoriteBook> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		input.validate()?;

		let member =
			book_club_member::Entity::find_by_club_for_user(user, book_club_id.as_ref())
				.one(conn)
				.await?
				.ok_or("You are not a member of this club or it does not exist")?;

		let saved_favorite = upsert_favorite_book(&member.id, input, conn).await?;

		Ok(BookClubMemberFavoriteBook::from(saved_favorite))
	}

	/// Changes another member's role within the club. Only Admins and above may call
	/// this. Beyond that: only the Creator may grant or revoke the Admin role, nobody
	/// can change the Creator's role or promote a member to Creator, and a member can
	/// never change their own role.
	#[graphql(
		guard = "BookClubRoleGuard::new(book_club_id.as_ref(), BookClubMemberRole::Admin)"
	)]
	async fn update_book_club_member_role(
		&self,
		ctx: &Context<'_>,
		book_club_id: ID,
		member_id: ID,
		role: BookClubMemberRole,
	) -> Result<BookClubMember> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let target = book_club_member::Entity::find_by_id(member_id.as_ref())
			.one(conn)
			.await?
			.ok_or("Member not found")?;

		if target.book_club_id != book_club_id.as_ref() {
			return Err("Member does not belong to this book club".into());
		}

		let actor_membership =
			book_club_member::Entity::find_by_club_for_user(user, book_club_id.as_ref())
				.one(conn)
				.await?;
		let actor_role = actor_membership
			.as_ref()
			.map(|member| member.role)
			.unwrap_or_default();
		let actor_member_id = actor_membership.as_ref().map(|member| member.id.as_str());

		validate_role_change(
			actor_member_id,
			actor_role,
			user.is_server_owner,
			&target,
			role,
		)?;

		let mut active_model = target.into_active_model();
		active_model.role = Set(role);
		let updated_member = active_model.update(conn).await?;

		Ok(BookClubMember::from(updated_member))
	}
}

/// Sets or replaces a member's favorite book as a single atomic upsert on the unique
/// `member_id` column, rather than a select-then-branch into insert/update: two
/// concurrent calls racing a select-based existence check could both observe "no
/// existing favorite" and both attempt an insert, tripping the unique constraint
/// instead of the intended "set or replace" behavior.
async fn upsert_favorite_book(
	member_id: &str,
	input: SetBookClubMemberFavoriteBookInput,
	conn: &DatabaseConnection,
) -> Result<book_club_member_favorite_book::Model> {
	Ok(
		book_club_member_favorite_book::Entity::insert(
			input.into_active_model(member_id),
		)
		.on_conflict(
			OnConflict::column(book_club_member_favorite_book::Column::MemberId)
				.update_columns([
					book_club_member_favorite_book::Column::BookId,
					book_club_member_favorite_book::Column::Title,
					book_club_member_favorite_book::Column::Author,
					book_club_member_favorite_book::Column::Url,
					book_club_member_favorite_book::Column::ImageUrl,
					book_club_member_favorite_book::Column::Notes,
				])
				.to_owned(),
		)
		.exec_with_returning(conn)
		.await?,
	)
}

/// Returns an error if `user_id` already has a membership row in the given book club.
/// There is no unique constraint on (book_club_id, user_id) at the DB level, so this must
/// be checked explicitly by every path that can create a membership row: direct creation
/// ([BookClubMemberMutation::create_book_club_member]) and invitation acceptance
/// (`accept_invitation` in the book_club_invitation mutation).
pub async fn ensure_not_already_a_member(
	book_club_id: &str,
	user_id: &str,
	conn: &DatabaseConnection,
) -> Result<()> {
	let existing =
		book_club_member::Entity::find_by_club_and_user_id(book_club_id, user_id)
			.one(conn)
			.await?;

	if existing.is_some() {
		return Err("This user is already a member of the book club".into());
	}

	Ok(())
}

/// Guards [BookClubMemberMutation::leave_book_club]: the Creator can never leave their own
/// club via this mutation, since doing so would orphan it (no other role can delete the
/// club or transfer the Creator role away). This mirrors remove_book_club_member's refusal
/// to remove the Creator - the same invariant, just reached through the member leaving
/// rather than being removed.
fn ensure_can_leave_book_club(role: BookClubMemberRole) -> Result<()> {
	if role == BookClubMemberRole::Creator {
		Err("The creator cannot leave the book club".into())
	} else {
		Ok(())
	}
}

/// Enforces the role-change permission matrix for [BookClubMemberMutation::update_book_club_member_role]:
/// - A member can never change their own role
/// - Nobody can change the Creator's role, or promote another member to Creator
/// - Only the Creator (or the server owner) may grant or revoke the Admin role; other
///   Admins may only move members between the remaining roles (Member/Moderator)
fn validate_role_change(
	actor_member_id: Option<&str>,
	actor_role: BookClubMemberRole,
	actor_is_server_owner: bool,
	target: &book_club_member::Model,
	new_role: BookClubMemberRole,
) -> Result<()> {
	if actor_member_id == Some(target.id.as_str()) {
		return Err("You cannot change your own role".into());
	}

	if target.role == BookClubMemberRole::Creator {
		return Err("Cannot change the creator's role".into());
	}

	if new_role == BookClubMemberRole::Creator {
		return Err("Cannot promote a member to creator".into());
	}

	let touches_admin_role =
		new_role == BookClubMemberRole::Admin || target.role == BookClubMemberRole::Admin;
	let creator_only_change =
		touches_admin_role && actor_role != BookClubMemberRole::Creator;

	if creator_only_change && !actor_is_server_owner {
		return Err("Only the creator can grant or revoke the admin role".into());
	}

	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;
	use sea_orm::{MockDatabase, MockExecResult};

	#[tokio::test]
	async fn upsert_favorite_book_performs_single_upsert_statement() {
		let saved = book_club_member_favorite_book::Model {
			id: "fav-1".to_string(),
			title: Some("Title".to_string()),
			author: Some("Author".to_string()),
			url: None,
			notes: None,
			member_id: "member-1".to_string(),
			book_id: None,
			image_url: None,
		};

		// Exactly one query-result set (for the returning select) and one exec-result
		// (for the insert/upsert statement) are provided. If this were still doing a
		// select-then-branch, the earlier existence check would consume the query
		// result meant for `exec_with_returning`, and this test would fail with an
		// "out of MockExecResults" or type-mismatch panic instead of asserting below.
		let conn = MockDatabase::new(sea_orm::DatabaseBackend::Sqlite)
			.append_query_results(vec![vec![saved.clone()]])
			.append_exec_results(vec![MockExecResult {
				last_insert_id: 1,
				rows_affected: 1,
			}])
			.into_connection();

		let input = SetBookClubMemberFavoriteBookInput {
			book_id: None,
			title: Some("Title".to_string()),
			author: Some("Author".to_string()),
			url: None,
			image_url: None,
			notes: None,
		};

		let result = upsert_favorite_book("member-1", input, &conn)
			.await
			.unwrap();
		assert_eq!(result, saved);
	}

	#[test]
	fn creator_cannot_leave_book_club() {
		let result = ensure_can_leave_book_club(BookClubMemberRole::Creator);
		assert!(result.is_err());
	}

	#[test]
	fn admin_can_leave_book_club() {
		let result = ensure_can_leave_book_club(BookClubMemberRole::Admin);
		assert!(result.is_ok());
	}

	#[test]
	fn member_can_leave_book_club() {
		let result = ensure_can_leave_book_club(BookClubMemberRole::Member);
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn ensure_not_already_a_member_allows_new_member() {
		let conn = MockDatabase::new(sea_orm::DatabaseBackend::Sqlite)
			.append_query_results::<book_club_member::Model, _, _>(vec![vec![]])
			.into_connection();

		let result = ensure_not_already_a_member("club-1", "user-1", &conn).await;
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn ensure_not_already_a_member_rejects_existing_membership() {
		let existing = get_member("member-1", BookClubMemberRole::Member);
		let conn = MockDatabase::new(sea_orm::DatabaseBackend::Sqlite)
			.append_query_results(vec![vec![existing]])
			.into_connection();

		let result = ensure_not_already_a_member("club-1", "user-member-1", &conn).await;
		assert!(result.is_err());
	}

	fn get_member(id: &str, role: BookClubMemberRole) -> book_club_member::Model {
		book_club_member::Model {
			id: id.to_string(),
			display_name: None,
			bio: None,
			hide_progress: false,
			role,
			joined_at: chrono::Utc::now().into(),
			user_id: format!("user-{id}"),
			book_club_id: "club-1".to_string(),
		}
	}

	#[test]
	fn cannot_change_own_role() {
		let target = get_member("member-1", BookClubMemberRole::Member);

		// Even a Creator acting on their own membership row is rejected
		let result = validate_role_change(
			Some("member-1"),
			BookClubMemberRole::Creator,
			false,
			&target,
			BookClubMemberRole::Moderator,
		);

		assert!(result.is_err());
	}

	#[test]
	fn cannot_change_creators_role() {
		let target = get_member("creator-1", BookClubMemberRole::Creator);

		let result = validate_role_change(
			Some("admin-1"),
			BookClubMemberRole::Admin,
			false,
			&target,
			BookClubMemberRole::Member,
		);

		assert!(result.is_err());
	}

	#[test]
	fn server_owner_cannot_change_creators_role() {
		let target = get_member("creator-1", BookClubMemberRole::Creator);

		// The "nobody" rule around the Creator's role is absolute, even for the server owner
		let result = validate_role_change(
			None,
			BookClubMemberRole::Member,
			true,
			&target,
			BookClubMemberRole::Admin,
		);

		assert!(result.is_err());
	}

	#[test]
	fn cannot_promote_to_creator() {
		let target = get_member("member-1", BookClubMemberRole::Member);

		let result = validate_role_change(
			Some("creator-1"),
			BookClubMemberRole::Creator,
			false,
			&target,
			BookClubMemberRole::Creator,
		);

		assert!(result.is_err());
	}

	#[test]
	fn server_owner_cannot_promote_to_creator() {
		let target = get_member("member-1", BookClubMemberRole::Member);

		let result = validate_role_change(
			None,
			BookClubMemberRole::Member,
			true,
			&target,
			BookClubMemberRole::Creator,
		);

		assert!(result.is_err());
	}

	#[test]
	fn admin_cannot_grant_admin() {
		let target = get_member("member-1", BookClubMemberRole::Member);

		let result = validate_role_change(
			Some("admin-1"),
			BookClubMemberRole::Admin,
			false,
			&target,
			BookClubMemberRole::Admin,
		);

		assert!(result.is_err());
	}

	#[test]
	fn admin_cannot_revoke_admin() {
		let target = get_member("admin-2", BookClubMemberRole::Admin);

		let result = validate_role_change(
			Some("admin-1"),
			BookClubMemberRole::Admin,
			false,
			&target,
			BookClubMemberRole::Member,
		);

		assert!(result.is_err());
	}

	#[test]
	fn admin_can_change_member_to_moderator() {
		let target = get_member("member-1", BookClubMemberRole::Member);

		let result = validate_role_change(
			Some("admin-1"),
			BookClubMemberRole::Admin,
			false,
			&target,
			BookClubMemberRole::Moderator,
		);

		assert!(result.is_ok());
	}

	#[test]
	fn admin_can_change_moderator_to_member() {
		let target = get_member("mod-1", BookClubMemberRole::Moderator);

		let result = validate_role_change(
			Some("admin-1"),
			BookClubMemberRole::Admin,
			false,
			&target,
			BookClubMemberRole::Member,
		);

		assert!(result.is_ok());
	}

	#[test]
	fn creator_can_grant_admin() {
		let target = get_member("member-1", BookClubMemberRole::Member);

		let result = validate_role_change(
			Some("creator-1"),
			BookClubMemberRole::Creator,
			false,
			&target,
			BookClubMemberRole::Admin,
		);

		assert!(result.is_ok());
	}

	#[test]
	fn creator_can_revoke_admin() {
		let target = get_member("admin-1", BookClubMemberRole::Admin);

		let result = validate_role_change(
			Some("creator-1"),
			BookClubMemberRole::Creator,
			false,
			&target,
			BookClubMemberRole::Moderator,
		);

		assert!(result.is_ok());
	}

	#[test]
	fn server_owner_can_grant_admin_without_membership() {
		let target = get_member("member-1", BookClubMemberRole::Member);

		// A server owner with no book_club_member row of their own (actor_member_id: None)
		// can still grant Admin
		let result = validate_role_change(
			None,
			BookClubMemberRole::Member,
			true,
			&target,
			BookClubMemberRole::Admin,
		);

		assert!(result.is_ok());
	}
}
