use async_graphql::{
	CustomValidator, Error as GraphQLError, InputObject, InputValueError, Json, ID,
};
use models::{
	entity::{
		book_club, book_club_member, book_club_member_favorite_book, book_club_schedule,
		user::AuthUser,
	},
	shared::{
		book_club::{BookClubMemberRole, BookClubMemberRoleSpec, BookClubScheduleKind},
		book_club_schedule::validate_schedule_config,
	},
};
use sea_orm::{prelude::*, IntoActiveModel, Set};
use slugify::slugify;

use crate::object::book_club_book::BookClubBookVariant;

#[derive(Debug, InputObject)]
pub struct CreateBookClubInput {
	pub name: String,
	pub slug: Option<String>,
	#[graphql(default)]
	pub is_private: bool,
	pub description: Option<String>,
	pub member_role_spec: Option<Json<BookClubMemberRoleSpec>>,
	pub creator_hide_progress: bool,
	pub creator_display_name: Option<String>,
}

impl CreateBookClubInput {
	pub fn into_active_model(
		self,
		user: &AuthUser,
	) -> (book_club::ActiveModel, book_club_member::ActiveModel) {
		let id = Uuid::new_v4().to_string();
		let slug = self
			.slug
			.map(|s| slugify!(s.as_str()))
			.unwrap_or_else(|| slugify!(self.name.as_str()));

		let club = book_club::ActiveModel {
			id: Set(id.clone()),
			name: Set(self.name),
			description: Set(self.description),
			is_private: Set(self.is_private),
			member_role_spec: Set(self.member_role_spec.map(|spec| spec.0)),
			slug: Set(slug),
			..Default::default()
		};

		let owning_member = book_club_member::ActiveModel {
			id: Set(Uuid::new_v4().to_string()),
			role: Set(BookClubMemberRole::Creator),
			hide_progress: Set(self.creator_hide_progress),
			display_name: Set(self.creator_display_name),
			user_id: Set(user.id.clone()),
			book_club_id: Set(id),
			bio: Set(None),
			joined_at: Set(chrono::Utc::now().into()),
		};

		(club, owning_member)
	}

	pub fn validate(&self) -> Result<(), InputValueError<CreateBookClubInput>> {
		if let Some(slug) = &self.slug {
			if slug.is_empty() {
				return Err(InputValueError::custom("Slug cannot be empty"));
			} else if slugify!(slug) != *slug {
				return Err(InputValueError::custom(
					"Slug can only contain lowercase letters, numbers, and hyphens",
				));
			}
		}

		Ok(())
	}
}

#[derive(Debug, InputObject)]
pub struct UpdateBookClubInput {
	pub name: Option<String>,
	pub description: Option<String>,
	pub is_private: Option<bool>,
	pub member_role_spec: Option<Json<BookClubMemberRoleSpec>>,
	pub emoji: Option<String>,
}

impl UpdateBookClubInput {
	pub fn apply(
		self,
		mut active_model: book_club::ActiveModel,
	) -> book_club::ActiveModel {
		let UpdateBookClubInput {
			name,
			description,
			is_private,
			emoji,
			member_role_spec,
		} = self;

		active_model.description = Set(description);
		active_model.emoji = Set(emoji);

		active_model.name = name.map(Set).unwrap_or(active_model.name);
		active_model.is_private = is_private.map(Set).unwrap_or(active_model.is_private);
		if let Some(spec) = member_role_spec {
			active_model.member_role_spec = Set(Some(spec.0));
		}

		active_model
	}
}

#[derive(Debug, InputObject)]
pub struct BookClubInvitationInput {
	pub user_id: String,
	pub role: Option<BookClubMemberRole>,
}

#[derive(Debug, Clone, InputObject)]
pub struct BookClubMemberInput {
	pub user_id: String,
	pub display_name: Option<String>,
}

#[derive(Debug, InputObject)]
pub struct BookClubInvitationResponseInput {
	pub accept: bool,
	pub member: Option<BookClubMemberInput>,
}

pub struct BookClubInvitationResponseValidator;

impl CustomValidator<BookClubInvitationResponseInput>
	for BookClubInvitationResponseValidator
{
	fn check(
		&self,
		value: &BookClubInvitationResponseInput,
	) -> Result<(), InputValueError<BookClubInvitationResponseInput>> {
		match (value.accept, &value.member) {
			(true, None) => Err(InputValueError::custom(
				"Accepting an invitation requires a member object",
			)),
			(false, Some(_)) => Err(InputValueError::custom(
				"Rejecting an invitation should not include a member object",
			)),
			_ => Ok(()),
		}
	}
}

#[derive(Debug, InputObject)]
pub struct BookClubDiscussionInput {
	pub book_club_book_id: Option<ID>,
	pub title: Option<String>,
	pub is_pinned: bool,
}

#[derive(Debug, InputObject)]
pub struct AddBookToClubInput {
	pub book: BookClubBookVariant,
}

#[derive(Debug, InputObject)]
pub struct CreateBookClubMemberInput {
	pub user_id: String,
	pub display_name: Option<String>,
	pub role: BookClubMemberRole,
}

impl CreateBookClubMemberInput {
	pub fn into_active_model(self, book_club_id: &str) -> book_club_member::ActiveModel {
		book_club_member::ActiveModel {
			id: Set(Uuid::new_v4().to_string()),
			display_name: Set(self.display_name),
			book_club_id: Set(book_club_id.to_string()),
			hide_progress: Set(false),
			user_id: Set(self.user_id),
			role: Set(self.role),
			..Default::default()
		}
	}
}

#[derive(Debug, InputObject)]
pub struct SendMessageInput {
	pub content: String,
	/// The parent message inside a thread, denoting this message as a child
	pub parent_message_id: Option<String>,
	/// An inline reply reference, NOT a child of a thread
	pub reply_to_message_id: Option<String>,
}

#[derive(Debug, InputObject)]
pub struct EditMessageInput {
	pub content: String,
}

#[derive(Debug, InputObject)]
pub struct CreateCustomEmojiInput {
	pub name: String,
	pub is_animated: bool,
}

#[derive(Debug, InputObject)]
pub struct UpdateCustomEmojiInput {
	pub name: String,
}

#[derive(Debug, InputObject)]
pub struct SuggestBookInput {
	pub book_id: Option<String>,
	pub title: Option<String>,
	pub author: Option<String>,
	pub url: Option<String>,
	pub notes: Option<String>,
}

#[derive(Debug, InputObject)]
pub struct UpdateMemberProfileInput {
	pub display_name: Option<String>,
	pub bio: Option<String>,
	pub hide_progress: Option<bool>,
}

impl UpdateMemberProfileInput {
	/// Applies the provided fields on top of an existing member's active model. Fields
	/// that are omitted are left unchanged, rather than being cleared, so callers only
	/// need to send the fields they actually want to update.
	pub fn apply(
		self,
		mut active_model: book_club_member::ActiveModel,
	) -> book_club_member::ActiveModel {
		let UpdateMemberProfileInput {
			display_name,
			bio,
			hide_progress,
		} = self;

		if let Some(display_name) = display_name {
			active_model.display_name = Set(Some(display_name));
		}
		if let Some(bio) = bio {
			active_model.bio = Set(Some(bio));
		}
		if let Some(hide_progress) = hide_progress {
			active_model.hide_progress = Set(hide_progress);
		}

		active_model
	}
}

#[derive(Debug, InputObject)]
pub struct SetBookClubMemberFavoriteBookInput {
	/// The ID of a book stored on the server (e.g. a `media` entity ID)
	pub book_id: Option<String>,
	pub title: Option<String>,
	pub author: Option<String>,
	pub url: Option<String>,
	pub image_url: Option<String>,
	pub notes: Option<String>,
}

impl SetBookClubMemberFavoriteBookInput {
	pub fn validate(&self) -> Result<(), GraphQLError> {
		if self.book_id.is_none() && (self.title.is_none() || self.author.is_none()) {
			return Err(GraphQLError::new(
				"You must provide either a book_id or both title and author",
			));
		}

		Ok(())
	}

	/// Builds a brand new favorite book row for a member that doesn't have one yet
	pub fn into_active_model(
		self,
		member_id: &str,
	) -> book_club_member_favorite_book::ActiveModel {
		book_club_member_favorite_book::ActiveModel {
			id: Set(Uuid::new_v4().to_string()),
			member_id: Set(member_id.to_string()),
			book_id: Set(self.book_id),
			title: Set(self.title),
			author: Set(self.author),
			url: Set(self.url),
			image_url: Set(self.image_url),
			notes: Set(self.notes),
		}
	}

	/// Replaces every field on an existing favorite book row, since "set or replace"
	/// semantics mean the whole record reflects whatever was last submitted
	pub fn apply(
		self,
		mut active_model: book_club_member_favorite_book::ActiveModel,
	) -> book_club_member_favorite_book::ActiveModel {
		active_model.book_id = Set(self.book_id);
		active_model.title = Set(self.title);
		active_model.author = Set(self.author);
		active_model.url = Set(self.url);
		active_model.image_url = Set(self.image_url);
		active_model.notes = Set(self.notes);

		active_model
	}
}

#[derive(Debug, InputObject)]
pub struct CreateBookClubScheduleInput {
	pub name: String,
	pub kind: BookClubScheduleKind,
	pub config: Json<serde_json::Value>,
}

impl CreateBookClubScheduleInput {
	pub fn into_active_model(
		self,
		book_club_id: &str,
	) -> Result<book_club_schedule::ActiveModel, GraphQLError> {
		validate_schedule_name(&self.name)?;
		validate_schedule_config(self.kind, &self.config.0).map_err(GraphQLError::new)?;

		Ok(book_club_schedule::ActiveModel {
			name: Set(self.name),
			kind: Set(self.kind),
			config: Set(self.config.0.to_string()),
			book_club_id: Set(book_club_id.to_string()),
			..Default::default()
		})
	}
}

#[derive(Debug, InputObject)]
pub struct UpdateBookClubScheduleInput {
	pub name: Option<String>,
	pub kind: Option<BookClubScheduleKind>,
	pub config: Option<Json<serde_json::Value>>,
}

impl UpdateBookClubScheduleInput {
	/// Applies this input on top of an existing schedule, re-validating the effective
	/// config against the effective kind (whichever of the two, or both, were not
	/// provided fall back to the existing schedule's values)
	pub fn apply(
		self,
		schedule: book_club_schedule::Model,
	) -> Result<book_club_schedule::ActiveModel, GraphQLError> {
		if let Some(ref name) = self.name {
			validate_schedule_name(name)?;
		}

		let kind = self.kind.unwrap_or(schedule.kind);
		let config = match self.config {
			Some(config) => config.0,
			None => serde_json::from_str(&schedule.config)
				.map_err(|_| GraphQLError::new("Stored schedule config is corrupted"))?,
		};

		validate_schedule_config(kind, &config).map_err(GraphQLError::new)?;

		let mut active_model = schedule.into_active_model();
		if let Some(name) = self.name {
			active_model.name = Set(name);
		}
		active_model.kind = Set(kind);
		active_model.config = Set(config.to_string());

		Ok(active_model)
	}
}

fn validate_schedule_name(name: &str) -> Result<(), GraphQLError> {
	if name.trim().is_empty() {
		return Err(GraphQLError::new("Schedule name cannot be empty"));
	}

	Ok(())
}

#[cfg(test)]
mod tests {
	use crate::tests::common::*;

	use super::*;
	use pretty_assertions::assert_eq;

	#[test]
	fn test_into_active_model() {
		let input = CreateBookClubInput {
			name: "Test".to_string(),
			slug: None,
			description: None,
			is_private: false,
			member_role_spec: None,
			creator_hide_progress: false,
			creator_display_name: None,
		};

		let user = get_default_user();

		let (club, member) = input.into_active_model(&user);

		assert_eq!(club.name, Set("Test".to_string()));
		assert_eq!(club.is_private, Set(false));
		assert_eq!(club.member_role_spec, Set(None));

		assert_eq!(member.role, Set(BookClubMemberRole::Creator));
		assert_eq!(member.hide_progress, Set(false));
		assert_eq!(member.display_name, Set(None));
		assert_eq!(member.user_id, Set(user.id));
		assert!(Uuid::parse_str(&member.id.unwrap()).is_ok());
	}

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

	#[test]
	fn create_schedule_input_valid_upcoming_discussion() {
		let input = CreateBookClubScheduleInput {
			name: "Upcoming book discussion".to_string(),
			kind: BookClubScheduleKind::UpcomingDiscussion,
			config: Json(serde_json::json!({
				"startsAt": "2026-08-01T18:00:00+00:00",
				"recurrence": null,
			})),
		};

		let active_model = input.into_active_model("club-1").unwrap();
		assert_eq!(
			active_model.name,
			Set("Upcoming book discussion".to_string())
		);
		assert_eq!(
			active_model.kind,
			Set(BookClubScheduleKind::UpcomingDiscussion)
		);
		assert_eq!(active_model.book_club_id, Set("club-1".to_string()));
	}

	#[test]
	fn create_schedule_input_valid_interval_books() {
		let input = CreateBookClubScheduleInput {
			name: "Reading rotation".to_string(),
			kind: BookClubScheduleKind::IntervalBooks,
			config: Json(serde_json::json!({
				"interval": { "every": 2, "unit": "WEEK", "anchor": "2026-08-01" },
				"assignments": [],
			})),
		};

		let active_model = input.into_active_model("club-1").unwrap();
		assert_eq!(active_model.kind, Set(BookClubScheduleKind::IntervalBooks));
	}

	#[test]
	fn create_schedule_input_rejects_empty_name() {
		let input = CreateBookClubScheduleInput {
			name: "   ".to_string(),
			kind: BookClubScheduleKind::UpcomingDiscussion,
			config: Json(serde_json::json!({
				"startsAt": "2026-08-01T18:00:00+00:00",
				"recurrence": null,
			})),
		};

		assert!(input.into_active_model("club-1").is_err());
	}

	#[test]
	fn create_schedule_input_rejects_kind_mismatch() {
		let input = CreateBookClubScheduleInput {
			name: "Reading rotation".to_string(),
			kind: BookClubScheduleKind::IntervalBooks,
			config: Json(serde_json::json!({
				"startsAt": "2026-08-01T18:00:00+00:00",
				"recurrence": null,
			})),
		};

		assert!(input.into_active_model("club-1").is_err());
	}

	#[test]
	fn create_schedule_input_rejects_wrong_shape() {
		let input = CreateBookClubScheduleInput {
			name: "Reading rotation".to_string(),
			kind: BookClubScheduleKind::IntervalBooks,
			config: Json(serde_json::json!({ "foo": "bar" })),
		};

		assert!(input.into_active_model("club-1").is_err());
	}

	#[test]
	fn update_schedule_input_keeps_existing_config_when_omitted() {
		let schedule = get_default_schedule();
		let input = UpdateBookClubScheduleInput {
			name: Some("Renamed discussion".to_string()),
			kind: None,
			config: None,
		};

		let active_model = input.apply(schedule).unwrap();
		assert_eq!(active_model.name, Set("Renamed discussion".to_string()));
		assert_eq!(
			active_model.kind,
			Set(BookClubScheduleKind::UpcomingDiscussion)
		);
	}

	#[test]
	fn update_schedule_input_rejects_empty_name() {
		let schedule = get_default_schedule();
		let input = UpdateBookClubScheduleInput {
			name: Some("   ".to_string()),
			kind: None,
			config: None,
		};

		assert!(input.apply(schedule).is_err());
	}

	#[test]
	fn update_schedule_input_rejects_kind_mismatch_with_existing_config() {
		let schedule = get_default_schedule();
		// Switching kind without providing a matching config should fail, since the
		// existing config is only valid for the existing kind
		let input = UpdateBookClubScheduleInput {
			name: None,
			kind: Some(BookClubScheduleKind::IntervalBooks),
			config: None,
		};

		assert!(input.apply(schedule).is_err());
	}

	#[test]
	fn update_schedule_input_allows_kind_and_config_change_together() {
		let schedule = get_default_schedule();
		let input = UpdateBookClubScheduleInput {
			name: None,
			kind: Some(BookClubScheduleKind::IntervalBooks),
			config: Some(Json(serde_json::json!({
				"interval": { "every": 1, "unit": "MONTH", "anchor": "2026-08-01" },
				"assignments": [],
			}))),
		};

		let active_model = input.apply(schedule).unwrap();
		assert_eq!(active_model.kind, Set(BookClubScheduleKind::IntervalBooks));
	}

	fn get_default_member() -> book_club_member::Model {
		book_club_member::Model {
			id: "member-1".to_string(),
			display_name: Some("Old name".to_string()),
			bio: Some("Old bio".to_string()),
			hide_progress: false,
			role: BookClubMemberRole::Member,
			joined_at: chrono::Utc::now().into(),
			user_id: "42".to_string(),
			book_club_id: "club-1".to_string(),
		}
	}

	#[test]
	fn update_member_profile_input_applies_provided_fields() {
		let member = get_default_member();
		let input = UpdateMemberProfileInput {
			display_name: Some("New name".to_string()),
			bio: Some("New bio".to_string()),
			hide_progress: Some(true),
		};

		let active_model = input.apply(member.into_active_model());
		assert_eq!(active_model.display_name, Set(Some("New name".to_string())));
		assert_eq!(active_model.bio, Set(Some("New bio".to_string())));
		assert_eq!(active_model.hide_progress, Set(true));
	}

	#[test]
	fn update_member_profile_input_leaves_omitted_fields_unchanged() {
		let member = get_default_member();
		let input = UpdateMemberProfileInput {
			display_name: None,
			bio: None,
			hide_progress: None,
		};

		let active_model = input.apply(member.into_active_model());
		// Unset fields come back as `Unchanged` (not `Set`) from `into_active_model`, since
		// they were loaded from a real row and left untouched by `apply` - only the
		// underlying value matters here, not which ActiveValue variant carries it
		assert_eq!(
			active_model.display_name.unwrap(),
			Some("Old name".to_string())
		);
		assert_eq!(active_model.bio.unwrap(), Some("Old bio".to_string()));
		assert_eq!(active_model.hide_progress.unwrap(), false);
	}

	#[test]
	fn favorite_book_input_requires_book_id_or_title_and_author() {
		let input = SetBookClubMemberFavoriteBookInput {
			book_id: None,
			title: Some("Title only".to_string()),
			author: None,
			url: None,
			image_url: None,
			notes: None,
		};

		assert!(input.validate().is_err());
	}

	#[test]
	fn favorite_book_input_valid_with_book_id() {
		let input = SetBookClubMemberFavoriteBookInput {
			book_id: Some("media-1".to_string()),
			title: None,
			author: None,
			url: None,
			image_url: None,
			notes: None,
		};

		assert!(input.validate().is_ok());
	}

	#[test]
	fn favorite_book_input_valid_with_title_and_author() {
		let input = SetBookClubMemberFavoriteBookInput {
			book_id: None,
			title: Some("Title".to_string()),
			author: Some("Author".to_string()),
			url: None,
			image_url: None,
			notes: None,
		};

		assert!(input.validate().is_ok());
	}

	#[test]
	fn favorite_book_input_into_active_model() {
		let input = SetBookClubMemberFavoriteBookInput {
			book_id: Some("media-1".to_string()),
			title: Some("Title".to_string()),
			author: Some("Author".to_string()),
			url: None,
			image_url: None,
			notes: None,
		};

		let active_model = input.into_active_model("member-1");
		assert_eq!(active_model.member_id, Set("member-1".to_string()));
		assert_eq!(active_model.book_id, Set(Some("media-1".to_string())));
		assert_eq!(active_model.title, Set(Some("Title".to_string())));
		assert!(Uuid::parse_str(&active_model.id.unwrap()).is_ok());
	}

	#[test]
	fn favorite_book_input_apply_replaces_existing_fields() {
		let existing = book_club_member_favorite_book::Model {
			id: "fav-1".to_string(),
			title: Some("Old title".to_string()),
			author: Some("Old author".to_string()),
			url: Some("https://old.example.com".to_string()),
			notes: Some("Old notes".to_string()),
			member_id: "member-1".to_string(),
			book_id: None,
			image_url: None,
		};

		let input = SetBookClubMemberFavoriteBookInput {
			book_id: Some("media-1".to_string()),
			title: Some("New title".to_string()),
			author: None,
			url: None,
			image_url: None,
			notes: None,
		};

		let active_model = input.apply(existing.into_active_model());
		assert_eq!(active_model.book_id, Set(Some("media-1".to_string())));
		assert_eq!(active_model.title, Set(Some("New title".to_string())));
		assert_eq!(active_model.author, Set(None));
		assert_eq!(active_model.url, Set(None));
	}
}
