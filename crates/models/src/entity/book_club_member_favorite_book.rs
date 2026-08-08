use async_graphql::SimpleObject;
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, SimpleObject)]
#[graphql(name = "BookClubMemberFavoriteBookModel")]
#[sea_orm(table_name = "book_club_member_favorite_books")]
pub struct Model {
	#[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
	pub id: String,
	#[sea_orm(column_type = "Text", nullable)]
	pub title: Option<String>,
	#[sea_orm(column_type = "Text", nullable)]
	pub author: Option<String>,
	#[sea_orm(column_type = "Text", nullable)]
	pub url: Option<String>,
	#[sea_orm(column_type = "Text", nullable)]
	pub notes: Option<String>,
	#[sea_orm(column_type = "Text", unique)]
	pub member_id: String,
	#[sea_orm(column_type = "Text", nullable)]
	pub book_id: Option<String>,
	#[sea_orm(column_type = "Text", nullable)]
	pub image_url: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
	#[sea_orm(
		belongs_to = "super::book_club_member::Entity",
		from = "Column::MemberId",
		to = "super::book_club_member::Column::Id",
		on_update = "Cascade",
		on_delete = "Cascade"
	)]
	BookClubMember,
	#[sea_orm(
		belongs_to = "super::media::Entity",
		from = "Column::BookId",
		to = "super::media::Column::Id",
		on_update = "Cascade",
		on_delete = "Cascade"
	)]
	Media,
}

impl Related<super::book_club_member::Entity> for Entity {
	fn to() -> RelationDef {
		Relation::BookClubMember.def()
	}
}

impl Related<super::media::Entity> for Entity {
	fn to() -> RelationDef {
		Relation::Media.def()
	}
}

impl ActiveModelBehavior for ActiveModel {}

impl Entity {
	/// Find the favorite book row for a given member, if one has been set. There is at
	/// most one favorite book per member (enforced by a unique constraint on `member_id`).
	pub fn find_by_member_id(member_id: &str) -> Select<Entity> {
		Entity::find().filter(Column::MemberId.eq(member_id))
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::tests::common::*;
	use pretty_assertions::assert_eq;

	#[test]
	fn test_find_by_member_id() {
		let select = Entity::find_by_member_id("member-1");
		assert_eq!(
			select_no_cols_to_string(select),
			r#"SELECT  FROM "book_club_member_favorite_books" WHERE "book_club_member_favorite_books"."member_id" = 'member-1'"#
		);
	}
}
