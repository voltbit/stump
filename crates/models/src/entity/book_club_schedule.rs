use async_graphql::SimpleObject;
use sea_orm::{
	prelude::{async_trait::async_trait, *},
	ActiveValue, QueryOrder,
};

use crate::shared::book_club::BookClubScheduleKind;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, SimpleObject)]
#[graphql(name = "BookClubScheduleModel")]
#[sea_orm(table_name = "book_club_schedules")]
pub struct Model {
	#[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
	pub id: String,
	#[sea_orm(column_type = "Text")]
	pub book_club_id: String,
	#[sea_orm(column_type = "Text")]
	pub name: String,
	pub kind: BookClubScheduleKind,
	/// The kind-specific config payload, stored as a raw JSON string so new kinds can
	/// be added without a migration. See [crate::shared::book_club_schedule] for the
	/// shape expected for each kind
	#[graphql(skip)]
	#[sea_orm(column_type = "Text")]
	pub config: String,
	#[sea_orm(column_type = "custom(\"DATETIME\")")]
	pub created_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
	#[sea_orm(
		belongs_to = "super::book_club::Entity",
		from = "Column::BookClubId",
		to = "super::book_club::Column::Id",
		on_update = "Cascade",
		on_delete = "Cascade"
	)]
	BookClub,
}

impl Related<super::book_club::Entity> for Entity {
	fn to() -> RelationDef {
		Relation::BookClub.def()
	}
}

#[async_trait]
impl ActiveModelBehavior for ActiveModel {
	async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
	where
		C: ConnectionTrait,
	{
		if insert {
			if self.id.is_not_set() {
				self.id = ActiveValue::Set(uuid::Uuid::new_v4().to_string());
			}
			if self.created_at.is_not_set() {
				self.created_at = ActiveValue::Set(chrono::Utc::now().into());
			}
		}

		Ok(self)
	}
}

impl Entity {
	/// Find all schedules for a book club, ordered by creation
	pub fn find_for_book_club_id(book_club_id: &str) -> Select<Entity> {
		Entity::find()
			.filter(Column::BookClubId.eq(book_club_id))
			.order_by_asc(Column::CreatedAt)
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::tests::common::*;
	use pretty_assertions::assert_eq;

	#[test]
	fn test_find_for_book_club_id() {
		let select = Entity::find_for_book_club_id("314");
		assert_eq!(
			select_no_cols_to_string(select),
			r#"SELECT  FROM "book_club_schedules" WHERE "book_club_schedules"."book_club_id" = '314' ORDER BY "book_club_schedules"."created_at" ASC"#
		);
	}
}
