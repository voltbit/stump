import { useGraphQLMutation, useRefetch, useSuspenseGraphQL } from '@stump/client'
import { BookClubInvitesScreenQuery, graphql } from '@stump/graphql'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useActiveServer, useStumpServer } from '~/components/activeServer'
import ListEmpty from '~/components/ListEmpty'

const query = graphql(`
	query BookClubInvitesScreen {
		myBookClubInvitations {
			id
			role
			bookClubId
			bookClub {
				name
				description
				membersCount
			}
		}
	}
`)

// $member is only sent when accepting - the server rejects a decline that carries one, and
// rejects an accept that doesn't
const respondMutation = graphql(`
	mutation RespondToBookClubInvitation($id: ID!, $accept: Boolean!, $member: BookClubMemberInput) {
		respondToBookClubInvitation(id: $id, input: { accept: $accept, member: $member }) {
			id
		}
	}
`)

type Invitation = NonNullable<
	NonNullable<BookClubInvitesScreenQuery['myBookClubInvitations']>[number]
>

export default function Screen() {
	const {
		activeServer: { id: serverID },
	} = useActiveServer()
	const { user } = useStumpServer()

	const { data, refetch } = useSuspenseGraphQL(query, ['bookClubInvites', serverID])
	const { mutateAsync: respond } = useGraphQLMutation(respondMutation)

	const invitations: Invitation[] = data?.myBookClubInvitations || []

	const [isRefetching, handleRefetch] = useRefetch(refetch)

	const handleRespond = async (id: string, accept: boolean) => {
		await respond({ id, accept, member: accept && user ? { userId: user.id } : undefined })
		refetch()
	}

	if (!invitations.length) {
		return (
			<SafeAreaView className="flex-1 bg-background">
				<ListEmpty
					title="No pending invites"
					message="You don't have any pending club invitations"
				/>
			</SafeAreaView>
		)
	}

	// TODO(book-club): Implement me
	return null
}
