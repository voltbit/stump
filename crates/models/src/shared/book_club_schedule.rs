use chrono::{DateTime, FixedOffset, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::shared::book_club::BookClubScheduleKind;

/// Config payload for a [BookClubScheduleKind::UpcomingDiscussion] schedule: a single
/// upcoming meeting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingDiscussionConfig {
	/// The date and time of the upcoming discussion
	pub starts_at: DateTime<FixedOffset>,
	/// An optional freeform/RRULE recurrence string, for later use
	pub recurrence: Option<String>,
}

/// The unit of time an [IntervalSpec] counts in
#[derive(Debug, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IntervalUnit {
	Day,
	Week,
	Month,
}

/// How often books are assigned for an [BookClubScheduleKind::IntervalBooks] schedule
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntervalSpec {
	/// The number of `unit`s between assignments, e.g. `2` + `Week` means every 2
	/// weeks. Must be at least 1
	pub every: u32,
	pub unit: IntervalUnit,
	/// The date the interval is anchored to
	pub anchor: NaiveDate,
}

impl IntervalSpec {
	fn validate(&self) -> Result<(), String> {
		if self.every < 1 {
			return Err("`interval.every` must be at least 1".to_string());
		}

		Ok(())
	}
}

/// A book assigned to an interval, either a reference to a stored media entity or a
/// manual entry (mirrors the idea behind `BookClubBookVariant`)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignedBook {
	pub book_entity_id: Option<String>,
	pub title: Option<String>,
	pub author: Option<String>,
	pub url: Option<String>,
}

/// A single book assigned to a date range within an [IntervalBooksConfig]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntervalAssignment {
	pub starts_on: NaiveDate,
	pub ends_on: NaiveDate,
	pub book: AssignedBook,
}

/// Config payload for a [BookClubScheduleKind::IntervalBooks] schedule: books assigned
/// on a recurring interval
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntervalBooksConfig {
	pub interval: IntervalSpec,
	pub assignments: Vec<IntervalAssignment>,
}

impl IntervalBooksConfig {
	fn validate(&self) -> Result<(), String> {
		self.interval.validate()
	}
}

/// Deserializes `config` into the serde struct expected for `kind`, returning a clear
/// error if the shape doesn't match. This is how we enforce that a schedule's `config`
/// is valid for its `kind` without requiring a migration for every new kind
pub fn validate_schedule_config(
	kind: BookClubScheduleKind,
	config: &serde_json::Value,
) -> Result<(), String> {
	match kind {
		BookClubScheduleKind::UpcomingDiscussion => {
			serde_json::from_value::<UpcomingDiscussionConfig>(config.clone())
				.map(|_| ())
				.map_err(|err| format!("Invalid config for UPCOMING_DISCUSSION: {err}"))
		},
		BookClubScheduleKind::IntervalBooks => {
			let parsed: IntervalBooksConfig = serde_json::from_value(config.clone())
				.map_err(|err| format!("Invalid config for INTERVAL_BOOKS: {err}"))?;
			parsed.validate()
		},
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use serde_json::json;

	#[test]
	fn test_validate_upcoming_discussion_valid() {
		let config = json!({
			"startsAt": "2026-08-01T18:00:00+00:00",
			"recurrence": null,
		});

		assert!(validate_schedule_config(
			BookClubScheduleKind::UpcomingDiscussion,
			&config
		)
		.is_ok());
	}

	#[test]
	fn test_validate_upcoming_discussion_wrong_shape() {
		let config = json!({ "foo": "bar" });

		assert!(validate_schedule_config(
			BookClubScheduleKind::UpcomingDiscussion,
			&config
		)
		.is_err());
	}

	#[test]
	fn test_validate_interval_books_valid() {
		let config = json!({
			"interval": { "every": 2, "unit": "WEEK", "anchor": "2026-08-01" },
			"assignments": [
				{
					"startsOn": "2026-08-01",
					"endsOn": "2026-08-14",
					"book": { "title": "Dune", "author": "Frank Herbert" },
				}
			],
		});

		assert!(
			validate_schedule_config(BookClubScheduleKind::IntervalBooks, &config)
				.is_ok()
		);
	}

	#[test]
	fn test_validate_interval_books_every_zero() {
		let config = json!({
			"interval": { "every": 0, "unit": "WEEK", "anchor": "2026-08-01" },
			"assignments": [],
		});

		let result =
			validate_schedule_config(BookClubScheduleKind::IntervalBooks, &config);
		assert!(result.is_err());
		assert!(result.unwrap_err().contains("every"));
	}

	#[test]
	fn test_validate_interval_books_kind_mismatch() {
		// A well-formed UpcomingDiscussion config is not a valid IntervalBooks config
		let config = json!({
			"startsAt": "2026-08-01T18:00:00+00:00",
			"recurrence": null,
		});

		assert!(
			validate_schedule_config(BookClubScheduleKind::IntervalBooks, &config)
				.is_err()
		);
	}
}
