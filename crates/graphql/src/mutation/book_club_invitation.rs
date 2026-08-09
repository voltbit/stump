use async_graphql::{Context, Object, Result, ID};
use models::{
	entity::{book_club_invitation, book_club_member, user::AuthUser},
	shared::book_club::BookClubMemberRole,
};
use sea_orm::{prelude::*, Set};

use crate::{
	data::{AuthContext, CoreContext},
	input::book_club::{
		BookClubInvitationInput, BookClubInvitationResponseInput,
		BookClubInvitationResponseValidator, BookClubMemberInput,
	},
	mutation::{
		book_club::get_book_club_for_admin, book_club_member::ensure_not_already_a_member,
	},
	object::book_club_invitation::BookClubInvitation,
};

#[derive(Default)]
pub struct BookClubInvitationMutation;

#[Object]
impl BookClubInvitationMutation {
	async fn create_book_club_invitation(
		&self,
		ctx: &Context<'_>,
		id: ID,
		input: BookClubInvitationInput,
	) -> Result<BookClubInvitation> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		validate_book_club_invitation_input(user, &id, &input, conn).await?;

		let created_invitation = create_invitation_active_model(&id, &input)
			.insert(conn)
			.await?;

		Ok(created_invitation.into())
	}

	async fn respond_to_book_club_invitation(
		&self,
		ctx: &Context<'_>,
		id: ID,
		#[graphql(validator(custom = "BookClubInvitationResponseValidator"))]
		input: BookClubInvitationResponseInput,
	) -> Result<BookClubInvitation> {
		let AuthContext { user, .. } = ctx.data::<AuthContext>()?;
		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		Ok(handle_book_club_invitation(user, &id, input, conn)
			.await?
			.into())
	}
}

async fn validate_book_club_invitation_input(
	user: &AuthUser,
	id: &ID,
	input: &BookClubInvitationInput,
	conn: &DatabaseConnection,
) -> Result<()> {
	let _book_club = get_book_club_for_admin(user, id, conn)
		.await?
		.ok_or("Book club not found or you lack permission to update")?;

	let invalid_role = input
		.role
		.as_ref()
		.is_some_and(|role| *role == BookClubMemberRole::Creator);

	if invalid_role {
		return Err("Cannot invite a user as a creator".into());
	}

	if input.user_id == user.id {
		return Err("Cannot create an invitation for yourself".into());
	}

	Ok(())
}

async fn handle_book_club_invitation(
	user: &AuthUser,
	id: &ID,
	input: BookClubInvitationResponseInput,
	conn: &DatabaseConnection,
) -> Result<book_club_invitation::Model> {
	let invitation = get_book_club_invitation(user, id, conn).await?;

	Ok(if !input.accept {
		decline_invitation(invitation, conn).await?
	} else {
		accept_invitation(user, invitation, input.member, conn).await?
	})
}

async fn get_book_club_invitation(
	user: &AuthUser,
	id: &ID,
	conn: &DatabaseConnection,
) -> Result<book_club_invitation::Model> {
	Ok(
		book_club_invitation::Entity::find_for_user_and_id(user, id.as_ref())
			.one(conn)
			.await?
			.ok_or("Invitation not found")?,
	)
}

async fn decline_invitation(
	invitation: book_club_invitation::Model,
	conn: &DatabaseConnection,
) -> Result<book_club_invitation::Model> {
	// TODO: soft delete?
	invitation.clone().delete(conn).await?;
	Ok(invitation)
}

async fn accept_invitation(
	user: &AuthUser,
	invitation: book_club_invitation::Model,
	input: Option<BookClubMemberInput>,
	conn: &DatabaseConnection,
) -> Result<book_club_invitation::Model> {
	// Note: We should never hit this branch because the validator should catch this.
	// Otherwise, the delete branch above would require another invite to be sent.
	let member_input = input.ok_or("Accepting an invitation requires a member object")?;

	// An invitation can outlive the user already joining the club some other way (e.g.
	// being added directly by an admin while the invite was still pending), so this is not
	// purely defensive - guard against the resulting duplicate membership row the same way
	// create_book_club_member does.
	ensure_not_already_a_member(&invitation.book_club_id, &user.id, conn).await?;

	let member = create_member_active_model(user, &invitation, member_input);
	let _created_member = member.insert(conn).await?;
	// TODO: soft delete?
	invitation.clone().delete(conn).await?;

	Ok(invitation)
}

fn create_invitation_active_model(
	id: &ID,
	input: &BookClubInvitationInput,
) -> book_club_invitation::ActiveModel {
	book_club_invitation::ActiveModel {
		role: Set(input.role.unwrap_or(BookClubMemberRole::Member)),
		user_id: Set(input.user_id.clone()),
		book_club_id: Set(id.to_string()),
		..Default::default()
	}
}

fn create_member_active_model(
	user: &AuthUser,
	invitation: &book_club_invitation::Model,
	input: BookClubMemberInput,
) -> book_club_member::ActiveModel {
	book_club_member::ActiveModel {
		id: Set(Uuid::new_v4().to_string()),
		display_name: Set(input.display_name),
		user_id: Set(user.id.clone()),
		book_club_id: Set(invitation.book_club_id.clone()),
		role: Set(invitation.role),
		hide_progress: Set(false),
		bio: Set(None),
		joined_at: Set(chrono::Utc::now().into()),
	}
}

#[cfg(test)]
mod tests {
	use crate::tests::common::*;

	use super::*;
	use models::entity::book_club;
	use pretty_assertions::assert_eq;
	use sea_orm::TryIntoModel;

	fn get_default_book_club() -> book_club::Model {
		book_club::Model {
			id: "123".to_string(),
			name: "Test".to_string(),
			slug: "test".to_string(),
			description: None,
			is_private: false,
			member_role_spec: None,
			created_at: chrono::Utc::now().into(),
			emoji: None,
		}
	}

	fn get_default_book_club_invitation() -> book_club_invitation::Model {
		book_club_invitation::Model {
			id: "314".to_string(),
			role: BookClubMemberRole::Admin,
			user_id: "42".to_string(),
			book_club_id: "123".to_string(),
		}
	}

	#[tokio::test]
	async fn decline_book_club_invitation_no_member() {
		let user = get_default_user();
		let id: ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".into();
		let member = BookClubMemberInput {
			user_id: "42".to_string(),
			display_name: None,
		};
		let input = BookClubInvitationResponseInput {
			accept: false,
			member: Some(member),
		};

		let book_club_invitation = get_default_book_club_invitation();
		let mock_db = get_mock_db_for_model(vec![book_club_invitation.clone()])
			.append_exec_results(vec![sea_orm::MockExecResult {
				last_insert_id: 0,
				rows_affected: 1,
			}])
			.into_connection();
		let result = handle_book_club_invitation(&user, &id, input, &mock_db).await;
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn accept_book_club_invitation_no_member() {
		let user = get_default_user();
		let id: ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".into();
		let member = BookClubMemberInput {
			user_id: "42".to_string(),
			display_name: None,
		};

		let input = BookClubInvitationResponseInput {
			accept: true,
			member: Some(member.clone()),
		};

		let invitation = get_default_book_club_invitation();
		let member_active_model = create_member_active_model(&user, &invitation, member);
		let member_model = member_active_model.try_into_model().unwrap();
		let mock_db = get_mock_db_for_model(vec![invitation.clone()])
			// `ensure_not_already_a_member`'s existence check finds no prior membership row
			.append_query_results::<book_club_member::Model, _, _>(vec![vec![]])
			.append_query_results(vec![vec![member_model]])
			.append_exec_results(vec![sea_orm::MockExecResult {
				last_insert_id: 1,
				rows_affected: 1,
			}])
			.into_connection();
		let result = handle_book_club_invitation(&user, &id, input, &mock_db).await;
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn accept_book_club_invitation_rejects_existing_membership() {
		let user = get_default_user();
		let id: ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".into();
		let member = BookClubMemberInput {
			user_id: "42".to_string(),
			display_name: None,
		};

		let input = BookClubInvitationResponseInput {
			accept: true,
			member: Some(member),
		};

		let invitation = get_default_book_club_invitation();
		let existing_member = book_club_member::Model {
			id: "existing-member".to_string(),
			display_name: None,
			bio: None,
			hide_progress: false,
			role: BookClubMemberRole::Member,
			joined_at: chrono::Utc::now().into(),
			user_id: user.id.clone(),
			book_club_id: invitation.book_club_id.clone(),
		};
		let mock_db = get_mock_db_for_model(vec![invitation.clone()])
			.append_query_results(vec![vec![existing_member]])
			.into_connection();

		let result = handle_book_club_invitation(&user, &id, input, &mock_db).await;
		assert!(result.is_err());
	}

	#[tokio::test]
	async fn test_get_book_club_invitation() {
		let book_club_invitation = get_default_book_club_invitation();
		let mock_db =
			get_mock_db_for_model(vec![book_club_invitation.clone()]).into_connection();
		let id: ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".into();

		// check for successful result
		let result = get_book_club_invitation(&get_default_user(), &id, &mock_db)
			.await
			.unwrap();
		assert_eq!(result, book_club_invitation);

		// check for empty result
		let mock_db = get_mock_db_for_model::<book_club_invitation::Model>(vec![])
			.into_connection();
		let result = get_book_club_invitation(&get_default_user(), &id, &mock_db).await;
		assert!(result.is_err());
	}

	#[tokio::test]
	async fn test_validate_book_club_invitation_input_valid() {
		let mock_db =
			get_mock_db_for_model(vec![get_default_book_club()]).into_connection();

		let input = BookClubInvitationInput {
			role: Some(BookClubMemberRole::Admin),
			user_id: "456".to_string(),
		};

		let result = validate_book_club_invitation_input(
			&get_default_user(),
			&"123".into(),
			&input,
			&mock_db,
		)
		.await;

		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn test_validate_book_club_invitation_input_same_user() {
		let mock_db: DatabaseConnection =
			get_mock_db_for_model(vec![get_default_book_club()]).into_connection();
		let input: BookClubInvitationInput = BookClubInvitationInput {
			role: Some(BookClubMemberRole::Admin),
			user_id: get_default_user().id,
		};
		let result = validate_book_club_invitation_input(
			&get_default_user(),
			&"123".into(),
			&input,
			&mock_db,
		)
		.await;

		assert!(result.is_err());
	}

	#[tokio::test]
	async fn test_validate_book_club_invitation_input_missing_role() {
		let mock_db: DatabaseConnection =
			get_mock_db_for_model(vec![get_default_book_club()]).into_connection();
		let input: BookClubInvitationInput = BookClubInvitationInput {
			role: None,
			user_id: "456".to_string(),
		};
		let result = validate_book_club_invitation_input(
			&get_default_user(),
			&"123".into(),
			&input,
			&mock_db,
		)
		.await;
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn test_validate_book_club_invitation_input_invalid_role() {
		let mock_db: DatabaseConnection =
			get_mock_db_for_model(vec![get_default_book_club()]).into_connection();
		let input: BookClubInvitationInput = BookClubInvitationInput {
			role: Some(BookClubMemberRole::Creator),
			user_id: "456".to_string(),
		};
		let result = validate_book_club_invitation_input(
			&get_default_user(),
			&"123".into(),
			&input,
			&mock_db,
		)
		.await;
		assert!(result.is_err());
	}

	#[tokio::test]
	async fn test_validate_book_club_invitation_input_invalid_user() {
		let user = get_default_user();
		let mock_db: DatabaseConnection =
			get_mock_db_for_model(vec![get_default_book_club()]).into_connection();
		let input: BookClubInvitationInput = BookClubInvitationInput {
			role: Some(BookClubMemberRole::Creator),
			user_id: user.id.clone(),
		};
		let result =
			validate_book_club_invitation_input(&user, &"123".into(), &input, &mock_db)
				.await;
		assert!(result.is_err());
	}

	#[test]
	fn test_create_invitation_active_model() {
		let id: ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".into();
		let input = BookClubInvitationInput {
			role: Some(BookClubMemberRole::Admin),
			user_id: "456".to_string(),
		};

		let active_model = create_invitation_active_model(&id, &input);

		assert_eq!(active_model.role.unwrap(), BookClubMemberRole::Admin);
		assert_eq!(active_model.user_id.unwrap(), "456".to_string());
		assert_eq!(active_model.book_club_id.unwrap(), id.to_string());
	}
}
