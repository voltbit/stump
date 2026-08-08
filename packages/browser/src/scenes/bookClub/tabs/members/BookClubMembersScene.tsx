import { useInfiniteSuspenseGraphQL, useSDK } from '@stump/client'
import { Avatar, Button, Card, Text } from '@stump/components'
import { graphql } from '@stump/graphql'
import upperFirst from 'lodash/upperFirst'

import { useBookClubContext } from '@/components/bookClub'

const query = graphql(`
	query BookClubMembersList($id: ID!, $pagination: Pagination) {
		bookClubById(id: $id) {
			id
			members(pagination: $pagination) {
				nodes {
					id
					avatarUrl
					username
					isCreator
					role
				}
				pageInfo {
					__typename
					... on CursorPaginationInfo {
						currentCursor
						nextCursor
						limit
					}
				}
			}
		}
	}
`)

/**
 * A read-only listing of a book club's members, visible to anyone who can view the club.
 * Cursor-paginated with a "Load more" button (following the same
 * `useInfiniteSuspenseGraphQL` + `fetchNextPage`/`hasNextPage` pattern as
 * `BooksAfterCursor`/`LibrarySeriesGrid`) so clubs with more members than the default
 * page size don't silently truncate the list.
 */
export default function BookClubMembersScene() {
	const { sdk } = useSDK()
	const {
		bookClub: { id, roleSpec },
	} = useBookClubContext()

	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteSuspenseGraphQL(
		query,
		sdk.cacheKey('bookClubById', [id, 'membersList']),
		{
			id,
			pagination: { cursor: { limit: 20 } },
		},
	)

	const members = data.pages.flatMap((page) => page.bookClubById.members.nodes)

	if (!members.length) {
		return (
			<Text size="sm" variant="muted">
				This club doesn&apos;t have any members yet.
			</Text>
		)
	}

	return (
		<div className="gap-3 flex flex-col">
			<Card className="divide-y divide-border">
				{members.map(({ id: memberId, avatarUrl, username, isCreator, role }) => (
					<div key={memberId} className="gap-3 p-3 flex items-center">
						<Avatar src={avatarUrl ?? undefined} fallback={username} />
						<div className="min-w-0 flex flex-col">
							<Text className="truncate">{username}</Text>
							<Text size="sm" variant="muted">
								{isCreator ? 'Creator' : roleSpec[role] || upperFirst(role.toLowerCase())}
							</Text>
						</div>
					</div>
				))}
			</Card>

			{hasNextPage && (
				<Button
					variant="secondary"
					size="sm"
					onClick={() => fetchNextPage()}
					disabled={isFetchingNextPage}
				>
					{isFetchingNextPage ? 'Loading...' : 'Load more'}
				</Button>
			)}
		</div>
	)
}
