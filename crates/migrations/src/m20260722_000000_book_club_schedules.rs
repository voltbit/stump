use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
	async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
		manager
			.create_table(
				Table::create()
					.table(BookClubSchedules::Table)
					.if_not_exists()
					.col(
						ColumnDef::new(BookClubSchedules::Id)
							.text()
							.not_null()
							.primary_key(),
					)
					.col(
						ColumnDef::new(BookClubSchedules::BookClubId)
							.text()
							.not_null(),
					)
					.col(ColumnDef::new(BookClubSchedules::Name).text().not_null())
					.col(ColumnDef::new(BookClubSchedules::Kind).text().not_null())
					.col(ColumnDef::new(BookClubSchedules::Config).text().not_null())
					.col(
						ColumnDef::new(BookClubSchedules::CreatedAt)
							.date_time()
							.not_null()
							.default(Expr::current_timestamp()),
					)
					.foreign_key(
						ForeignKey::create()
							.name("fk-book_club_schedules-book_club")
							.from(BookClubSchedules::Table, BookClubSchedules::BookClubId)
							.to(BookClubs::Table, BookClubs::Id)
							.on_delete(ForeignKeyAction::Cascade)
							.on_update(ForeignKeyAction::Cascade),
					)
					.to_owned(),
			)
			.await?;

		// book_club_schedules by club
		manager
			.create_index(
				Index::create()
					.name("idx_bcsch_club")
					.table(BookClubSchedules::Table)
					.col(BookClubSchedules::BookClubId)
					.to_owned(),
			)
			.await?;

		Ok(())
	}

	async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
		manager
			.drop_table(
				Table::drop()
					.table(BookClubSchedules::Table)
					.if_exists()
					.to_owned(),
			)
			.await
	}
}

#[derive(DeriveIden)]
enum BookClubSchedules {
	Table,
	Id,
	BookClubId,
	Name,
	Kind,
	Config,
	CreatedAt,
}

#[derive(DeriveIden)]
enum BookClubs {
	Table,
	Id,
}
