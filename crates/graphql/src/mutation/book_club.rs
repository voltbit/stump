use async_graphql::{Context, Object, Result, ID};
use models::{
	entity::{book_club, book_club_member, user::AuthUser},
	shared::{book_club::BookClubMemberRole, enums::UserPermission},
};
use sea_orm::{prelude::*, IntoActiveModel, TransactionTrait};

use crate::{
	data::{AuthContext, CoreContext},
	guard::{BookClubRoleGuard, PermissionGuard},
	input::book_club::{CreateBookClubInput, UpdateBookClubInput},
	mutation::book_club_discussion::create_general_discussion,
	object::book_club::BookClub,
};

#[derive(Default)]
pub struct BookClubMutation;

#[Object]
impl BookClubMutation {
	#[graphql(guard = "PermissionGuard::one(UserPermission::CreateBookClub)")]
	async fn create_book_club(
		&self,
		ctx: &Context<'_>,
		input: CreateBookClubInput,
	) -> Result<BookClub> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		// input.validate()?;

		let txn = conn.begin().await?;

		let (club, member) = input.into_active_model(user);

		let created_club = club.insert(&txn).await?;
		let _created_member = member.insert(&txn).await?;
		let _general_discussion =
			create_general_discussion(&created_club.id, &txn).await?;

		txn.commit().await?;

		Ok(created_club.into())
	}

	#[graphql(guard = "BookClubRoleGuard::new(id.as_ref(), BookClubMemberRole::Admin)")]
	async fn update_book_club(
		&self,
		ctx: &Context<'_>,
		id: ID,
		input: UpdateBookClubInput,
	) -> Result<BookClub> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let book_club = get_book_club_for_admin(user, &id, conn)
			.await?
			.ok_or("Book club not found or you lack permission to update")?;

		let active_model = input.apply(book_club.into_active_model());
		let updated_club = active_model.update(conn).await?;
		Ok(updated_club.into())
	}

	// Note: the guard above (like all `BookClubRoleGuard`s) only requires Admin-or-above
	// membership - `BookClubMemberRole::Creator` is the guard's *minimum*, and Creator is
	// merely the highest role, so an Admin would satisfy it too. Deletion is meant to be
	// stricter than that (see docs/rbac.mdx and the mobile settings screen, both of which
	// gate Delete on Creator specifically), so `ensure_can_delete_book_club` below performs
	// the real, Creator-only check in the resolver body, mirroring how
	// `remove_book_club_member` refuses to remove the Creator in-resolver rather than
	// relying solely on its guard.
	#[graphql(guard = "BookClubRoleGuard::new(id.as_ref(), BookClubMemberRole::Admin)")]
	async fn delete_book_club(&self, ctx: &Context<'_>, id: ID) -> Result<BookClub> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let book_club = get_book_club_for_admin(user, &id, conn)
			.await?
			.ok_or("Book club not found or you lack permission to update")?;

		let membership =
			book_club_member::Entity::find_by_club_for_user(user, id.as_ref())
				.one(conn)
				.await?;
		let actor_role = membership.map(|member| member.role).unwrap_or_default();

		ensure_can_delete_book_club(actor_role, user.is_server_owner)?;

		book_club.clone().delete(conn).await?;

		Ok(book_club.into())
	}
}

/// Only the Creator of a book club (or the server owner) may delete it. This is stricter
/// than every other club-management action, which are Admin-or-above (see
/// docs/rbac.mdx: "Admin ... cannot delete the book club"), and matches the mobile
/// settings screen, which gates the Delete action on Creator.
fn ensure_can_delete_book_club(
	actor_role: BookClubMemberRole,
	actor_is_server_owner: bool,
) -> Result<()> {
	if actor_role == BookClubMemberRole::Creator || actor_is_server_owner {
		Ok(())
	} else {
		Err("Only the creator can delete the book club".into())
	}
}

pub async fn get_book_club_for_admin(
	user: &AuthUser,
	id: &ID,
	conn: &DatabaseConnection,
) -> Result<Option<book_club::Model>> {
	Ok(book_club::Entity::find_for_member_enforce_role_and_id(
		user,
		BookClubMemberRole::Admin,
		id.as_ref(),
	)
	.one(conn)
	.await?)
}

#[cfg(test)]
mod tests {
	use crate::tests::common::*;

	use super::*;
	use pretty_assertions::assert_eq;

	fn get_default_book_club() -> book_club::Model {
		book_club::Model {
			id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".to_string(),
			name: "Test".to_string(),
			slug: "test".to_string(),
			description: None,
			is_private: false,
			member_role_spec: None,
			created_at: chrono::Utc::now().into(),
			emoji: None,
		}
	}

	#[tokio::test]
	async fn get_book_club_for_admin_no_result() {
		let book_club = get_default_book_club();
		let id: ID = book_club.id.clone().into();
		let user = get_default_user();
		let conn = get_mock_db_for_model::<book_club::Model>(vec![]).into_connection();

		let result = get_book_club_for_admin(&user, &id, &conn).await.unwrap();
		assert_eq!(result, None);
	}

	#[tokio::test]
	async fn get_book_club_for_admin_valid() {
		let book_club = get_default_book_club();
		let id: ID = book_club.id.clone().into();
		let user = get_default_user();
		let conn = get_mock_db_for_model(vec![book_club.clone()]).into_connection();

		let result = get_book_club_for_admin(&user, &id, &conn).await.unwrap();
		assert_eq!(result, Some(book_club));
	}

	#[test]
	fn ensure_can_delete_book_club_rejects_admin() {
		let result = ensure_can_delete_book_club(BookClubMemberRole::Admin, false);
		assert!(result.is_err());
	}

	#[test]
	fn ensure_can_delete_book_club_allows_creator() {
		let result = ensure_can_delete_book_club(BookClubMemberRole::Creator, false);
		assert!(result.is_ok());
	}

	#[test]
	fn ensure_can_delete_book_club_rejects_plain_member() {
		let result = ensure_can_delete_book_club(BookClubMemberRole::Member, false);
		assert!(result.is_err());
	}

	#[test]
	fn ensure_can_delete_book_club_allows_server_owner_without_creator_membership() {
		// A server owner may not have a book_club_member row of their own at all, in which
		// case `unwrap_or_default()` yields `BookClubMemberRole::Member` - the server-owner
		// bypass must still let them through.
		let result = ensure_can_delete_book_club(BookClubMemberRole::Member, true);
		assert!(result.is_ok());
	}
}
