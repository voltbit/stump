use async_graphql::{ComplexObject, Context, Result, SimpleObject};
use models::entity::{book_club_member_favorite_book, media};

use crate::{data::CoreContext, object::media::Media};

#[derive(Debug, SimpleObject)]
#[graphql(complex)]
pub struct BookClubMemberFavoriteBook {
	#[graphql(flatten)]
	model: book_club_member_favorite_book::Model,
}

impl From<book_club_member_favorite_book::Model> for BookClubMemberFavoriteBook {
	fn from(model: book_club_member_favorite_book::Model) -> Self {
		Self { model }
	}
}

#[ComplexObject]
impl BookClubMemberFavoriteBook {
	/// The linked media entity, if this favorite book references a book stored on the
	/// server rather than (or in addition to) a free-form title/author/url
	async fn entity(&self, ctx: &Context<'_>) -> Result<Option<Media>> {
		let Some(book_id) = &self.model.book_id else {
			return Ok(None);
		};

		let conn = ctx.data::<CoreContext>()?.conn.as_ref();

		let model = media::ModelWithMetadata::find_by_id(book_id.clone())
			.into_model::<media::ModelWithMetadata>()
			.one(conn)
			.await?;

		Ok(model.map(Media::from))
	}
}
