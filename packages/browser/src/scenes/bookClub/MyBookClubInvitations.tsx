import { useGraphQL, useGraphQLMutation, useSDK } from '@stump/client'
import { Badge, Button, Card, Heading, Text } from '@stump/components'
import { extractErrorMessage, graphql, MyBookClubInvitationsQuery } from '@stump/graphql'
import upperFirst from 'lodash/upperFirst'
import { Check, X } from 'lucide-react'
import pluralize from 'pluralize'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { useAppContext } from '@/context'
import paths from '@/paths'

const query = graphql(`
	query MyBookClubInvitations {
		myBookClubInvitations {
			id
			role
			bookClubId
			bookClub {
				id
				name
				slug
				membersCount
				roleSpec
			}
		}
	}
`)

// $member is only sent when accepting - the server rejects a decline that carries one, and
// rejects an accept that doesn't
const respondMutation = graphql(`
	mutation RespondToMyBookClubInvitation(
		$id: ID!
		$accept: Boolean!
		$member: BookClubMemberInput
	) {
		respondToBookClubInvitation(id: $id, input: { accept: $accept, member: $member }) {
			id
		}
	}
`)

type Invitation = MyBookClubInvitationsQuery['myBookClubInvitations'][number]

/**
 * A widget listing the logged-in user's pending book club invitations, with accept/decline
 * actions. Accepting joins the club (as the invited role) and navigates there; declining just
 * removes the invitation. Rendered on the clubs list scene, above the user's existing clubs.
 */
export default function MyBookClubInvitations() {
	const { sdk } = useSDK()
	const { user } = useAppContext()
	const navigate = useNavigate()

	const { data, error, refetch } = useGraphQL(query, sdk.cacheKey('myBookClubInvitations', []))

	useEffect(() => {
		if (!error) return

		console.error('Error fetching book club invitations:', error)
		toast.error('Failed to load your book club invitations', {
			description: extractErrorMessage(error),
		})
	}, [error])

	const invitations = data?.myBookClubInvitations ?? []

	const [respondingId, setRespondingId] = useState<string | null>(null)

	const { mutate: respond } = useGraphQLMutation(respondMutation, {
		onError: (error) => {
			console.error('Error responding to book club invitation:', error)
			toast.error('Failed to respond to the invitation', {
				description: extractErrorMessage(error),
			})
		},
		onSettled: () => {
			setRespondingId(null)
			refetch()
		},
	})

	const handleAccept = (invitation: Invitation) => {
		setRespondingId(invitation.id)
		respond(
			{ id: invitation.id, accept: true, member: { userId: user.id } },
			{
				onSuccess: () => {
					toast.success(`Joined ${invitation.bookClub.name}`)
					navigate(paths.bookClub(invitation.bookClub.slug))
				},
			},
		)
	}

	const handleDecline = (invitation: Invitation) => {
		setRespondingId(invitation.id)
		respond(
			{ id: invitation.id, accept: false, member: undefined },
			{ onSuccess: () => toast.success('Invitation declined') },
		)
	}

	if (!invitations.length) {
		return null
	}

	return (
		<div className="gap-3 mb-8 flex flex-col">
			<Heading size="xs">Your invitations</Heading>
			{invitations.map((invitation) => {
				const isResponding = respondingId === invitation.id
				const roleLabel =
					invitation.bookClub.roleSpec[invitation.role] || upperFirst(invitation.role.toLowerCase())

				return (
					<Card key={invitation.id} className="gap-3 p-3 flex items-center justify-between">
						<div className="min-w-0">
							<div className="gap-2 flex items-center">
								<Text size="sm" className="font-medium truncate">
									{invitation.bookClub.name}
								</Text>
								<Badge size="xs" className="shrink-0">
									{roleLabel}
								</Badge>
							</div>
							<Text size="xs" variant="muted" className="truncate">
								{pluralize('member', invitation.bookClub.membersCount, true)}
							</Text>
						</div>
						<div className="gap-2 flex shrink-0 items-center">
							<Button
								size="sm"
								variant="secondary"
								onClick={() => handleDecline(invitation)}
								disabled={isResponding}
							>
								<X className="mr-1.5 h-4 w-4" />
								Decline
							</Button>
							<Button size="sm" onClick={() => handleAccept(invitation)} disabled={isResponding}>
								<Check className="mr-1.5 h-4 w-4" />
								Accept
							</Button>
						</div>
					</Card>
				)
			})}
		</div>
	)
}
