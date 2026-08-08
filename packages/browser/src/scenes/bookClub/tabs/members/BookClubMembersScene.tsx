import { useSDK, useSuspenseGraphQL } from '@stump/client'
import { Avatar, Card, Text } from '@stump/components'
import { graphql } from '@stump/graphql'
import upperFirst from 'lodash/upperFirst'

import { useBookClubContext } from '@/components/bookClub'

const query = graphql(`
	query BookClubMembersList($id: ID!) {
		bookClubById(id: $id) {
			id
			members {
				nodes {
					id
					avatarUrl
					displayName
					isCreator
					role
				}
			}
		}
	}
`)

/**
 * A read-only listing of a book club's members, visible to anyone who can view the club
 */
export default function BookClubMembersScene() {
	const { sdk } = useSDK()
	const {
		bookClub: { id, roleSpec },
	} = useBookClubContext()

	const {
		data: {
			bookClubById: {
				members: { nodes: members },
			},
		},
	} = useSuspenseGraphQL(query, sdk.cacheKey('bookClubById', [id, 'membersList']), { id })

	if (!members.length) {
		return (
			<Text size="sm" variant="muted">
				This club doesn&apos;t have any members yet.
			</Text>
		)
	}

	return (
		<Card className="divide-y divide-border">
			{members.map(({ id: memberId, avatarUrl, displayName, isCreator, role }) => (
				<div key={memberId} className="gap-3 p-3 flex items-center">
					<Avatar src={avatarUrl ?? undefined} fallback={displayName} />
					<div className="min-w-0 flex flex-col">
						<Text className="truncate">{displayName}</Text>
						<Text size="sm" variant="muted">
							{isCreator ? 'Creator' : roleSpec[role] || upperFirst(role.toLowerCase())}
						</Text>
					</div>
				</div>
			))}
		</Card>
	)
}
